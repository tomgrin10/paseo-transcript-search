import type { PluginAttachmentItem } from "@getpaseo/plugin";
import { type AgentMatch, MAX_SEARCH_AGENTS, type Snippet } from "../shared/contracts";
import { shortDate } from "../shared/model";
import type { SessionInfo } from "../shared/session-info";
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
export function matchWindow(snippet: Snippet, titleLength = 0): string {
  const flat = (text: string) => text.replace(/\s+/g, " ");
  const before = flat(snippet.before).trimStart(), after = flat(snippet.after).trimEnd();
  // The picker shows the subtitle in what the title leaves of a fixed width: after a long title,
  // start at the match itself; otherwise keep a word or two before it.
  const room = titleLength > 28 ? 0 : 10;
  const lead = before.length > room ? `…${room ? before.slice(-room).replace(/^\S*\s/, "") : ""}` : before;
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
    if (session) items.push(await itemFor(agentId, session.info, host, { query, regex: false, caseSensitive: false }, match, signal));
  }
  return { items };
}

/** How the session was searched; the excerpt centres a long message on it. */
interface SearchUsed {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
}

/** One session as the "+" menu attaches it: a picker row, and the text the agent receives. */
async function itemFor(agentId: string, info: SessionInfo, host: string, search: SearchUsed, match: AgentMatch | null, signal?: AbortSignal): Promise<PluginAttachmentItem> {
  const first = match?.snippets[0];
  const when = shortDate(info.lastActivityAt, Date.now());
  const subtitle = [first ? `“${matchWindow(first, info.title.length)}”` : null, info.workspaceTitle ?? info.projectName, info.providerLabel, when].filter(Boolean).join(" · ");
  return {
    id: agentId,
    // The picker row reads `${identifier} ${title}`: a date there runs into the title.
    identifier: "",
    title: info.title,
    subtitle: trimTo(subtitle, 180),
    url: `https://app.paseo.sh/h/${encodeURIComponent(host)}/agent/${encodeURIComponent(agentId)}`,
    text: await attachmentText(agentId, host, sessionHeading(info, agentId, host), search, match, signal),
    resourceType: "conversation",
  };
}

export interface AttachItemInput extends SearchUsed {
  agentId: string;
  snippet?: Snippet;
  hitCount?: number;
}

/**
 * The search screen's "Attach to <session>": the item the "+" menu would attach for this session,
 * built around the previewed line, so both paths hand the agent the same thing.
 */
export async function attachItemFor(input: AttachItemInput, signal?: AbortSignal): Promise<{ item: PluginAttachmentItem }> {
  const census = await buildCensus();
  const session = sessionIndex(census).get(input.agentId);
  if (!session) throw new Error("That session is not on this host any more.");
  const match: AgentMatch | null = input.snippet
    ? { agentId: input.agentId, snippets: [input.snippet], truncated: false, hitCount: Math.max(1, input.hitCount ?? 1) }
    : null;
  const search = { query: input.query.trim(), regex: input.regex, caseSensitive: input.caseSensitive };
  return { item: await itemFor(input.agentId, session.info, await serverId(), search, match, signal) };
}

/** What the agent receives: who and where, then the matched lines in their turns, or the last turns. */
async function attachmentText(agentId: string, host: string, heading: string, search: SearchUsed, match: AgentMatch | null, signal?: AbortSignal): Promise<string> {
  const parts = ["A past Paseo conversation, attached from Transcript Search.", heading];
  const searchOptions = { ...search, signal };
  if (match && match.snippets.length > 0) {
    const shown = match.snippets.length === 1 && match.hitCount > 1 ? `One of ${match.hitCount} lines matching` : "Lines matching";
    parts.push(search.query ? `${shown} "${search.query}"${shown === "Lines matching" ? ` (${match.hitCount} in total)` : ""}:` : "The line the attachment points at:");
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
