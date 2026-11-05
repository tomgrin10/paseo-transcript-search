import { Icon } from "@getpaseo/plugin/client/ui";
import { forwardRef, useMemo, useState } from "react";
import { Platform, ScrollView, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from "react-native";
import { ARCHIVED_MODES, type ArchivedMode, type HistoryFilters, PERIOD_MODES, PERIOD_MODE_LABELS, type PeriodMode } from "../shared/model";
import { Dropdown, type DropdownOption } from "./dropdown";
import { IconButton, type Theme } from "./kit";
import { Spinner } from "./motion";
import { raised } from "./theme";

const STATUS_LABELS: Record<ArchivedMode, string> = { all: "Active and archived", active: "Active", archived: "Archived" };
const PERIOD_SHORT: Record<PeriodMode, string> = { "24h": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", all: "Any time" };

export type SearchKey = "down" | "up" | "enter" | "escape";

export interface SearchFieldProps {
  value: string;
  onChange(value: string): void;
  onKey(key: SearchKey): boolean;
  regex: boolean;
  caseSensitive: boolean;
  /** Best match ignores letter case. */
  caseDisabled: boolean;
  onToggleRegex(): void;
  onToggleCase(): void;
  searching: boolean;
  theme: Theme;
  compact: boolean;
}

/** The field with its two match options inside, like an editor's find box. */
export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField({ value, onChange, onKey, regex, caseSensitive, caseDisabled, onToggleRegex, onToggleCase, searching, theme, compact }, ref) {
  const c = theme.colors;
  const [focused, setFocused] = useState(false);
  const keyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const key = event.nativeEvent.key;
    const mapped: SearchKey | null = key === "ArrowDown" ? "down" : key === "ArrowUp" ? "up" : key === "Escape" ? "escape" : key === "Enter" ? "enter" : null;
    if (mapped && onKey(mapped)) (event as unknown as { preventDefault?: () => void }).preventDefault?.();
  };
  // The field draws its own focus ring around the whole box, toggles included.
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: compact ? 46 : 42, paddingLeft: 12, paddingRight: 6, borderRadius: 10, backgroundColor: c.surface1 }, raised(c), focused ? ({ boxShadow: `0px 0px 0px 1px ${c.foregroundMuted}` } as object) : null]}>
    <View style={{ width: 16, alignItems: "center" }}>{searching ? <Spinner color={c.foregroundMuted} size={13} label="Searching" /> : <Icon name="Search" size={15} color={c.foregroundMuted} />}</View>
    <TextInput
      ref={ref}
      autoFocus
      accessibilityLabel="Search all session transcripts"
      placeholder={compact ? "Search what was said…" : "Search what was said in any session…"}
      placeholderTextColor={c.foregroundMuted}
      value={value}
      onChangeText={onChange}
      onKeyPress={keyPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onSubmitEditing={() => onKey("enter")}
      blurOnSubmit={false}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      returnKeyType="search"
      style={[{ flex: 1, minWidth: 0, color: c.foreground, fontSize: compact ? 16 : 14, paddingVertical: 8 }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
    />
    {value.length > 0 ? <IconButton theme={theme} icon="X" label="Clear the search" size={compact ? 36 : 26} onPress={() => onChange("")} /> : null}
    <View style={{ width: 1, height: 18, backgroundColor: c.border, marginHorizontal: 2 }} />
    <IconButton theme={theme} icon="CaseSensitive" label={caseDisabled ? "Match case (Best match ignores case)" : "Match case"} on={caseSensitive && !caseDisabled} disabled={caseDisabled} size={compact ? 36 : 28} onPress={onToggleCase} />
    <IconButton theme={theme} icon="Regex" label="Regular expression" on={regex} size={compact ? 36 : 28} onPress={onToggleRegex} />
  </View>;
});

export interface FilterRowProps {
  filters: HistoryFilters;
  onChange(next: HistoryFilters): void;
  hosts: readonly DropdownOption[];
  hostIds: ReadonlySet<string>;
  onHosts(next: ReadonlySet<string>): void;
  providers: readonly DropdownOption[];
  projects: readonly DropdownOption[];
  labels: readonly DropdownOption[];
  theme: Theme;
  compact: boolean;
  /** One sideways-scrolling row (phones and narrow windows) instead of wrapping. */
  scroll?: boolean;
}

function toggled<Value>(set: ReadonlySet<Value>, value: Value): Set<Value> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

function summarize(selected: ReadonlySet<string>, names: ReadonlyMap<string, string>): string | null {
  if (selected.size === 0) return null;
  if (selected.size === 1) { const only = [...selected][0] ?? ""; return names.get(only) ?? only; }
  return `${selected.size} selected`;
}

/** Narrowing filters on the left, sort on the right; one scrolling row on a phone. */
export function FilterRow({ filters, onChange, hosts, hostIds, onHosts, providers, projects, labels, theme, compact, scroll = compact }: FilterRowProps) {
  const names = useMemo(() => new Map([...hosts, ...providers, ...projects, ...labels].map((option) => [option.id, option.label])), [hosts, providers, projects, labels]);
  const ranked = filters.ranked && !filters.regex;
  const common = { theme, compact };
  const items = <>
    {hosts.length > 1 ? <Dropdown {...common} label="Host" icon="Server" summary={summarize(hostIds, names)} options={hosts} selected={hostIds} multi onToggle={(id) => onHosts(toggled(hostIds, id))} onClear={() => onHosts(new Set())} /> : null}
    <Dropdown {...common} label="Project" icon="FolderGit2" summary={summarize(filters.projectIds, names)} options={projects} selected={filters.projectIds} multi onToggle={(id) => onChange({ ...filters, projectIds: toggled(filters.projectIds, id) })} onClear={() => onChange({ ...filters, projectIds: new Set() })} />
    <Dropdown {...common} label="Provider" icon="Bot" summary={summarize(filters.providers, names)} options={providers} selected={filters.providers} multi onToggle={(id) => onChange({ ...filters, providers: toggled(filters.providers, id) })} onClear={() => onChange({ ...filters, providers: new Set() })} />
    {labels.length > 0 ? <Dropdown {...common} label="Label" icon="Tag" summary={summarize(filters.labels, names)} options={labels} selected={filters.labels} multi onToggle={(id) => onChange({ ...filters, labels: toggled(filters.labels, id) })} onClear={() => onChange({ ...filters, labels: new Set() })} /> : null}
    <Dropdown {...common} label="Date" icon="CalendarClock" summary={filters.period === "all" ? null : PERIOD_MODE_LABELS[filters.period]} options={PERIOD_MODES.map((mode) => ({ id: mode, label: PERIOD_SHORT[mode] }))} selected={new Set([filters.period])} multi={false} onToggle={(id) => onChange({ ...filters, period: id as PeriodMode })} />
    <Dropdown {...common} label="Status" icon="Archive" summary={filters.archived === "all" ? null : STATUS_LABELS[filters.archived]} options={ARCHIVED_MODES.map((mode) => ({ id: mode, label: STATUS_LABELS[mode] }))} selected={new Set([filters.archived])} multi={false} onToggle={(id) => onChange({ ...filters, archived: id as ArchivedMode })} />
    {scroll ? null : <View style={{ flex: 1, minWidth: 8 }} />}
    <Dropdown {...common} label="Sort" icon={ranked ? "Sparkles" : "ArrowDownWideNarrow"} alwaysShowValue highlighted={ranked} summary={ranked ? "Best match" : "Newest first"}
      options={[{ id: "newest", label: "Newest first" }, { id: "best", label: filters.regex ? "Best match (turns off regex)" : "Best match" }]}
      selected={new Set([ranked ? "best" : "newest"])} multi={false}
      onToggle={(id) => onChange(id === "best" ? { ...filters, ranked: true, regex: false } : { ...filters, ranked: false })} />
  </>;
  if (scroll) {
    const gutter = compact ? 16 : 24;
    // A trailing spacer, not paddingRight: web drops end padding in a horizontal scroll.
    return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: -gutter }} contentContainerStyle={{ gap: 8, paddingLeft: gutter, alignItems: "center" }}>{items}<View style={{ width: gutter - 8 }} /></ScrollView>;
  }
  return <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>{items}</View>;
}
