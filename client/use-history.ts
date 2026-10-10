import { useQueries } from "@tanstack/react-query";
import { useHosts } from "@getpaseo/plugin/client";
import { useSyncExternalStore } from "react";
import { listHistory } from "../shared/contracts";
import { scopeHistory } from "../shared/host-model";
import { federation, hostAvailability, rpcForHost } from "./federation";

export function historyQueryKey(hostId: string) { return ["agents-history", "list", hostId] as const; }

export function useHistory() {
  const inventory = useHosts();
  useSyncExternalStore(federation.subscribe, federation.snapshot, federation.snapshot);
  const hosts = hostAvailability(inventory);
  const ready = hosts.filter(host => host.ready);
  const queries = useQueries({ queries: ready.map(host => ({
    queryKey: [...historyQueryKey(host.serverId), host.generation],
    queryFn: () => rpcForHost(host.serverId)(listHistory, {}),
    refetchInterval: 30_000,
    retry: 1,
  })) });
  const scoped = queries.flatMap((query, index) => query.data ? [scopeHistory(ready[index], query.data)] : []);
  const successfulHosts = ready.filter((_, index) => Boolean(queries[index].data));
  const warnings = hosts.flatMap(host => {
    if (host.status !== "online") return [`${host.label}: ${host.status === "connecting" ? "connecting" : "disconnected"}`];
    if (!host.ready) return [`${host.label}: install or update Transcript Search`];
    const query = queries[ready.findIndex(candidate => candidate.serverId === host.serverId)];
    if (query.isError) return [`${host.label}: could not load transcripts${query.data ? " (showing saved history)" : ""}`];
    return [];
  });
  return {
    hosts, successfulHosts, warnings,
    data: { projects: scoped.flatMap(item => item.data.projects) },
    rows: scoped.flatMap(item => item.rows).sort((a, b) => b.lastActivityMs - a.lastActivityMs || a.id.localeCompare(b.id)),
    isPending: ready.length > 0 && queries.every(query => query.isPending),
    isFetching: queries.some(query => query.isFetching),
    refetch: () => Promise.allSettled(queries.map(query => query.refetch())),
  };
}
