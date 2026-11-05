import { Icon, copyText, useToast } from "@getpaseo/plugin/client/ui";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { pluralize } from "../shared/model";
import type { Suggestion } from "../shared/results";
import { Button, Chip, GroupLabel, IconButton, choiceStyle, text, type Theme } from "./kit";
import { Skeleton, Spinner } from "./motion";
import { mono, tint } from "./theme";
import type { HostIssue } from "./use-history";
import { describeIssue } from "./use-history";
import type { HostSearchState } from "./use-search";

export const INSTALL_COMMAND = "paseo plugin install paseo-transcript-search";

/** "Laptop", "Laptop and Build server", "3 hosts". */
export function hostNames(labels: readonly string[]): string {
  if (labels.length === 0) return "no host";
  if (labels.length === 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.length} hosts`;
}

export interface StatusProps {
  theme: Theme;
  /** Sessions in the current filters. */
  sessions: number;
  hosts: readonly string[];
  query: string | null;
  searching: boolean;
  /** Sessions shown for the query. */
  results: number;
  hostStates: readonly HostSearchState[];
  /** Hosts left out of the answer entirely (offline, no plugin). */
  issues?: readonly HostIssue[];
  unsearchable: number;
  note: string | null;
  refreshing: boolean;
  onRefresh(): void;
}

/** One sentence that says what was searched and what came back, host by host. */
export function StatusLine({ theme, sessions, hosts, query, searching, results, hostStates, issues = [], unsearchable, note, refreshing, onRefresh }: StatusProps) {
  const c = theme.colors;
  const t = text(c);
  const multi = hostStates.length + issues.length > 1;
  const sentence = query === null
    ? `${pluralize(sessions, "session")} on ${hostNames(hosts)}`
    : searching && results === 0
      ? `Searching ${pluralize(sessions, "session")} on ${hostNames(hosts)}…`
      : `${pluralize(results, "session")} ${results === 1 ? "mentions" : "mention"} “${query}”`;
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 28 }}>
    <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4, minWidth: 0 }}>
      <Text accessibilityRole="summary" accessibilityLiveRegion="polite" style={[t.meta, { color: c.foreground, flexShrink: 1 }]} numberOfLines={2}>{sentence}</Text>
      {query !== null && multi ? hostStates.map((host) => <HostCount key={host.id} host={host} theme={theme} />) : null}
      {multi ? issues.map((issue) => <Chip key={issue.id} theme={theme} icon="TriangleAlert" color={c.statusWarning} label={`${issue.label} ${ISSUE_CHIPS[issue.kind]}`} />) : null}
      {query !== null && unsearchable > 0 ? <Text style={t.small}>{pluralize(unsearchable, "session")} without a transcript</Text> : null}
      {note ? <Text style={t.small}>{note}</Text> : null}
    </View>
    {refreshing ? <View style={{ width: 28, alignItems: "center" }}><Spinner color={c.foregroundMuted} size={13} label="Refreshing" /></View>
      : <IconButton theme={theme} icon="RefreshCw" label="Refresh sessions and search again" onPress={onRefresh} />}
  </View>;
}

function HostCount({ host, theme }: { host: HostSearchState; theme: Theme }) {
  const c = theme.colors;
  if (host.state === "searching") {
    return <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 6, borderRadius: 999, backgroundColor: tint(c.foregroundMuted, c) }}>
      <Spinner color={c.foregroundMuted} size={10} label={`Searching ${host.label}`} />
      <Text style={{ color: c.foregroundMuted, fontSize: 11, lineHeight: 16, fontWeight: "600" }}>{host.label}</Text>
    </View>;
  }
  if (host.state === "failed") return <Chip theme={theme} icon="TriangleAlert" color={c.statusWarning} label={`${host.label} failed`} />;
  return <Chip theme={theme} icon="Server" label={`${host.label} ${host.count}${host.state === "partial" ? "+" : ""}`} />;
}

const ISSUE_CHIPS: Record<HostIssue["kind"], string> = { offline: "offline", connecting: "unreachable", "missing-plugin": "not searched", failed: "failed", stale: "out of date" };

export interface NoticeProps {
  theme: Theme;
  issues: readonly HostIssue[];
  failures: readonly HostSearchState[];
  partial: readonly HostSearchState[];
  onRetry(): void;
  compact: boolean;
}

/** Hosts that are missing from the answer, each named with what to do. Results from the rest stay up. */
export function HostNotices({ theme, issues, failures, partial, onRetry, compact }: NoticeProps) {
  const c = theme.colors;
  const t = text(c);
  const toast = useToast();
  const lines = [
    // The app reconnects offline hosts itself; Retry is offered only where asking again can help.
    ...issues.map((issue) => ({ key: `i:${issue.id}`, text: describeIssue(issue), install: issue.kind === "missing-plugin", retry: issue.kind === "failed" || issue.kind === "stale" })),
    ...failures.map((host) => ({ key: `f:${host.id}`, text: `${host.label} didn't finish searching${host.message ? `: ${host.message}` : ""}`, install: false, retry: true })),
    ...partial.map((host) => ({ key: `p:${host.id}`, text: `${host.label} had more matches than one search returns; narrow the search or add a filter`, install: false, retry: false })),
  ];
  if (lines.length === 0) return null;
  return <View accessibilityRole="alert" style={{ borderRadius: 8, backgroundColor: tint(c.statusWarning, c), paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
    {lines.map((line) => <View key={line.key} style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: compact ? "wrap" : "nowrap" }}>
      <Icon name="TriangleAlert" size={13} color={c.statusWarning} />
      <Text style={[t.meta, { color: c.foreground, flex: 1, minWidth: 160 }]}>{line.text}</Text>
      {line.install ? <Button theme={theme} small kind="ghost" icon="Copy" title="Copy install command" compact={compact}
        onPress={() => void copyText(INSTALL_COMMAND).then(() => toast.show("Copied. Run it on that host.", { variant: "success" }), () => toast.error(INSTALL_COMMAND))} /> : null}
      {line.retry ? <Button theme={theme} small kind="ghost" icon="RotateCw" title="Retry" compact={compact} onPress={onRetry} /> : null}
    </View>)}
  </View>;
}

/** Device-local recent searches, shown while the field is empty. */
export function RecentSearches({ theme, items, onPick, onClear, compact }: { theme: Theme; items: readonly string[]; onPick(query: string): void; onClear(): void; compact: boolean }) {
  const c = theme.colors;
  if (items.length === 0) return null;
  return <View style={{ gap: 8, paddingBottom: 8 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <GroupLabel theme={theme} label="Recent searches" />
      <View style={{ flex: 1 }} />
      <Button theme={theme} small kind="ghost" title="Clear" accessibilityLabel="Clear recent searches" onPress={onClear} />
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Search for ${item}`} onPress={() => onPick(item)}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [choiceStyle(c, false, { pressed, hovered }), { flexDirection: "row", alignItems: "center", gap: 6, minHeight: compact ? 36 : 30 }]}>
        <Icon name="History" size={12} color={c.foregroundMuted} />
        <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 13, lineHeight: 17, maxWidth: 240 }}>{item}</Text>
      </Pressable>)}
    </View>
  </View>;
}

/** A centred message for a state with nothing to list, and the one or two things to do about it. */
export function Empty({ theme, icon, title, detail, children }: { theme: Theme; icon: string; title: string; detail?: string | null; children?: ReactNode }) {
  const c = theme.colors;
  const t = text(c);
  return <View style={{ alignItems: "center", paddingHorizontal: 24, paddingVertical: 48, gap: 10 }}>
    <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.surface1 }}>
      <Icon name={icon} size={18} color={c.foregroundMuted} />
    </View>
    <Text accessibilityRole="header" style={[t.title, { textAlign: "center", maxWidth: 460 }]}>{title}</Text>
    {detail ? <Text style={[t.meta, { textAlign: "center", maxWidth: 460 }]}>{detail}</Text> : null}
    {children ? <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, paddingTop: 6 }}>{children}</View> : null}
  </View>;
}

export const SUGGESTION_LABELS: Record<Suggestion, { title: string; icon: string }> = {
  "clear-filters": { title: "Clear filters", icon: "FilterX" },
  "include-archived": { title: "Include archived", icon: "Archive" },
  "ignore-case": { title: "Ignore case", icon: "CaseSensitive" },
  literal: { title: "Search as plain text", icon: "Type" },
  newest: { title: "Newest first", icon: "ArrowDownWideNarrow" },
};

/** First-run state for a host list with nothing on it yet. */
export function InstallHint({ theme }: { theme: Theme }) {
  const c = theme.colors;
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: c.surface1 }}>
    <Text selectable style={[mono, { color: c.foreground, fontSize: 12, lineHeight: 17 }]}>{INSTALL_COMMAND}</Text>
  </View>;
}

/** Placeholder rows while the hosts' session lists load. */
export function ListSkeleton({ theme, rows = 6 }: { theme: Theme; rows?: number }) {
  const tone = theme.colors.surface2;
  return <View accessibilityLabel="Loading sessions" style={{ gap: 22, paddingHorizontal: 12, paddingTop: 12 }}>
    {Array.from({ length: rows }, (_, index) => <View key={index} style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Skeleton width={`${50 + ((index * 17) % 30)}%`} height={11} color={tone} /><Skeleton width={28} height={9} color={tone} /></View>
      <Skeleton width={`${35 + ((index * 23) % 25)}%`} height={8} color={tone} />
    </View>)}
  </View>;
}

