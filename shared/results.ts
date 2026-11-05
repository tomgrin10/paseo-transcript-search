import type { AgentMatch, AgentSummary } from "./contracts";
import { type DayGroup, type HistoryFilters, type HistoryWorkspace, buildQueryMatcher, dayGroup, parseTime, passesStaticFilters, visibleAgents } from "./model";
import { type SessionInfo, describeSession } from "./session-info";

/**
 * The search screen's view model: one row per session (the thing you open), grouped by recency,
 * or ranked when the index answered. Pure, so the screen and the tests read the same rules.
 */

export interface SessionResult {
  /** Host-scoped agent id. */
  key: string;
  agent: AgentSummary;
  row: HistoryWorkspace;
  host: { id: string; label: string };
  info: SessionInfo;
  activityMs: number;
  match: AgentMatch | null;
  /** Only the session's or workspace's name matched, not anything said. */
  nameMatch: boolean;
}

export interface ResultGroup { label: DayGroup | "Best matches"; results: SessionResult[] }

export interface ResultOptions {
  nowMs: number;
  /** Transcript hits by host-scoped agent id; null before any host answered. */
  matches: ReadonlyMap<string, AgentMatch> | null;
  /** Hosts are still answering: show their name matches only once they did. */
  ranked: boolean;
  /** Hosts selected in the Host filter; empty means all. */
  hostIds?: ReadonlySet<string>;
}

function activityOf(agent: AgentSummary): number {
  return parseTime(agent.lastActivityAt) || parseTime(agent.createdAt);
}

/** Sessions the filters keep, newest first; with a query, only those that matched. */
export function buildResults(rows: readonly HistoryWorkspace[], filters: HistoryFilters, options: ResultOptions): SessionResult[] {
  const matcher = buildQueryMatcher(filters);
  const out: SessionResult[] = [];
  for (const row of rows) {
    if (!row.host) continue;
    if (options.hostIds && options.hostIds.size > 0 && !options.hostIds.has(row.host.id)) continue;
    if (!passesStaticFilters(row, filters, options.nowMs)) continue;
    const workspaceNamed = matcher !== null && [row.workspace.title, row.workspace.displayName, row.workspace.branch].some((field) => Boolean(field) && matcher(field as string));
    for (const agent of visibleAgents(row, filters)) {
      const match = options.matches?.get(agent.id) ?? null;
      const nameMatch = matcher !== null && match === null && (workspaceNamed || matcher(agent.title ?? ""));
      if (matcher !== null && match === null && !nameMatch) continue;
      out.push({ key: agent.id, agent, row, host: row.host, info: describeSession(agent, row.synthetic ? null : row.workspace, row.project), activityMs: activityOf(agent), match, nameMatch });
    }
  }
  out.sort((a, b) => {
    if (options.ranked) {
      const left = a.match?.score, right = b.match?.score;
      if (left !== undefined && right !== undefined && left !== right) return right - left;
      if (left !== undefined && right === undefined) return -1;
      if (right !== undefined && left === undefined) return 1;
    }
    return b.activityMs - a.activityMs || a.key.localeCompare(b.key);
  });
  return out;
}

export function groupResults(results: readonly SessionResult[], nowMs: number, ranked: boolean): ResultGroup[] {
  if (ranked) return results.length ? [{ label: "Best matches", results: [...results] }] : [];
  const groups: ResultGroup[] = [];
  for (const result of results) {
    const label = dayGroup(result.activityMs, nowMs);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.results.push(result);
    else groups.push({ label, results: [result] });
  }
  return groups;
}

/** One stop for the keyboard: a session's match line, or the session itself when it has none. */
export interface Cursor { key: string; snippet: number | null }

export function cursorsOf(groups: readonly ResultGroup[], snippetsShown = 3): Cursor[] {
  const out: Cursor[] = [];
  for (const group of groups) for (const result of group.results) {
    const count = Math.min(result.match?.snippets.length ?? 0, snippetsShown);
    if (count === 0) out.push({ key: result.key, snippet: null });
    else for (let index = 0; index < count; index += 1) out.push({ key: result.key, snippet: index });
  }
  return out;
}

export function sameCursor(a: Cursor | null, b: Cursor | null): boolean {
  return a !== null && b !== null && a.key === b.key && a.snippet === b.snippet;
}

/** Moves by `delta` stops, clamped; from nothing, down starts at the top and up at the bottom. */
export function moveCursor(cursors: readonly Cursor[], current: Cursor | null, delta: number): Cursor | null {
  if (cursors.length === 0) return null;
  const index = current ? cursors.findIndex((cursor) => sameCursor(cursor, current)) : -1;
  if (index === -1) return delta >= 0 ? cursors[0] ?? null : cursors[cursors.length - 1] ?? null;
  return cursors[Math.max(0, Math.min(cursors.length - 1, index + delta))] ?? null;
}

/** Keeps the selection on the same line when results refresh, else the first one. */
export function reconcileCursor(cursors: readonly Cursor[], current: Cursor | null): Cursor | null {
  if (current && cursors.some((cursor) => sameCursor(cursor, current))) return current;
  if (current) {
    const sameSession = cursors.find((cursor) => cursor.key === current.key);
    if (sameSession) return sameSession;
  }
  return cursors[0] ?? null;
}

/** How many filters narrow the search, for "Clear 2 filters". Query and sort are not filters. */
export function activeFilterCount(filters: HistoryFilters, hostIds?: ReadonlySet<string>): number {
  return (filters.archived !== "all" ? 1 : 0) + (filters.providers.size > 0 ? 1 : 0) + (filters.projectIds.size > 0 ? 1 : 0)
    + (filters.labels.size > 0 ? 1 : 0) + (filters.period !== "all" ? 1 : 0) + (hostIds && hostIds.size > 0 ? 1 : 0);
}

export type Suggestion = "clear-filters" | "include-archived" | "ignore-case" | "literal" | "newest";

/** What might find it after a search that found nothing, most likely first. */
export function noResultSuggestions(filters: HistoryFilters, hostIds?: ReadonlySet<string>): Suggestion[] {
  const out: Suggestion[] = [];
  if (filters.archived === "active") out.push("include-archived");
  if (activeFilterCount(filters, hostIds) > (filters.archived === "active" ? 1 : 0)) out.push("clear-filters");
  if (filters.caseSensitive && !(filters.ranked && !filters.regex)) out.push("ignore-case");
  if (filters.regex) out.push("literal");
  return out;
}
