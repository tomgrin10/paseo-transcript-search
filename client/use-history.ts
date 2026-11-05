import { useQueries } from "@tanstack/react-query";
import { useHosts } from "@getpaseo/plugin/client";
import { useSyncExternalStore } from "react";
import { listHistory } from "../shared/contracts";
import { scopeHistory } from "../shared/host-model";
import { federation, hostAvailability, rpcForHost } from "./federation";

/** A host whose history is missing or old, and why. */
export interface HostIssue { id: string; label: string; kind: "offline" | "connecting" | "missing-plugin" | "failed" | "stale"; message?: string }

export function describeIssue(issue: HostIssue): string {
  switch (issue.kind) {
    case "offline": return `${issue.label} is offline, so its sessions aren't included`;
    case "connecting": return `Can't reach ${issue.label} yet, so its sessions aren't included`;
    case "missing-plugin": return `${issue.label} doesn't have Transcript Search, so its sessions aren't included. Install it there`;
    case "stale": return `${issue.label} didn't answer; showing its sessions from the last check`;
    case "failed": return `${issue.label} couldn't list its sessions${issue.message ? `: ${issue.message}` : ""}`;
  }
}

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
  const issues: HostIssue[] = hosts.flatMap((host): HostIssue[] => {
    if (host.status !== "online") return [{ id: host.serverId, label: host.label, kind: host.status === "connecting" ? "connecting" : "offline" }];
    if (!host.ready) return [{ id: host.serverId, label: host.label, kind: "missing-plugin" }];
    const query = queries[ready.findIndex(candidate => candidate.serverId === host.serverId)];
    if (query.isError) return [{ id: host.serverId, label: host.label, kind: query.data ? "stale" : "failed", message: query.error instanceof Error ? query.error.message : undefined }];
    return [];
  });
  const warnings = issues.map(describeIssue);
  return {
    hosts, successfulHosts, warnings, issues,
    data: { projects: scoped.flatMap(item => item.data.projects) },
    rows: scoped.flatMap(item => item.rows).sort((a, b) => b.lastActivityMs - a.lastActivityMs || a.id.localeCompare(b.id)),
    isPending: ready.length > 0 && queries.every(query => query.isPending),
    isFetching: queries.some(query => query.isFetching),
    refetch: () => Promise.allSettled(queries.map(query => query.refetch())),
  };
}
