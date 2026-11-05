import { defineAgentTool, type PluginServerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { buildCensus } from "./census";
import { runSearch } from "./search";
import { EXCERPT_MAX_RADIUS, MAX_SEARCH_AGENTS } from "../shared/contracts";
import { registerAgentTools } from "./agent-tools";
import { excerptForAgent } from "./excerpt";
import { messagesAsText, serverId, sessionHeading, sessionIndex } from "./sessions";

export function contributeAgentTools(server: PluginServerContext) {
  return registerAgentTools(server, [defineAgentTool({
    name: "transcript_search_conversations", description: "Search active and archived conversation transcripts on this host. Defaults to this workspace; choose project or host only when broader history is needed. Returns bounded matching snippets with each session's title, workspace and line numbers; read the turns around a line with transcript_read_conversation. Never restores or starts agents.",
    input: z.object({ query: z.string().min(1).max(500), scope: z.enum(["workspace", "project", "host"]).default("workspace"), limit: z.number().int().min(1).max(50).default(10) }).strict(),
    async execute({ query, scope, limit }, { agent, signal }) {
      if (signal.aborted) throw new Error("Tool call cancelled.");
      const census = await buildCensus();
      const workspace = census.workspaces.find(w => w.workspaceId === agent.workspaceId);
      const allowed = new Set(census.workspaces.filter(w => scope === "host" || scope === "project" && workspace?.projectId != null && w.projectId === workspace.projectId || scope === "workspace" && w.workspaceId === agent.workspaceId).map(w => w.workspaceId));
      const selected = census.agents.filter(a => a.transcript.searchable && (scope === "host" || a.workspaceId != null && allowed.has(a.workspaceId)));
      const matches = [];
      let searchedAgents = 0, truncated = false;
      for (let offset = 0; offset < selected.length; offset += MAX_SEARCH_AGENTS) {
        if (signal.aborted) throw new Error("Tool call cancelled.");
        const result = await runSearch({ query, mode: "regex", regex: false, caseSensitive: false, agentIds: selected.slice(offset, offset + MAX_SEARCH_AGENTS).map(a => a.id), perAgentLimit: 3 }, signal);
        if (result.error) return { text: result.error.message, isError: true };
        searchedAgents += result.searchedAgents;
        matches.push(...result.matches);
        truncated ||= result.outputTruncated;
        if (matches.length >= limit) { truncated ||= matches.length > limit || offset + MAX_SEARCH_AGENTS < selected.length; break; }
      }
      // Session facts let the agent (and the chat row) say which conversation a hit came from.
      const sessions = sessionIndex(census);
      const described = matches.slice(0, limit).map(match => {
        const info = sessions.get(match.agentId)?.info;
        return info ? { ...match, title: info.title, workspace: info.workspaceLine, provider: info.providerLabel, lastActivityAt: info.lastActivityAt, archived: info.archived } : match;
      });
      const result = { query, matches: described, searchedAgents, selectedAgents: selected.length, outputTruncated: truncated, scope };
      return { text: JSON.stringify(result), structuredContent: result };
    },
  }), defineAgentTool({
    name: "transcript_read_conversation", description: "Read the turns around one line of a conversation transcript on this host, using an agentId and line from transcript_search_conversations (pass its fileName for a subagent line, and the query to centre a long message on it). Without a line, returns how the session started and its last turns. Read-only; never restores or starts agents.",
    input: z.object({ agentId: z.string().min(1), line: z.number().int().positive().optional(), fileName: z.string().min(1).max(300).optional(), query: z.string().min(1).max(500).optional(), radius: z.number().int().min(0).max(EXCERPT_MAX_RADIUS).default(3) }).strict(),
    async execute({ agentId, line, fileName, query, radius }, { signal }) {
      if (signal.aborted) throw new Error("Tool call cancelled.");
      const census = await buildCensus();
      const session = sessionIndex(census).get(agentId);
      if (!session) return { text: "No session with that agentId on this host.", isError: true };
      const excerpt = await excerptForAgent(agentId, fileName, { lineNumber: line, radius, signal, ...(query ? { query } : {}) });
      if (excerpt.error && excerpt.messages.length === 0) return { text: excerpt.error, isError: true };
      const host = await serverId();
      const body = [
        sessionHeading(session.info, agentId, host),
        excerpt.opening ? `It started with:\n\n${messagesAsText([excerpt.opening])}` : null,
        excerpt.messages.length ? `${line === undefined ? "Last turns" : `Around line ${line}`}${excerpt.file === "subagent" ? " (subagent)" : ""}:\n\n${messagesAsText(excerpt.messages, excerpt.target)}` : `Line ${line} holds nothing readable.`,
        excerpt.error ?? null,
      ].filter(Boolean).join("\n\n");
      const result = { agentId, title: session.info.title, workspace: session.info.workspaceLine, line: line ?? null, file: excerpt.file, target: excerpt.target, messages: excerpt.messages, opening: excerpt.opening };
      return { text: body, structuredContent: result };
    },
  })], true);
}
