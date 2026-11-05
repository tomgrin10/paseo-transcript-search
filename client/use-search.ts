import { useQueries } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { type AgentMatch, DEFAULT_PER_AGENT_LIMIT, type SearchMode, searchHistory } from "../shared/contracts";
import { hostKey, mergeSearch, scopeSearch, sourceKey } from "../shared/host-model";
import { searchAll } from "../shared/search-all";
import { rpcForHost, type SearchHost } from "./federation";

/** Short enough to feel live, long enough not to start a grep per keystroke. */
const DEBOUNCE_MS = 250;
export const MIN_QUERY_LENGTH = 2;
export function isSearchable(query: string): boolean { return query.trim().length >= MIN_QUERY_LENGTH; }

/** How one host's part of a search went. `partial` hit the output cap; results are incomplete. */
export interface HostSearchState {
  id: string; label: string;
  state: "searching" | "done" | "partial" | "failed";
  /** Sessions with a match on this host. */
  count: number;
  /** Sessions asked about on this host. */
  sessions: number;
  message?: string;
  fallback?: boolean;
  relaxed?: boolean;
}

export interface SearchOptions {
  query: string; mode: SearchMode; regex: boolean; caseSensitive: boolean;
  /** Host-qualified IDs kept by static filters and with retained transcripts. */
  agentIds: readonly string[];
}

export function useHistorySearch(hosts: readonly SearchHost[], options: SearchOptions) {
  const clientKey = useRef(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`).current;
  const [debouncedQuery, setDebouncedQuery] = useState(options.query);
  useEffect(() => {
    if (options.query === debouncedQuery) return;
    const timer = setTimeout(() => setDebouncedQuery(options.query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [debouncedQuery, options.query]);
  const flush = useCallback(() => setDebouncedQuery(options.query), [options.query]);
  const enabled = isSearchable(debouncedQuery);
  const targets = hosts.flatMap(host => {
    const ids = options.agentIds.flatMap(key => { const source = sourceKey(key); return source.hostId === host.serverId ? [source.id] : []; });
    return ids.length ? [{ ...host, ids }] : [];
  });
  const queries = useQueries({ queries: targets.map(host => ({
    queryKey: ["agents-history", "search", host.serverId, host.generation, debouncedQuery, options.mode, options.regex, options.caseSensitive, host.ids] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const result = await searchAll(input => rpcForHost(host.serverId)(searchHistory, input), {
        query: debouncedQuery, mode: options.mode, regex: options.regex, caseSensitive: options.caseSensitive,
        agentIds: host.ids, perAgentLimit: DEFAULT_PER_AGENT_LIMIT, clientKey,
      }, signal);
      if (result.error?.code === "busy" || result.error?.code === "superseded") throw new Error(result.error.message);
      return scopeSearch(host.serverId, result);
    },
    enabled,
    staleTime: 60_000,
    // grep stood in while the index was empty: ask again until the ranked answer is there.
    refetchInterval: (query: { state: { data?: { fallback?: string } } }) => (query.state.data?.fallback === "index-empty" ? 3_000 : false),
    retry: 1,
    retryDelay: 1_000,
  })) });
  // Never show the previous text's results or a disconnected host's cached matches.
  const current = enabled && options.query === debouncedQuery;
  const answers = current ? queries.flatMap(query => query.data ? [query.data] : []) : [];
  const result = answers.length ? mergeSearch(answers) : null;
  const pending = enabled && queries.some(query => query.isPending || query.isFetching);
  // While a host is answering, suppress metadata-only rows on that host. Completed hosts render immediately.
  const matches = enabled ? new Map<string, AgentMatch>(answers.flatMap(answer => answer.matches.map(match => [match.agentId, match] as const))) : null;
  const warnings = targets.flatMap((host, index) => {
    if (!enabled) return [];
    const query = queries[index];
    if (query.isError) return [`${host.label}: search failed; retry with Refresh`];
    const answer = query.data;
    if (!answer) return [];
    const notes = [];
    if (answer.error) notes.push(answer.error.message);
    if (answer.outputTruncated) notes.push("results cut short");
    if (answer.fallback) notes.push("grep answered while the index is unavailable");
    if (answer.relaxed) notes.push("showing matches for any word");
    return notes.length ? [`${host.label}: ${notes.join("; ")}`] : [];
  });
  const hostStates: HostSearchState[] = targets.map((host, index) => {
    const query = queries[index];
    const answer = current ? query.data : undefined;
    if (!enabled || !current) return { id: host.serverId, label: host.label, state: "searching", count: 0, sessions: host.ids.length };
    if (query.isError) return { id: host.serverId, label: host.label, state: "failed", count: 0, sessions: host.ids.length, message: query.error instanceof Error ? query.error.message : undefined };
    if (answer?.error) return { id: host.serverId, label: host.label, state: "failed", count: answer.matches.length, sessions: host.ids.length, message: answer.error.message };
    if (!answer || query.isFetching) return { id: host.serverId, label: host.label, state: "searching", count: answer?.matches.length ?? 0, sessions: host.ids.length };
    return { id: host.serverId, label: host.label, state: answer.outputTruncated ? "partial" : "done", count: answer.matches.length, sessions: host.ids.length, ...(answer.fallback ? { fallback: true } : {}), ...(answer.relaxed ? { relaxed: true } : {}) };
  });
  const completedHosts = enabled ? queries.filter(query => query.isSuccess && !query.data?.error).length : 0;
  const missingHosts = enabled ? targets.filter((_, index) => !queries[index].data || queries[index].isError).map(host => host.serverId) : [];
  const failedAgentIds = new Set(targets.flatMap(host => missingHosts.includes(host.serverId) ? host.ids.map(id => hostKey(host.serverId, id)) : []));
  return {
    matches, result, warnings, failedAgentIds, hostStates, searchedQuery: current ? debouncedQuery : null, completedHosts, targetHosts: targets.length,
    waiting: isSearchable(options.query) && (options.query !== debouncedQuery || pending),
    error: current && result === null && warnings.length ? warnings.join(" · ") : null, flush,
    refetch: () => Promise.allSettled(queries.filter(query => enabled).map(query => query.refetch())),
  };
}
