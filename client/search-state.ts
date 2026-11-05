import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentMatch } from "../shared/contracts";
import type { HighlightQuery } from "../shared/highlight";
import { sourceKey } from "../shared/host-model";
import { EMPTY_FILTERS, type HistoryFilters, countByLabel, countByProject, countByProvider, passesStaticFilters, projectLabel, providerLabel, searchMode, visibleAgents } from "../shared/model";
import { type Cursor, buildResults, cursorsOf, groupResults, reconcileCursor } from "../shared/results";
import type { DropdownOption } from "./dropdown";
import { SNIPPETS_SHOWN } from "./results";
import { useHistory } from "./use-history";
import { useIndexStatus } from "./use-index-status";
import { isSearchable, useHistorySearch } from "./use-search";

/**
 * Filters, host choice and the selected line survive leaving the screen and coming back (it
 * unmounts each time), so opening a session and returning shows the same results.
 */
const persisted: { filters: HistoryFilters; hostIds: ReadonlySet<string>; cursor: Cursor | null } = {
  filters: EMPTY_FILTERS,
  hostIds: new Set(),
  cursor: null,
};

interface Shown { query: string; highlight: HighlightQuery; matches: ReadonlyMap<string, AgentMatch>; ranked: boolean }

/** Everything the search screen derives from the hosts, the filters and the answers. */
export function useSearchState(initialQuery: string | undefined, nowMs: number) {
  const [filters, setFiltersState] = useState<HistoryFilters>(() => (initialQuery ? { ...persisted.filters, query: initialQuery } : persisted.filters));
  const setFilters = useCallback((next: HistoryFilters) => { persisted.filters = next; setFiltersState(next); }, []);
  useEffect(() => { if (initialQuery) setFilters({ ...persisted.filters, query: initialQuery }); }, [initialQuery, setFilters]);
  const [hostIds, setHostIdsState] = useState<ReadonlySet<string>>(() => persisted.hostIds);
  const setHostIds = useCallback((next: ReadonlySet<string>) => { persisted.hostIds = next; setHostIdsState(next); }, []);
  const [cursor, setCursorState] = useState<Cursor | null>(() => persisted.cursor);
  const setCursor = useCallback((next: Cursor | null) => { persisted.cursor = next; setCursorState(next); }, []);

  const history = useHistory();
  const rows = history.rows;
  const hostScope = useCallback((hostId: string | undefined) => hostIds.size === 0 || (hostId !== undefined && hostIds.has(hostId)), [hostIds]);

  const options = useMemo(() => {
    const providers: DropdownOption[] = [...countByProvider(rows).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id, count]) => ({ id, label: providerLabel(id), icon: "Bot", count }));
    const projectCounts = countByProject(rows);
    const multiHost = history.successfulHosts.length > 1;
    const projects: DropdownOption[] = history.data.projects.map((project) => {
      const host = history.hosts.find((candidate) => candidate.serverId === sourceKey(project.projectId).hostId)?.label;
      return { id: project.projectId, label: multiHost && host ? `${projectLabel(project)} · ${host}` : projectLabel(project), icon: project.archivedAt ? "Archive" : "FolderGit2", count: projectCounts.get(project.projectId) ?? 0 };
    }).filter((option) => (option.count ?? 0) > 0).sort((a, b) => a.label.localeCompare(b.label));
    const labels: DropdownOption[] = [...countByLabel(rows).entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([id, count]) => ({ id, label: id, icon: "Tag", count }));
    const hosts: DropdownOption[] = history.successfulHosts.map((host) => ({ id: host.serverId, label: host.label, icon: "Server", count: rows.filter((row) => row.host?.id === host.serverId).reduce((sum, row) => sum + row.agents.length, 0) }));
    return { providers, projects, labels, hosts };
  }, [rows, history.data.projects, history.hosts, history.successfulHosts]);

  const searchable = isSearchable(filters.query);
  // A one-letter query is not a search yet: browse until it is.
  const effective = searchable ? filters : { ...filters, query: "" };
  const inScope = useMemo(() => rows.filter((row) => hostScope(row.host?.id) && passesStaticFilters(row, filters, nowMs)), [rows, filters, nowMs, hostScope]);
  const scopeSessions = useMemo(() => inScope.reduce((sum, row) => sum + visibleAgents(row, filters).length, 0), [inScope, filters]);
  const agentIds = useMemo(() => inScope.flatMap((row) => visibleAgents(row, filters).filter((agent) => agent.transcript.searchable).map((agent) => agent.id)), [inScope, filters]);
  const unsearchable = scopeSessions - agentIds.length;

  const mode = searchMode(filters);
  const searchHosts = useMemo(() => history.successfulHosts.filter((host) => hostScope(host.serverId)), [history.successfulHosts, hostScope]);
  const search = useHistorySearch(searchHosts, { query: filters.query, mode, regex: filters.regex, caseSensitive: filters.caseSensitive, agentIds });
  const indexNote = useIndexStatus(searchHosts, searchable && mode === "ranked");

  // While a new search runs, the last answer stays up (dimmed) instead of the list emptying per keystroke.
  const answered = searchable && !search.waiting && search.matches !== null && search.searchedQuery === filters.query;
  const last = useRef<Shown | null>(null);
  if (answered && search.matches) {
    last.current = { query: filters.query, highlight: { query: filters.query, regex: filters.regex, caseSensitive: filters.caseSensitive, ranked: mode === "ranked" }, matches: search.matches, ranked: search.result?.mode === "ranked" };
  }
  if (!searchable) last.current = null;
  const stale = searchable && !answered && last.current !== null;
  const shown: Shown | null = answered ? last.current : stale ? last.current : null;
  const shownFilters = shown ? { ...effective, query: shown.query } : effective;

  const results = useMemo(() => buildResults(rows, shownFilters, { nowMs, matches: shown?.matches ?? (searchable ? new Map() : null), ranked: shown?.ranked ?? false, hostIds })
    .filter((result) => result.match !== null || !search.failedAgentIds.has(result.key) || !searchable), [rows, shownFilters.query, filters, nowMs, shown, hostIds, searchable, search.failedAgentIds]);
  const groups = useMemo(() => groupResults(results, nowMs, shown?.ranked ?? false), [results, nowMs, shown?.ranked]);
  const cursors = useMemo(() => cursorsOf(groups, SNIPPETS_SHOWN), [groups]);
  const current = reconcileCursor(cursors, cursor);
  const selected = current ? results.find((result) => result.key === current.key) ?? null : null;
  const regexError = filters.regex && searchable && search.hostStates.length > 0 && search.hostStates.every((host) => host.state === "failed") ? search.hostStates[0]?.message ?? null : null;

  return {
    filters, setFilters, hostIds, setHostIds, cursor: current, setCursor, history, options,
    searchable, search, indexNote, results, groups, cursors, selected, stale,
    highlight: shown?.highlight ?? (searchable ? { query: filters.query, regex: filters.regex, caseSensitive: filters.caseSensitive, ranked: mode === "ranked" } : null),
    shownQuery: shown?.query ?? null, scopeSessions, searchableSessions: agentIds.length, unsearchable, regexError,
    scopeHostLabels: searchHosts.map((host) => host.label),
    reset: () => { setFilters(EMPTY_FILTERS); setHostIds(new Set()); },
  };
}
export type SearchState = ReturnType<typeof useSearchState>;
