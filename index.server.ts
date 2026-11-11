import { contributeAgentTools } from "./server/native-tools";
import { displayPreferences } from "./shared/display";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { buildCensus, clearCensusCaches } from "./server/census";
import { getIndexStatus, stopIndexer } from "./server/indexer";
import { abortAllSearches, runSearch } from "./server/search";
import { clearTranscriptCaches } from "./server/transcripts";
import { attachItem, attachSearch, hostIdentity, indexStatus, listHistory, readExcerpt, restoreAgent, searchHistory } from "./shared/contracts";
import { attachItemFor, searchAttachments } from "./server/attach";
import { excerptForAgent } from "./server/excerpt";
import { serverId } from "./server/sessions";
import { restoreArchivedAgent } from "./server/restore-agent";

export default function contribute(server: PluginServerContext) {
  const removeTools = contributeAgentTools(server);
  server.registerSettings(displayPreferences);
  server.handle(hostIdentity, async () => ({ serverId: await serverId(), protocol: 1 as const }));
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
  server.handle(readExcerpt, ({ agentId, fileName, ...options }) => excerptForAgent(agentId, fileName, options));
  server.handle(attachSearch, ({ query }) => searchAttachments(query));
  server.handle(attachItem, (input) => attachItemFor(input));
  return async () => {
    removeTools();
    abortAllSearches();
    await stopIndexer();
    clearCensusCaches();
    clearTranscriptCaches();
  };
}
