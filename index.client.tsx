import type { PluginClientContext, PluginScreenProps } from "@getpaseo/plugin/client";
import { attachSearch } from "./shared/contracts";
import { contributeChat } from "./client/chat";
import { contributeDisplay } from "./client/display";
import { registerHost } from "./client/federation";
import { SEARCH_SCREEN, SearchScreen } from "./client/search-screen";

export default function contribute(client: PluginClientContext) {
  const releaseHost = registerHost(client);
  const openSettings = () => client.openSettings("display");
  const Screen = (props: PluginScreenProps) => <SearchScreen {...props} openSettings={openSettings} />;
  const removers = [
    client.addScreen({ id: SEARCH_SCREEN, title: "Transcript Search", Component: Screen }),
    client.addCommandCenterItem({
      id: "search-transcripts",
      title: "Search all session transcripts",
      icon: "TextSearch",
      keywords: ["transcript", "search", "text", "history", "archived", "agents", "grep", "conversation", "sessions", "recall", "past"],
      context: "global",
      onSelect({ openScreen }) { openScreen({ screenId: SEARCH_SCREEN }); },
    }),
    client.addSlashCommand({
      name: "recall",
      description: "Search what was said in past sessions",
      argumentHint: "webhook retries",
      context: "agent",
      onSubmit({ args, openScreen }) {
        const query = args.trim();
        openScreen(query ? { screenId: SEARCH_SCREEN, params: { q: query } } : { screenId: SEARCH_SCREEN });
      },
    }),
    // The composer's + menu: Paseo draws the picker and the pill; this host answers the search.
    client.addAttachmentSource({
      id: "past-conversation",
      title: "Past conversation",
      icon: "History",
      pickerTitle: "Attach a past conversation",
      searchPlaceholder: "Search what was said…",
      search: attachSearch,
    }),
    contributeChat(client),
  ];
  const releaseDisplay = contributeDisplay(client);
  return () => {
    for (const remove of removers) if (typeof remove === "function") void remove();
    releaseDisplay();
    releaseHost();
  };
}
