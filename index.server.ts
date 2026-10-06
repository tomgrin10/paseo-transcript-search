import { displayPreferences } from "./shared/display";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { buildCensus, clearCensusCaches } from "./server/census";
import { getIndexStatus, stopIndexer } from "./server/indexer";
import { abortAllSearches, runSearch } from "./server/search";
import { clearTranscriptCaches } from "./server/transcripts";
import { indexStatus, listHistory, restoreAgent, searchHistory } from "./shared/contracts";
import { restoreArchivedAgent } from "./server/restore-agent";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(displayPreferences);
  server.handle(restoreAgent, async ({ agentId }, { paseo }) => {
    await restoreArchivedAgent(agentId, paseo);
    return { agentId };
  });
  server.handle(listHistory, async () => {
    const census = await buildCensus();
    // Literal search needs no index. Ranked search requests its own sync on demand.
    return census;
  });
  server.handle(searchHistory, (input) => runSearch(input));
  server.handle(indexStatus, () => getIndexStatus());
  return async () => {
    abortAllSearches();
    await stopIndexer();
    clearCensusCaches();
    clearTranscriptCaches();
  };
}
