import { useQueries } from "@tanstack/react-query";
import { indexStatus } from "../shared/contracts";
import { rpcForHost, type SearchHost } from "./federation";

export function useIndexStatus(hosts: readonly SearchHost[], enabled: boolean) {
  const queries = useQueries({ queries: hosts.map(host => ({
    queryKey: ["agents-history", "index-status", host.serverId, host.generation] as const,
    queryFn: () => rpcForHost(host.serverId)(indexStatus, {}),
    enabled,
    retry: 1,
    refetchInterval: 5_000,
  })) });
  if (!enabled) return null;
  return queries.flatMap((query, index) => {
    const status = query.data;
    if (!status) return [];
    const host = hosts[index];
    if (!status.available) return [`${host.label}: index unavailable; using grep`];
    if (status.lastError) return [`${host.label}: index sync failed`];
    if (status.state !== "idle" || status.stale) return [`${host.label}: indexing ${status.indexedFiles} of ${status.totalFiles} files`];
    return [];
  }).join(" · ") || null;
}
