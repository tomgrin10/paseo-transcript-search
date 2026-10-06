import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import { MAX_SEARCH_AGENTS, searchHistory } from "./contracts";

type Input = RpcInput<typeof searchHistory>;
type Output = RpcOutput<typeof searchHistory>;

/** The RPC has a bounded batch size; the surface still searches every selected session. */
export async function searchAll(
  search: (input: Input) => Promise<Output>,
  input: Input,
  signal?: AbortSignal,
): Promise<Output> {
  const merged: Output = { matches: [], searchedAgents: 0, unsearchableAgents: [], durationMs: 0, outputTruncated: false };
  for (let offset = 0; offset < input.agentIds.length; offset += MAX_SEARCH_AGENTS) {
    if (signal?.aborted) throw new Error("Search cancelled.");
    const result = await search({ ...input, agentIds: input.agentIds.slice(offset, offset + MAX_SEARCH_AGENTS) });
    if (signal?.aborted) throw new Error("Search cancelled.");
    merged.matches.push(...result.matches);
    merged.unsearchableAgents.push(...result.unsearchableAgents);
    merged.searchedAgents += result.searchedAgents;
    merged.durationMs += result.durationMs;
    merged.outputTruncated ||= result.outputTruncated;
    merged.mode = result.mode;
    merged.index = result.index;
    merged.fallback = result.fallback ?? merged.fallback;
    merged.relaxed ||= result.relaxed;
    if (result.error) { merged.error = result.error; break; }
  }
  merged.matches.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return merged;
}
