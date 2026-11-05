import { Icon } from "@getpaseo/plugin/client/ui";
import { memo, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import type { Snippet } from "../shared/contracts";
import type { HighlightQuery } from "../shared/highlight";
import { formatTimeAgo } from "../shared/model";
import type { Cursor, SessionResult } from "../shared/results";
import { snippetText } from "../shared/snippet-text";
import { Chip, Marked, text, type Theme } from "./kit";
import { tabular } from "./theme";

export const SNIPPETS_SHOWN = 3;
const ROLE: Record<Snippet["role"], string> = { user: "You", assistant: "Agent", tool: "Tool", other: "Note" };

function transcriptNote(result: SessionResult): string | null {
  const t = result.agent.transcript;
  if (t.searchable) return null;
  if (t.reason === "no-session") return "No conversation yet";
  if (t.reason === "file-missing") return "Transcript gone from disk";
  return `${result.info.providerLabel} keeps no transcript`;
}

export interface SessionRowProps {
  result: SessionResult;
  cursor: Cursor | null;
  query: HighlightQuery | null;
  theme: Theme;
  compact: boolean;
  nowMs: number;
  onSelect(cursor: Cursor): void;
  /** A double click on a line (desktop). */
  onOpen(result: SessionResult): void;
}

/** One session: its title and where it ran, then the lines that matched, the selected one raised. */
function SessionRowImpl({ result, cursor, query, theme, compact, nowMs, onSelect, onOpen }: SessionRowProps) {
  const c = theme.colors;
  const t = text(c);
  const selectedHere = cursor?.key === result.key;
  const snippets = result.match?.snippets.slice(0, SNIPPETS_SHOWN) ?? [];
  const more = (result.match?.hitCount ?? 0) - snippets.length;
  const ago = formatTimeAgo(result.activityMs, nowMs);
  const note = query ? null : transcriptNote(result);
  // A click selects (the first result is selected for you, so a click must never open by itself);
  // two clicks on the same line within a moment open it, like a file list.
  const lastPress = useRef<{ snippet: number | null; at: number } | null>(null);
  const press = (snippet: number | null) => {
    const now = Date.now();
    const twice = !compact && lastPress.current !== null && lastPress.current.snippet === snippet && now - lastPress.current.at < 450;
    lastPress.current = twice ? null : { snippet, at: now };
    if (twice) onOpen(result);
    else onSelect({ key: result.key, snippet });
  };
  const headSelected = selectedHere && (snippets.length === 0 || cursor?.snippet === null);
  return <View style={{ borderRadius: 10, paddingVertical: 4, backgroundColor: selectedHere && !compact ? c.surface1 : "transparent" }}>
    <Pressable accessibilityRole="button" accessibilityState={{ selected: headSelected }}
      accessibilityLabel={`${result.info.title}, ${result.host.label}${result.agent.archivedAt ? ", archived" : ""}${ago ? `, ${ago}` : ""}`}
      onPress={() => press(snippets.length ? 0 : null)}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({ paddingHorizontal: 12, paddingTop: 6, paddingBottom: snippets.length ? 4 : 8, gap: 3, borderRadius: 8, backgroundColor: headSelected && !compact ? c.surface2 : pressed ? c.surface2 : hovered ? c.surface1 : "transparent" })}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Marked value={result.info.title} query={result.nameMatch ? query : null} theme={theme} numberOfLines={1} style={[t.label, { flex: 1, fontSize: 14, lineHeight: 19 }]} />
        {result.agent.archivedAt ? <Icon name="Archive" size={13} color={c.foregroundMuted} /> : null}
        {ago ? <Text style={[t.meta, tabular]} numberOfLines={1}>{ago}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 }}>
        <View style={{ flexShrink: 0 }}><Chip theme={theme} icon="Server" label={result.host.label} /></View>
        <Marked value={[result.info.workspaceTitle, result.info.projectName, result.info.providerLabel].filter((part, index, all) => Boolean(part) && all.indexOf(part) === index).join(" · ")} query={result.nameMatch ? query : null} theme={theme} numberOfLines={1} style={[t.meta, { flexShrink: 1 }]} />
      </View>
      {note ? <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><Icon name="FileX" size={11} color={c.foregroundMuted} /><Text style={t.small} numberOfLines={1}>{note}</Text></View> : null}
    </Pressable>
    {snippets.map((snippet, index) => {
      const on = selectedHere && cursor?.snippet === index;
      const { value, fallback } = snippetText(snippet);
      const role = snippet.file === "subagent" ? `Sub·${ROLE[snippet.role]}` : ROLE[snippet.role];
      return <Pressable key={`${snippet.fileName ?? snippet.file}:${snippet.lineNumber}:${index}`} accessibilityRole="button" accessibilityState={{ selected: on }}
        accessibilityLabel={`${ROLE[snippet.role]} line ${snippet.lineNumber}: ${value.slice(0, 120)}`}
        onPress={() => press(index)}
        style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({ flexDirection: "row", alignItems: "flex-start", gap: 10, marginHorizontal: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6,
          backgroundColor: on && !compact ? c.surface2 : pressed ? c.surface2 : hovered ? (selectedHere ? c.surface2 : c.surface1) : "transparent" } as object)}>
        <Text numberOfLines={1} style={[t.small, { width: compact ? 40 : 44, paddingTop: 1, color: on ? c.foreground : c.foregroundMuted }]}>{role}</Text>
        <Marked value={value} fallback={fallback} query={query} theme={theme} numberOfLines={compact ? 3 : 2} style={[t.body, { flex: 1, fontSize: 13, lineHeight: 19, color: on ? c.foreground : c.foregroundMuted }]} />
      </Pressable>;
    })}
    {more > 0 ? <Text style={[t.small, { paddingLeft: compact ? 66 : 70, paddingTop: 2, paddingBottom: 4 }]}>+{more} more {more === 1 ? "line" : "lines"}</Text> : null}
  </View>;
}

export const SessionRow = memo(SessionRowImpl);
