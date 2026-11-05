import { Icon, ScrollView, copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useRef, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { Platform, type ScrollView as NativeScrollView, Text, View } from "react-native";
import type { Excerpt, ExcerptMessage } from "../shared/contracts";
import type { HighlightQuery } from "../shared/highlight";
import { formatTimeAgo } from "../shared/model";
import type { SessionResult } from "../shared/results";
import { Button, Chip, Kbd, Marked, text, type Theme } from "./kit";
import { Reveal, Skeleton } from "./motion";
import { mono, tabular } from "./theme";
import { useExcerpt } from "./use-excerpt";

const ROLE: Record<ExcerptMessage["role"], string> = { user: "You", assistant: "Agent", tool: "Tool", other: "Note" };

export function clock(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(" ", " ");
}

/** The selected match as plain text for the clipboard or a message. */
export function excerptText(result: SessionResult, excerpt: Excerpt | undefined): string {
  const head = [result.info.title, [result.host.label, result.info.workspaceLine, result.info.providerLabel].filter(Boolean).join(" · ")].join("\n");
  const body = (excerpt?.messages ?? []).map((message) => `${message.role === "tool" && message.tool ? `Tool ${message.tool}` : ROLE[message.role]}: ${message.text}`).join("\n\n");
  return body ? `${head}\n\n${body}` : head;
}

export interface PreviewProps {
  result: SessionResult;
  /** Index into the session's snippets; null previews the session's opening and last turns. */
  snippet: number | null;
  query: HighlightQuery | null;
  theme: Theme;
  compact: boolean;
  nowMs: number;
  canOpen: boolean;
  onOpen(result: SessionResult): void;
  onOpenWorkspace(result: SessionResult): void;
  /** A sheet already shows the title in its header. */
  inSheet?: boolean;
}

/** The match in its conversation: the turns before and after, the matched one marked. */
export function Preview({ result, snippet, query, theme, compact, nowMs, canOpen, onOpen, onOpenWorkspace, inSheet = false }: PreviewProps) {
  const c = theme.colors;
  const t = text(c);
  const toast = useToast();
  const line = snippet !== null ? result.match?.snippets[snippet] ?? null : null;
  // A phone sheet scrolls as a whole, so it keeps the excerpt short enough to show the match at once.
  const excerpt = useExcerpt({ key: result.key, hostId: result.host.id, fileName: line?.fileName, lineNumber: line?.lineNumber }, line ? query : null, inSheet ? 2 : 3);
  const data = excerpt.data;
  const scroller = useRef<NativeScrollView>(null);
  const viewport = useRef(0);
  // Bring the matched message into view when the turns before it push it below the fold.
  const onTarget = (y: number, height: number) => {
    if (viewport.current > 0 && y + Math.min(height, 120) > viewport.current) scroller.current?.scrollTo({ y: Math.max(0, y - 24), animated: false });
  };
  const archived = Boolean(result.agent.archivedAt);
  const ago = formatTimeAgo(result.activityMs, nowMs);
  const shown = result.match?.snippets.length ?? 0;
  const hits = result.match?.hitCount ?? 0;
  const where = line ? `Line ${line.lineNumber}${line.file === "subagent" ? " in a subagent" : ""}${shown > 1 && snippet !== null ? ` · match ${snippet + 1} of ${Math.max(hits, shown)}` : ""}` : result.match ? "Name match" : "Opening and last turns";

  const copy = async () => {
    try { await copyText(excerptText(result, data)); toast.show("Copied the excerpt", { variant: "success" }); }
    catch { toast.error("Couldn't copy here. Select the text instead."); }
  };

  const actions = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      {canOpen ? <Button theme={theme} kind="primary" compact={compact} icon={archived ? "ArchiveRestore" : "ArrowUpRight"} title={archived ? "Restore and open" : "Open session"} trailing={compact ? undefined : "↵"}
        accessibilityLabel={archived ? `Restore and open ${result.info.title} on ${result.host.label}` : `Open ${result.info.title} on ${result.host.label}`} onPress={() => onOpen(result)} /> : null}
      <Button theme={theme} compact={compact} icon="Copy" title={compact ? "Copy" : "Copy excerpt"} accessibilityLabel="Copy the excerpt" disabled={!data || data.messages.length === 0} onPress={() => void copy()} />
      {canOpen && !result.row.synthetic ? <Button theme={theme} kind="ghost" compact={compact} icon="FolderOpen" title="Workspace" accessibilityLabel={`Open the workspace ${result.info.workspaceTitle ?? ""}`} onPress={() => onOpenWorkspace(result)} /> : null}
    </View>
  );

  return <View style={inSheet ? undefined : { flex: 1, minHeight: 0 }}>
    <View style={{ gap: 8, paddingHorizontal: inSheet ? 0 : 24, paddingTop: inSheet ? 0 : 20, paddingBottom: 14 }}>
      {inSheet ? null : <Marked value={result.info.title} query={result.nameMatch ? query : null} theme={theme} numberOfLines={2} style={[t.title, { fontSize: 17, lineHeight: 23 }]} />}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 }}>
        <Chip theme={theme} icon="Server" label={result.host.label} />
        {archived ? <Chip theme={theme} icon="Archive" label="Archived" /> : null}
        <Text style={[t.meta, { flexShrink: 1 }]} numberOfLines={inSheet ? 2 : 1}>{[result.info.workspaceLine, result.info.providerLabel, ago ? (ago === "now" ? "just now" : /^\d/.test(ago) ? `${ago} ago` : ago) : null].filter(Boolean).join(" · ")}</Text>
      </View>
      {actions}
    </View>
    <View style={{ height: 1, backgroundColor: c.border, marginHorizontal: inSheet ? 0 : 24 }} />
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: inSheet ? 0 : 24, paddingTop: 12, paddingBottom: 4 }}>
      <Text style={[t.group, { flexShrink: 1 }]} numberOfLines={1}>{where}</Text>
      {excerpt.isFetching && data ? <Text style={t.small}>Loading…</Text> : null}
    </View>
    <Body inSheet={inSheet} scroller={scroller} viewport={viewport}>
      {excerpt.isPending ? <ExcerptSkeleton theme={theme} /> : !data ? <Text style={t.meta}>{excerpt.error instanceof Error ? `Couldn't read this session: ${excerpt.error.message}` : "Couldn't read this session."}</Text> : (
        <Reveal key={`${result.key}:${line?.lineNumber ?? "digest"}`}>
          <View style={{ gap: 14, opacity: excerpt.isPlaceholderData ? 0.55 : 1 }}>
            {data.opening && !inSheet ? <>
              <Message message={data.opening} label="Started with" theme={theme} query={query} />
              <Gap theme={theme} />
            </> : data.more || data.opening ? <Gap theme={theme} /> : null}
            {data.messages.map((message, index) => <Message key={`${message.line}:${index}`} message={message} theme={theme} target={index === data.target} query={query} onTargetLayout={index === data.target ? onTarget : undefined} />)}
            {line && data.target === null && data.messages.length > 0 ? <Text style={t.small}>The matched line holds no message text (it matched a record field).</Text> : null}
            {data.messages.length === 0 && !data.opening ? <Text style={t.meta}>{data.error ?? "Nothing readable in this session yet."}</Text> : null}
            {data.error && data.messages.length > 0 ? <Text style={t.small}>{data.error}</Text> : null}
          </View>
        </Reveal>
      )}
    </Body>
    {inSheet || compact ? null : (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 24, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border }}>
        <Kbd theme={theme} label="↑↓" /><Text style={t.small}>move</Text>
        <View style={{ width: 6 }} />
        <Kbd theme={theme} label="↵" /><Text style={t.small}>{archived ? "restore and open" : "open"}</Text>
        {query ? <><View style={{ width: 6 }} /><Kbd theme={theme} label="esc" /><Text style={t.small}>clear</Text></> : null}
      </View>
    )}
  </View>;
}

/** The excerpt scrolls on its own in the pane; in a sheet the sheet scrolls. */
function Body({ inSheet, scroller, viewport, children }: { inSheet: boolean; scroller: RefObject<NativeScrollView | null>; viewport: MutableRefObject<number>; children: ReactNode }) {
  if (inSheet) return <View style={{ paddingTop: 8, paddingBottom: 16, gap: 14 }}>{children}</View>;
  return <ScrollView ref={scroller} onLayout={(event) => { viewport.current = event.nativeEvent.layout.height; }} style={[{ flex: 1 }, Platform.OS === "web" ? ({ overscrollBehavior: "contain" } as object) : null]} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 14 }}>{children}</ScrollView>;
}

/** Turns left out between two shown ones. */
function Gap({ theme }: { theme: Theme }) {
  const c = theme.colors;
  return <View accessibilityLabel="Earlier turns not shown" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
    <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
    <Icon name="Ellipsis" size={14} color={c.foregroundMuted} />
    <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
  </View>;
}

function Message({ message, theme, target = false, query, label, onTargetLayout }: { message: ExcerptMessage; theme: Theme; target?: boolean; query: HighlightQuery | null; label?: string; onTargetLayout?: (y: number, height: number) => void }) {
  const c = theme.colors;
  const t = text(c);
  const when = clock(message.timestamp);
  if (message.role === "tool" && !target) {
    return <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <View style={{ paddingTop: 2 }}><Icon name="Wrench" size={12} color={c.foregroundMuted} /></View>
      <Marked value={`${message.tool ? `${message.tool}  ` : ""}${message.text}`} query={query} theme={theme} numberOfLines={2} selectable style={[t.meta, mono, { flex: 1, fontSize: 12 }]} />
    </View>;
  }
  const who = label ?? (message.role === "tool" ? `Tool${message.tool ? ` · ${message.tool}` : ""}` : ROLE[message.role]);
  return <View accessibilityLabel={target ? `Matched ${who.toLowerCase()} message` : undefined} onLayout={onTargetLayout ? (event) => onTargetLayout(event.nativeEvent.layout.y, event.nativeEvent.layout.height) : undefined}
    style={target ? { padding: 12, marginHorizontal: -12, borderRadius: 8, backgroundColor: c.surface1, boxShadow: `0px 0px 0px 1px ${c.border}` } as object : undefined}>
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
      <Text style={[t.label, { fontSize: 12, color: target ? c.foreground : c.foregroundMuted }]}>{who}</Text>
      {when ? <Text style={[t.small, tabular]}>{when}</Text> : null}
      {target ? <Text style={[t.small, { color: c.foreground }]}>· match</Text> : null}
    </View>
    <Marked value={message.text} query={query} theme={theme} selectable numberOfLines={target ? undefined : 6}
      style={[t.body, message.role === "tool" ? [mono, { fontSize: 12 }] : null]} />
  </View>;
}

function ExcerptSkeleton({ theme }: { theme: Theme }) {
  const tone = theme.colors.surface2;
  return <View style={{ gap: 18 }} accessibilityLabel="Loading the conversation">
    {[0.9, 0.7, 0.95].map((width, index) => <View key={index} style={{ gap: 7 }}>
      <Skeleton width={46} height={9} color={tone} />
      <Skeleton width={`${Math.round(width * 100)}%`} color={tone} />
      <Skeleton width={`${Math.round(width * 70)}%`} color={tone} />
    </View>)}
  </View>;
}
