import { contributeDisplay } from "./client/display";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { HistorySurface } from "./client/history-surface";
import { registerHost } from "./client/federation";

/**
 * Contribution ids must match `^[a-z][a-z0-9-]*$`. A surface opened from the Command Center is
 * titled with the surface id, so it stays readable.
 */
const SURFACE_ID = "transcript-search";

export default function contribute(client: PluginClientContext) {
  const releaseHost = registerHost(client);
  client.addSurface(SURFACE_ID, HistorySurface);
  client.addCommandCenterItem({
    id: "search-transcripts",
    title: "Search all session transcripts",
    icon: "Search",
    keywords: ["transcript", "search", "text", "history", "archived", "agents", "grep", "conversation", "sessions"],
    context: "global",
    onSelect({ openSurface }) { openSurface(SURFACE_ID); },
  });
  const releaseDisplay = contributeDisplay(client, { id: "history", title: "Transcript Search", icon: "Search", surface: SURFACE_ID });
  return () => { releaseDisplay(); releaseHost(); };
}
