import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import type { PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon, ScrollView } from "@getpaseo/plugin/client/ui";
import { TOOL_ROW_KIND, ToolRowSchema, rowLine, toolRow, type ToolRow } from "../shared/chat";
import { Marked, type Theme } from "./kit";
import { mono, tabular } from "./theme";

const ROLE: Record<string, string> = { user: "User", assistant: "Agent", tool: "Tool", other: "Note" };

function Detail({ row, theme }: { row: ToolRow; theme: Theme }) {
  const c = theme.colors;
  const body = { color: c.foreground, fontSize: 13, lineHeight: 19, ...tabular };
  const meta = { color: c.foregroundMuted, fontSize: 12, lineHeight: 17, ...tabular };
  if (row.state === "failed") return <Text selectable style={[body, { color: c.statusDanger }]}>{row.error || "The tool reported an error."}</Text>;
  if (row.tool === "search") {
    const query = { query: row.query, regex: false, caseSensitive: false, ranked: false };
    return <View style={{ gap: 12 }}>
      {row.sessions.map((session, index) => <View key={index} style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={[body, { fontWeight: "600", flexShrink: 1 }]}>{session.title}</Text>
          {session.archived ? <Icon name="Archive" size={12} color={c.foregroundMuted} /> : null}
        </View>
        {session.workspace ? <Text numberOfLines={1} style={meta}>{session.workspace}{session.line !== null ? ` · line ${session.line}` : ""}</Text> : null}
        {session.text ? <Marked value={session.text} query={query} fallback={session.mark ? { start: session.mark[0], end: session.mark[1] } : null} theme={theme} numberOfLines={2} style={[meta, { color: c.foreground }]} /> : null}
      </View>)}
      <Text style={meta}>{`Searched ${row.searched} ${row.searched === 1 ? "session" : "sessions"}${row.truncated ? "; more matches exist" : ""}.`}</Text>
    </View>;
  }
  return <View style={{ gap: 10 }}>
    {row.messages.map((message, index) => <View key={index} style={message.target ? { padding: 8, marginHorizontal: -8, borderRadius: 6, backgroundColor: c.surface2 } : undefined}>
      <Text style={[meta, { fontWeight: "600" }]}>{message.role === "tool" && message.tool ? `Tool · ${message.tool}` : ROLE[message.role] ?? message.role}{message.target ? "  · match" : ""}</Text>
      <Text selectable numberOfLines={message.target ? undefined : 5} style={[body, message.role === "tool" ? [mono, { fontSize: 12 }] : null]}>{message.text}</Text>
    </View>)}
  </View>;
}

/**
 * Transcript Search's agent tools as one quiet line, sized like Paseo's tool rows, instead of a
 * raw `mcp__paseo__transcript_search_conversations` call. Press to see what it found or read.
 */
function ToolRowView({ item, theme }: PluginTimelineItemProps<ToolRow>) {
  const c = theme.colors;
  const row = item.data;
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const openable = row.state === "failed" ? row.error !== "" : row.tool === "search" ? row.sessions.length > 0 : row.messages.length > 0;
  const open = expanded && openable;
  const active = openable && (hovered || expanded);
  const failed = row.state === "failed";
  const tone = failed ? c.statusDanger : c.foregroundMuted;
  return <View style={{ marginHorizontal: -13 }}>
    <Pressable disabled={!openable} onPress={() => setExpanded((value) => !value)} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
      accessibilityRole={openable ? "button" : undefined} aria-expanded={openable ? expanded : undefined} aria-busy={row.state === "running"}
      style={{ flexDirection: "row", alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: open ? c.border : "transparent", borderBottomLeftRadius: open ? 0 : 8, borderBottomRightRadius: open ? 0 : 8, backgroundColor: open ? c.surface1 : "transparent", paddingHorizontal: 8, paddingVertical: 4 }}>
      <View style={{ width: 22, height: 22, marginRight: 4, alignItems: "center", justifyContent: "center" }}>
        {active
          ? <View style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}><Icon name="ChevronRight" size={14} color={c.foreground} /></View>
          : <Icon name={failed ? "TriangleAlert" : row.tool === "search" ? "TextSearch" : "ScrollText"} size={12} color={tone} />}
      </View>
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, ...tabular, color: failed ? c.statusDanger : active || row.state === "running" ? c.foreground : c.foregroundMuted, opacity: row.state === "running" ? 0.72 : 1 }}>{rowLine(row)}</Text>
    </Pressable>
    {open ? <View style={{ borderWidth: 1, borderTopWidth: 0, borderColor: c.border, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, overflow: "hidden" }}>
      <ScrollView style={[{ maxHeight: 320 }, Platform.OS === "web" ? ({ overscrollBehavior: "contain" } as object) : null]} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        <Detail row={row} theme={theme} />
      </ScrollView>
    </View> : null}
  </View>;
}

export function contributeChat(client: PluginClientContext) {
  const removers = [
    client.addTimelineTransformer({
      id: "transcript-search-tool-calls",
      query: { itemType: "tool_call" },
      transform({ item }) {
        const row = toolRow(item.name, item.status, item.detail, item.error);
        return row === null ? undefined : { items: [{ type: "plugin" as const, kind: TOOL_ROW_KIND, version: 1, data: row }] };
      },
    }),
    client.addTimelineRenderer({ kind: TOOL_ROW_KIND, version: 1, schema: ToolRowSchema, Component: ToolRowView }),
  ];
  return () => { for (const remove of removers) if (typeof remove === "function") void remove(); };
}
