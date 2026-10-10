import type { HistoryList, SearchResult } from "./contracts";
import { buildWorkspaces } from "./model";

/** Tuple encoding is collision-free even when hosts have copied session/project IDs. */
export function hostKey(hostId: string, id: string): string { return JSON.stringify([hostId, id]); }
export function sourceKey(key: string): { hostId: string; id: string } {
  const value: unknown = JSON.parse(key);
  if (!Array.isArray(value) || value.length !== 2 || !value.every(part => typeof part === "string")) throw new Error("Invalid host-scoped session ID");
  return { hostId: value[0], id: value[1] };
}

export function scopeHistory(host: { serverId: string; label: string }, data: HistoryList) {
  const key = (id: string) => hostKey(host.serverId, id);
  const scoped: HistoryList = {
    ...data,
    projects: data.projects.map(project => ({ ...project, projectId: key(project.projectId) })),
    workspaces: data.workspaces.map(workspace => ({ ...workspace, workspaceId: key(workspace.workspaceId), projectId: workspace.projectId === null ? null : key(workspace.projectId) })),
    agents: data.agents.map(agent => ({ ...agent, id: key(agent.id), workspaceId: agent.workspaceId === null ? null : key(agent.workspaceId) })),
  };
  return {
    data: scoped,
    rows: buildWorkspaces(scoped).map(row => ({ ...row, id: key(row.id), host: { id: host.serverId, label: host.label } })),
  };
}

export function scopeSearch(hostId: string, result: SearchResult): SearchResult {
  return { ...result, matches: result.matches.map(match => ({ ...match, agentId: hostKey(hostId, match.agentId) })), unsearchableAgents: result.unsearchableAgents.map(id => hostKey(hostId, id)) };
}

export function mergeSearch(results: readonly SearchResult[]): SearchResult {
  const modes = new Set(results.map(result => result.mode));
  return {
    matches: results.flatMap(result => result.matches),
    searchedAgents: results.reduce((sum, result) => sum + result.searchedAgents, 0),
    unsearchableAgents: results.flatMap(result => result.unsearchableAgents),
    durationMs: Math.max(0, ...results.map(result => result.durationMs)),
    outputTruncated: results.some(result => result.outputTruncated),
    // Mixed index/grep scores cannot be compared: preserve native chronological grouping.
    mode: modes.size === 1 && modes.has("ranked") ? "ranked" : "regex",
    relaxed: results.some(result => result.relaxed),
  };
}
