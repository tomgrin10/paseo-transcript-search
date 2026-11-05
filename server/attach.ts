import type { PluginAttachmentItem } from "@getpaseo/plugin";
import { type AgentMatch, MAX_SEARCH_AGENTS, type Snippet } from "../shared/contracts";
import { shortDate } from "../shared/model";
import { buildCensus } from "./census";
import { excerptForAgent } from "./excerpt";
import { runSearch } from "./search";
import { messagesAsText, serverId, sessionHeading, sessionIndex } from "./sessions";

/**
 * The composer "+" menu's **Past conversation** source. Paseo draws the picker and the pill and
 * sends `text` to the agent; this host answers with its own sessions only, because that is where
 * the agent asking can also read them. An empty query lists recent sessions; a query runs the same
 * literal, case-insensitive grep the screen uses.
 */

const MAX_ITEMS = 15;
const MAX_TEXT = 12_000;
const MIN_QUERY = 2;

/**
 * The matched words with a little on each side. Paseo's picker filters its rows again by what was
 * typed (label, then subtitle), so the subtitle has to carry the match itself or the row is hidden.
 */
export function matchWindow(snippet: Snippet): string {
  const flat = (text: string) => text.replace(/\s+/g, " ");
  const before = flat(snippet.before).trimStart(), after = flat(snippet.after).trimEnd();
  const lead = before.length > 22 ? `…${before.slice(-22).replace(/^\S*\s/, "")}` : before;
  const tail = after.length > 48 ? `${after.slice(0, 48).replace(/\s\S*$/, "")}…` : after;
  return `${lead}${flat(snippet.match)}${tail}`.trim();
}

function oneLine(snippet: Snippet): string {
  return `${snippet.before}${snippet.match}${snippet.after}`.replace(/\s+/g, " ").trim();
}

function trimTo(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

export async function searchAttachments(rawQuery: string, signal?: AbortSignal): Promise<{ items: PluginAttachmentItem[] }> {
  const query = rawQuery.trim();
  const census = await buildCensus();
  const sessions = sessionIndex(census);
  const host = await serverId();
  const byRecency = census.agents
    .filter((agent) => agent.transcript.searchable)
    .sort((a, b) => (Date.parse(b.lastActivityAt ?? b.createdAt) || 0) - (Date.parse(a.lastActivityAt ?? a.createdAt) || 0));

  let chosen: { agentId: string; match: AgentMatch | null }[];
  if (query.length < MIN_QUERY) {
    chosen = byRecency.slice(0, MAX_ITEMS).map((agent) => ({ agentId: agent.id, match: null }));
  } else {
    const matches = new Map<string, AgentMatch>();
    for (let offset = 0; offset < byRecency.length && matches.size < MAX_ITEMS; offset += MAX_SEARCH_AGENTS) {
      const result = await runSearch({ query, mode: "regex", regex: false, caseSensitive: false, agentIds: byRecency.slice(offset, offset + MAX_SEARCH_AGENTS).map((agent) => agent.id), perAgentLimit: 3 }, signal);
      if (result.error) throw new Error(result.error.message);
      for (const match of result.matches) matches.set(match.agentId, match);
    }
    chosen = byRecency.filter((agent) => matches.has(agent.id)).slice(0, MAX_ITEMS).map((agent) => ({ agentId: agent.id, match: matches.get(agent.id) ?? null }));
  }

  const items: PluginAttachmentItem[] = [];
  for (const { agentId, match } of chosen) {
    const session = sessions.get(agentId);
    if (!session) continue;
    const { info } = session;
    const first = match?.snippets[0];
    const subtitle = [first ? `“${matchWindow(first)}”` : null, info.workspaceTitle ?? info.projectName, info.providerLabel].filter(Boolean).join(" · ");
    items.push({
      id: agentId,
      identifier: shortDate(info.lastActivityAt, Date.now()),
      title: info.title,
      subtitle: trimTo(subtitle, 180),
      url: `https://app.paseo.sh/h/${encodeURIComponent(host)}/agent/${encodeURIComponent(agentId)}`,
      text: await attachmentText(agentId, host, sessionHeading(info, agentId, host), query, match, signal),
      resourceType: "conversation",
    });
  }
  return { items };
}

/** What the agent receives: who and where, then the matched lines in their turns, or the last turns. */
async function attachmentText(agentId: string, host: string, heading: string, query: string, match: AgentMatch | null, signal?: AbortSignal): Promise<string> {
  const parts = ["A past Paseo conversation, attached from Transcript Search.", heading];
  const searchOptions = { query, regex: false, caseSensitive: false, signal };
  if (match && match.snippets.length > 0) {
    parts.push(`Lines matching "${query}" (${match.hitCount} in total):`);
    const printed = new Set<string>();
    for (const snippet of match.snippets.slice(0, 2)) {
      const excerpt = await excerptForAgent(agentId, snippet.fileName, { ...searchOptions, lineNumber: snippet.lineNumber, radius: 2 });
      const where = snippet.file === "subagent" ? " in a subagent" : "";
      // Two matches close together share their context: print each message once.
      const fresh = excerpt.messages.map((message, index) => ({ message, index })).filter(({ message }) => !printed.has(`${snippet.fileName}:${message.line}`));
      for (const { message } of fresh) printed.add(`${snippet.fileName}:${message.line}`);
      const target = fresh.findIndex(({ index }) => index === excerpt.target);
      if (fresh.length) parts.push(`Around line ${snippet.lineNumber}${where}:\n\n${messagesAsText(fresh.map(({ message }) => message), target === -1 ? null : target)}`);
      else if (excerpt.messages.length === 0) parts.push(`Line ${snippet.lineNumber}${where}: ${oneLine(snippet)}`);
    }
  } else {
    const digest = await excerptForAgent(agentId, undefined, { radius: 3, signal });
    if (digest.opening) parts.push(`It started with:\n\n${messagesAsText([digest.opening])}`);
    if (digest.messages.length) parts.push(`Its last turns:\n\n${messagesAsText(digest.messages)}`);
  }
  parts.push(`The full transcript stays on host ${host}. With Paseo tools enabled, read more with transcript_read_conversation (agentId "${agentId}", line).`);
  return trimTo(parts.join("\n\n"), MAX_TEXT);
}
