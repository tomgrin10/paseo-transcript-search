import type { PluginClientContext, PluginSidebarItemProps, PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsSection, SettingsSwitch, SidebarRow } from "@getpaseo/plugin/client/ui";
import { useEffect } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { displayPreferences, displayRpc } from "../shared/display";
import { recentSearches, useRecentSearches } from "./recent";
import { SEARCH_SCREEN } from "./search-screen";
import { sidebarVisibility } from "./sidebar-visibility";

const listeners = new Set<(visible: boolean) => void>();

/** Settings → Plugins → Transcript Search → Display. The host draws the header and scrolling. */
function DisplaySettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(displayPreferences);
  const recent = useRecentSearches();
  const visible = settings.status === "ready" ? settings.values.showSidebar : undefined;
  useEffect(() => {
    if (visible !== undefined) for (const listener of listeners) listener(visible);
  }, [visible]);

  if (settings.status === "loading") return <ActivityIndicator accessibilityLabel="Loading display settings" color={theme.colors.foregroundMuted} />;
  if (settings.status !== "ready") return (
    <View style={{ gap: 12, paddingVertical: 16 }}>
      <Text style={{ color: theme.colors.statusDanger }}>{settings.error}</Text>
      <SettingsCard>
        <SettingsAction label="Try loading the saved settings again" actionLabel="Retry" onPress={() => void settings.reload()} />
        {settings.status === "invalid" && <SettingsAction label="Replace invalid display settings with defaults" actionLabel="Reset" disabled={settings.saving} onPress={() => void settings.reset()} />}
      </SettingsCard>
      {settings.saveError && <Text style={{ color: theme.colors.statusDanger }}>{settings.saveError}</Text>}
    </View>
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 24 }}>
      <SettingsSection title="Where Transcript Search appears" info="⌘K (Ctrl+K) Search all session transcripts and /recall work whatever you hide here.">
        <SettingsCard>
          <SettingsSwitch
            label="Sidebar row"
            hint="Transcript Search in the sidebar. Opens the search screen."
            value={settings.values.showSidebar}
            disabled={settings.saving}
            onValueChange={(showSidebar) => void settings.save({ ...settings.values, showSidebar }, settings.revision)}
          />
        </SettingsCard>
        {settings.saveError && <Text accessibilityRole="alert" style={{ color: theme.colors.statusDanger }}>{settings.saveError}</Text>}
      </SettingsSection>
      <SettingsSection title="Recent searches">
        <SettingsCard>
          <SettingsAction
            label={recent.length === 0 ? "None on this device" : `${recent.length} on this device`}
            hint="Kept in this app only, never sent to a host."
            actionLabel="Clear"
            disabled={recent.length === 0}
            onPress={() => recentSearches.clear()}
          />
        </SettingsCard>
      </SettingsSection>
    </ScrollView>
  );
}

function SearchSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return <SidebarRow icon="TextSearch" active={currentScreen?.screenId === SEARCH_SCREEN} onPress={() => openScreen({ screenId: SEARCH_SCREEN })} />;
}

/** Settings notifications reach mounted screens; poll for changes made on other clients. */
export function contributeDisplay(client: PluginClientContext) {
  const sidebar = sidebarVisibility(() => client.addSidebarHeaderItem({ id: "transcript-search", title: "Transcript Search", Component: SearchSidebarItem }));
  // Paseo 0.10.1 memoizes sidebar route resolution when an installation mounts.
  // Register synchronously, then reconcile the saved preference, so that an
  // already-open sidebar route can resolve its screen during that first render.
  sidebar.set(true);
  const removeSettings = client.addSettingsScreen({ id: "display", title: "Display", icon: "PanelLeft", Component: DisplaySettings });
  const removeCommand = client.addCommandCenterItem({
    id: "display-settings",
    title: "Transcript Search: settings",
    icon: "Settings",
    keywords: ["Transcript Search", "sidebar", "show", "hide", "display", "settings", "recent"],
    context: "global",
    onSelect({ openSettings }) { openSettings("display"); },
  });
  let disposed = false;
  let pending = false;
  let generation = 0;
  const update = (visible: boolean) => { generation += 1; sidebar.set(visible); };
  listeners.add(update);
  const refresh = async () => {
    if (disposed || pending) return;
    pending = true;
    const currentGeneration = generation;
    try {
      const result = await client.rpc(displayRpc.read, {});
      if (!disposed && generation === currentGeneration && result.status === "ready") {
        const parsed = displayPreferences.schema.safeParse(result.values);
        if (parsed.success) sidebar.set(parsed.data.showSidebar);
      }
    } catch {
      // Retain the last valid preference through temporary disconnects.
    } finally { pending = false; }
  };
  void refresh();
  const timer = setInterval(() => void refresh(), 5000);
  return () => {
    disposed = true;
    clearInterval(timer);
    listeners.delete(update);
    sidebar.dispose();
    removeSettings();
    removeCommand();
  };
}
