import { useQuery } from "@tanstack/react-query";
import { readExcerpt } from "../shared/contracts";
import type { HighlightQuery } from "../shared/highlight";
import { sourceKey } from "../shared/host-model";
import { rpcForHost } from "./federation";

export interface ExcerptTarget {
  /** Host-scoped agent id. */
  key: string;
  hostId: string;
  fileName?: string;
  lineNumber?: number;
}

/** The turns around a match (or a session's opening and last turns) from the session's own host. */
export function useExcerpt(target: ExcerptTarget | null, query: HighlightQuery | null, radius = 3) {
  const agentId = target ? sourceKey(target.key).id : "";
  return useQuery({
    queryKey: ["agents-history", "excerpt", target?.hostId ?? "", agentId, target?.fileName ?? "", target?.lineNumber ?? 0, radius, query?.query ?? "", query?.regex ?? false, query?.caseSensitive ?? false] as const,
    queryFn: () => rpcForHost(target!.hostId)(readExcerpt, {
      agentId,
      ...(target?.fileName ? { fileName: target.fileName } : {}),
      ...(target?.lineNumber ? { lineNumber: target.lineNumber } : {}),
      radius,
      ...(query && query.query.trim() ? { query: query.query, regex: query.regex, caseSensitive: query.caseSensitive } : {}),
    }),
    enabled: target !== null,
    staleTime: 60_000,
    retry: 1,
    // Moving between lines of one session keeps its text up while the next excerpt loads.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[3] === agentId ? previous : undefined),
  });
}
