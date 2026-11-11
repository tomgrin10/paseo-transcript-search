import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Modal } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Text, type TextInput, View } from "react-native";
import { pluralize } from "../shared/model";
import { type Cursor, type SessionResult, activeFilterCount, moveCursor, noResultSuggestions } from "../shared/results";
import { Button, GroupLabel, IconButton, text, useNow } from "./kit";
import { useScreenKeys } from "./keyboard";
import { type ComposerLookup, resolveAttachTarget } from "./attach-target";
import { useOpenSession } from "./open-session";
import { Preview } from "./preview";
import { recentSearches, useRecentSearches } from "./recent";
import { SessionRow } from "./results";
import { FilterRow, type SearchKey, SearchField } from "./search-bar";
import { useSearchState } from "./search-state";
import { Empty, HostNotices, InstallHint, ListSkeleton, RecentSearches, StatusLine, SUGGESTION_LABELS } from "./states";

type Item = { kind: "group"; key: string; label: string; count: number } | { kind: "session"; key: string; result: SessionResult };

/** Two panes from this width of the screen itself (not the window): results left, preview right. */
const TWO_PANE_WIDTH = 720;
/** Below this the filters scroll sideways in one row instead of wrapping. */
const ONE_ROW_FILTERS = 1040;
export const SEARCH_SCREEN = "search";
const ROOT_ID = "transcript-search-screen";

export function SearchScreen({ theme, layout, navigation, params, openSettings, composers = null }: PluginScreenProps & { openSettings(): void; composers?: ComposerLookup | null }) {
  const c = theme.colors;
  const t = text(c);
  const compact = layout.compact;
  const nowMs = useNow(30_000);
  const s = useSearchState(params?.q, nowMs);
  const recent = useRecentSearches();
  const opener = useOpenSession(navigation, theme, compact);
  // `/recall` names the session it was typed in; the preview can attach a match straight to it.
  const attachTo = resolveAttachTarget(composers, params?.from, params?.fromTitle);
  const input = useRef<TextInput>(null);
  const list = useRef<FlatList<Item>>(null);
  const [width, setWidth] = useState(0);
  const wide = !compact && width >= TWO_PANE_WIDTH;
  const narrowFilters = compact || (width > 0 && width < ONE_ROW_FILTERS);
  const [sheet, setSheet] = useState<Cursor | null>(null);
  const gutter = compact ? 16 : 24;

  const items = useMemo<Item[]>(() => s.groups.flatMap((group) => [
    { kind: "group" as const, key: `g:${group.label}`, label: group.label, count: group.results.length },
    ...group.results.map((result) => ({ kind: "session" as const, key: result.key, result })),
  ]), [s.groups]);

  const remember = useCallback(() => { if (s.searchable) recentSearches.remember(s.filters.query); }, [s.searchable, s.filters.query]);
  const open = useCallback((result: SessionResult) => { remember(); setSheet(null); opener.open(result); }, [opener, remember]);

  const select = useCallback((next: Cursor | null, viaKeyboard = false) => {
    s.setCursor(next);
    if (!next) return;
    if (!wide) { if (!viaKeyboard) { remember(); setSheet(next); } return; }
    // A click keeps typing and the keys in the field, like a command palette.
    if (!viaKeyboard) { remember(); input.current?.focus(); }
    if (viaKeyboard) {
      const index = items.findIndex((item) => item.kind === "session" && item.key === next.key);
      if (index >= 0) list.current?.scrollToIndex({ index, viewPosition: 0.35, animated: false });
    }
  }, [s, wide, items, remember]);

  const onKey = useCallback((key: SearchKey): boolean => {
    if (key === "down" || key === "up") {
      if (!wide && !s.cursor) return false;
      select(moveCursor(s.cursors, s.cursor, key === "down" ? 1 : -1), true);
      return true;
    }
    if (key === "enter") {
      if (s.search.waiting) { s.search.flush(); remember(); return true; }
      if (wide && s.selected) { open(s.selected); return true; }
      remember();
      return false;
    }
    if (key === "escape") {
      if (s.filters.query) { s.setFilters({ ...s.filters, query: "" }); return true; }
      return false;
    }
    return false;
  }, [wide, s, select, open, remember]);

  // Web: "/" focuses the field; arrows and Enter work while focus is anywhere on this screen.
  const ignoreField = useCallback(() => input.current as unknown, []);
  useScreenKeys(ROOT_ID, ignoreField, (key) => {
    if (key === "slash") { input.current?.focus(); return true; }
    return onKey(key);
  });

  useEffect(() => () => { if (s.results.length > 0) remember(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setQuery = (query: string) => s.setFilters({ ...s.filters, query });
  const filtersOn = activeFilterCount(s.filters, s.hostIds);
  // Hosts are counted by the sessions shown (name matches included), not only transcript hits.
  const searchStates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const result of s.results) counts.set(result.host.id, (counts.get(result.host.id) ?? 0) + 1);
    return s.search.hostStates.map((host) => ({ ...host, count: counts.get(host.id) ?? 0 }));
  }, [s.results, s.search.hostStates]);
  const failures = s.regexError ? [] : searchStates.filter((host) => host.state === "failed");
  const partial = searchStates.filter((host) => host.state === "partial");
  const searching = s.searchable && s.search.waiting;
  const sheetResult = sheet ? s.results.find((result) => result.key === sheet.key) ?? null : null;
  const fallbackNote = searchStates.some((host) => host.fallback) ? "grep answered while the index builds" : searchStates.some((host) => host.relaxed) ? "no session had every word; showing any word" : null;

  const header = <View style={{ paddingHorizontal: gutter, paddingTop: compact ? 12 : 18, paddingBottom: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <SearchField ref={input} value={s.filters.query} onChange={setQuery} onKey={onKey} regex={s.filters.regex} caseSensitive={s.filters.caseSensitive}
          caseDisabled={s.filters.ranked && !s.filters.regex} searching={searching} theme={theme} compact={compact}
          onToggleRegex={() => s.setFilters({ ...s.filters, regex: !s.filters.regex, ranked: s.filters.regex ? s.filters.ranked : false })}
          onToggleCase={() => s.setFilters({ ...s.filters, caseSensitive: !s.filters.caseSensitive })} />
      </View>
      <IconButton theme={theme} icon="Settings" label="Transcript Search settings" compact={compact} onPress={openSettings} />
    </View>
    {s.regexError ? <Text accessibilityRole="alert" style={[t.meta, { color: c.statusDanger }]}>That regular expression doesn't parse: {s.regexError}</Text> : null}
    <FilterRow filters={s.filters} onChange={s.setFilters} hosts={s.options.hosts} hostIds={s.hostIds} onHosts={s.setHostIds} providers={s.options.providers} projects={s.options.projects} labels={s.options.labels} theme={theme} compact={compact} scroll={narrowFilters} />
    {s.history.isPending || s.regexError || (s.searchable && !searching && s.results.length === 0) ? null : <StatusLine theme={theme} sessions={s.searchable ? s.searchableSessions : s.results.length} hosts={s.scopeHostLabels} query={s.searchable ? s.shownQuery ?? s.filters.query : null}
      searching={searching} results={s.results.length} hostStates={searchStates} unsearchable={s.unsearchable} note={s.indexNote ?? fallbackNote}
      issues={s.history.issues} refreshing={s.history.isFetching && !s.history.isPending} onRefresh={() => { void s.history.refetch(); void s.search.refetch(); }} />}
    <HostNotices theme={theme} issues={s.history.issues} failures={failures} partial={partial} compact={compact} onRetry={() => { void s.history.refetch(); void s.search.refetch(); }} />
  </View>;

  const empty = (() => {
    if (s.history.isPending) return <ListSkeleton theme={theme} />;
    if (s.history.successfulHosts.length === 0) {
      return <Empty theme={theme} icon="ServerOff" title={s.history.hosts.length === 0 ? "Connect a Paseo host to search its sessions" : "No host can be searched yet"}
        detail={s.history.hosts.length === 0 ? null : "Install Transcript Search on each host you want to search, then refresh."}>
        {s.history.hosts.length === 0 ? null : <InstallHint theme={theme} />}
        {s.history.hosts.length === 0 ? null : <Button theme={theme} compact={compact} icon="RotateCw" title="Refresh" onPress={() => void s.history.refetch()} />}
      </Empty>;
    }
    if (s.history.rows.length === 0) return <Empty theme={theme} icon="MessagesSquare" title="No sessions yet" detail={`Sessions on ${s.scopeHostLabels.join(" and ")} appear here once an agent has talked.`} />;
    if (s.searchable && searching) return <ListSkeleton theme={theme} rows={4} />;
    if (s.regexError) {
      return <Empty theme={theme} icon="Regex" title="Fix the pattern to search" detail="Or turn off regular expressions to search for these characters as they are.">
        <Button theme={theme} compact={compact} icon="Type" title="Search as plain text" onPress={() => s.setFilters({ ...s.filters, regex: false })} />
      </Empty>;
    }
    if (s.searchable) {
      const suggestions = noResultSuggestions(s.filters, s.hostIds);
      return <Empty theme={theme} icon="SearchX" title={`No session mentions “${s.filters.query}”`}
        detail={`Searched ${pluralize(s.searchableSessions, "session")} on ${s.scopeHostLabels.join(" and ") || "no host"}${filtersOn ? ` with ${pluralize(filtersOn, "filter")} on` : ""}. ${suggestions.length ? "" : s.filters.regex ? "Check the pattern." : "Check the spelling, or try fewer words."}`.trim()}>
        {suggestions.map((suggestion) => <Button key={suggestion} theme={theme} compact={compact} icon={SUGGESTION_LABELS[suggestion].icon} title={suggestion === "clear-filters" ? `Clear ${pluralize(filtersOn, "filter")}` : SUGGESTION_LABELS[suggestion].title}
          onPress={() => {
            if (suggestion === "clear-filters") { s.setFilters({ ...s.filters, archived: "all", providers: new Set(), projectIds: new Set(), labels: new Set(), period: "all" }); s.setHostIds(new Set()); }
            if (suggestion === "include-archived") s.setFilters({ ...s.filters, archived: "all" });
            if (suggestion === "ignore-case") s.setFilters({ ...s.filters, caseSensitive: false });
            if (suggestion === "literal") s.setFilters({ ...s.filters, regex: false });
          }} />)}
      </Empty>;
    }
    return <Empty theme={theme} icon="FilterX" title="No session matches these filters" detail={`${pluralize(filtersOn, "filter")} on.`}>
      <Button theme={theme} compact={compact} icon="FilterX" title="Clear filters" onPress={s.reset} />
    </Empty>;
  })();

  const listHeader = !s.searchable && recent.length > 0 && !s.history.isPending
    ? <RecentSearches theme={theme} items={recent} compact={compact} onPick={(query) => { setQuery(query); input.current?.focus(); }} onClear={() => recentSearches.clear()} />
    : null;

  const resultsList = <FlatList
    ref={list}
    data={s.history.isPending ? [] : items}
    keyExtractor={(item) => item.key}
    style={{ flex: 1, opacity: s.stale ? 0.55 : 1 }}
    contentContainerStyle={{ paddingHorizontal: wide && s.results.length > 0 ? 12 : gutter - 8, paddingTop: 14, paddingBottom: 32 }}
    keyboardShouldPersistTaps="handled"
    ListHeaderComponent={listHeader ? <View style={{ paddingHorizontal: 8, paddingBottom: 8 }}>{listHeader}</View> : null}
    ListEmptyComponent={empty}
    onScrollToIndexFailed={({ averageItemLength, index }) => list.current?.scrollToOffset({ offset: Math.max(0, averageItemLength * index - 120), animated: false })}
    renderItem={({ item, index }) => item.kind === "group"
      ? <View style={{ paddingHorizontal: 12, paddingTop: index === 0 ? 0 : 18, paddingBottom: 6 }}><GroupLabel theme={theme} label={item.label} count={item.count} /></View>
      : <SessionRow result={item.result} cursor={wide ? s.cursor : null} query={s.highlight} theme={theme} compact={compact} nowMs={nowMs} onSelect={(next) => select(next)} onOpen={open} />}
  />;

  return <View nativeID={ROOT_ID} style={{ flex: 1, backgroundColor: c.surface0 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    {header}
    {wide && s.results.length > 0 ? <View style={{ flex: 1, flexDirection: "row", minHeight: 0 }}>
      <View style={{ flex: 44, minWidth: 320, maxWidth: 640 }}>{resultsList}</View>
      <View style={{ width: 1, backgroundColor: c.border }} />
      <View style={{ flex: 56, minWidth: 0 }}>
        {s.selected
          ? <Preview result={s.selected} snippet={s.cursor?.snippet ?? null} query={s.highlight} theme={theme} compact={false} nowMs={nowMs} canOpen={opener.canOpen} onOpen={open} onOpenWorkspace={opener.openWorkspace} attachTo={attachTo} lookup={composers} />
          : s.history.isPending ? null : <Empty theme={theme} icon="PanelRight" title={s.searchable ? "Pick a line to read it in context" : "Pick a session to see how it went"} detail="↑ and ↓ move through the list; Enter opens the session." />}
      </View>
    </View> : resultsList}
    {!wide && sheetResult ? <Modal title={sheetResult.info.title} open onOpenChange={(next) => { if (!next) setSheet(null); }}>
      <Modal.Content contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 0 }}>
        <Preview inSheet result={sheetResult} snippet={sheet?.snippet ?? null} query={s.highlight} theme={theme} compact={compact} nowMs={nowMs} canOpen={opener.canOpen} onOpen={open} onOpenWorkspace={(result) => { setSheet(null); opener.openWorkspace(result); }} attachTo={attachTo} lookup={composers} onAttached={() => setSheet(null)} />
      </Modal.Content>
    </Modal> : null}
    {opener.dialog}
  </View>;
}
