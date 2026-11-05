---
name: Transcript Search (Paseo native surface)
description: Find what any past session said, see it marked in ink, and read it in its conversation before opening it on its own host.
typography:
  preview-title:
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "23px"
  title:
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "21px"
  session-title:
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "19px"
  field:
    fontSize: "14px"
    fontWeight: 400
  field-compact:
    fontSize: "16px"
    fontWeight: 400
  body:
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "19px"
  label:
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "18px"
  meta:
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "17px"
    fontFeature: "tnum"
  group:
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "16px"
    fontFeature: "tnum"
  small:
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "15px"
    fontFeature: "tnum"
  chip:
    fontSize: "11px"
    fontWeight: 600
    lineHeight: "16px"
    fontFeature: "tnum"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "17px"
rounded:
  mark: "3px"
  key: "4px"
  control: "6px"
  control-compact: "8px"
  card: "10px"
  pill: "999px"
spacing:
  hit-slop: "4px"
  hit-slop-icon: "6px"
  inline: "8px"
  header-stack: "10px"
  excerpt-stack: "14px"
  group-break: "18px"
  gutter: "24px"
  gutter-compact: "16px"
  empty-y: "48px"
components:
  button:
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 11px"
    typography: "{typography.label}"
  button-small:
    rounded: "{rounded.control}"
    height: "28px"
    padding: "0 9px"
  button-compact:
    rounded: "{rounded.control-compact}"
    height: "44px"
    padding: "0 14px"
  icon-button:
    rounded: "{rounded.control}"
    size: "28px"
  icon-button-compact:
    rounded: "{rounded.control}"
    size: "44px"
  search-field:
    rounded: "{rounded.card}"
    height: "42px"
    padding: "0 6px 0 12px"
    typography: "{typography.field}"
  search-field-compact:
    rounded: "{rounded.card}"
    height: "46px"
    typography: "{typography.field-compact}"
  filter-trigger:
    rounded: "{rounded.pill}"
    height: "30px"
    padding: "4px 11px"
    typography: "{typography.meta}"
  filter-trigger-compact:
    rounded: "{rounded.pill}"
    height: "36px"
  chip:
    rounded: "{rounded.pill}"
    padding: "1px 6px"
    typography: "{typography.chip}"
  card:
    rounded: "{rounded.card}"
  session-row:
    rounded: "{rounded.card}"
    padding: "4px 0"
  result-line:
    rounded: "{rounded.control}"
    padding: "5px 8px"
    typography: "{typography.body}"
  match-mark:
    rounded: "{rounded.mark}"
  kbd:
    rounded: "{rounded.key}"
    height: "18px"
    padding: "0 5px"
    typography: "{typography.small}"
---

# Design System: Transcript Search

## Overview

**Creative North Star: "Find in Files, for Conversations"**

Transcript Search is a code editor's project search turned on session transcripts, with a mail client's reading pane beside it. A single field with its match options inside, one quiet row of filters, a sentence saying what was searched on which host, then results grouped by session with the lines that matched. Selecting a line shows it in its conversation on the right; Enter opens it on its own host. It lives inside Paseo and owns no colour, no font and no chrome of its own: the host's ground, ink and system sans, plus the plugin family's kit (raised cards, tinted chips, 97% press, neutral selection).

Density is that of a working tool. Titles are 14–17px, the reading text is 13px, metadata 12px, and the only heavy marks on screen are the matched words themselves: foreground ink on a faint wash of foreground. The same mark travels from the result line into the preview and into chat rows, so the eye follows one thing.

Colour means something or it is absent. Green (the host accent) is the primary Open button and switches. Amber is a host that needs the user. Red is a parse error or a failed tool call. Everything else, selection included, is surfaces and ink.

**Key Characteristics:**
- Host theme tokens only; every derived colour is a token at an alpha.
- The match is marked in ink (foreground on a 13% light / 17% dark foreground wash, 600 weight, 3px corners), never in accent.
- Selection is a surface wash (surface1 for the session, surface2 for the line), never a ring or a hue.
- Two panes from 720px of screen width; a sheet below it.
- Keyboard first on desktop: `/`, ↑ ↓, Enter, Esc, with soft key hints at the foot of the preview.

## Colors

The palette is the host's. Transcript Search owns no hex values, so the frontmatter carries no colour tokens; values follow the user's Paseo theme in light and dark. Use only `theme.colors.surface0`, `surface1`, `surface2`, `border`, `foreground`, `foregroundMuted`, `accent`, `accentForeground`, `statusWarning` and `statusDanger`, through `client/theme.ts`: `withAlpha`, `tint` (12% light / 16% dark chip fill), `raised`, `markStyle`, and `isLight` (luminance of `surface0` > 0.4).

### Primary
- **Host Accent** (`accent`, `accentForeground`): the primary button (Open session, Restore and open, the dropdown sheet's Done) and switches on the Display screen. Hover is accent at 92%, press at 85%. Nothing else.

### Neutral
- **Ground** (`surface0`): the screen, card fill.
- **Lifted** (`surface1`): the search field, secondary buttons, the selected session block, the preview's matched message, the empty-state icon disc, the dropdown popover, hover fill of rows and ghost controls.
- **Pressed** (`surface2`): the selected result line and session head, pressed fills, active filter triggers and on-toggles, skeleton bars.
- **Hairline** (`border`): the header's bottom rule, the pane divider, the preview's rules, the field's toggle separator, inactive filter-trigger outlines, key-hint outlines, the expanded chat row's frame.
- **Ink** (`foreground`): titles, the reading text of a selected line, the mark's text and (at 13% / 17%) its wash, the ring of an on toggle or active filter. At 5% it washes the line an agent tool found in an expanded chat row.
- **Muted Ink** (`foregroundMuted`): metadata, role labels, unselected result lines, icons, placeholder, the field's focus ring, neutral chips (at the tint alpha).

### Status
- **Amber** (`statusWarning`): a host that is offline, unreachable, missing the plugin, out of date, failed or partial. It tints the host notice band and the host's chip, and colours its warning icon.
- **Red** (`statusDanger`): a regular expression that does not parse, a failed agent tool call, a settings load or save error. Text colour only.

### Named Rules
**The Ink Mark Rule.** A matched word is `foreground` text on `foreground` at 13% (light) or 17% (dark), weight 600, 3px corners, wherever it appears: result lines, titles matched by name, the preview excerpt and chat rows. Never accent, never bold alone, never a second hue.

**The Accent Is The Way Out Rule.** Accent green fills the primary action that leaves the screen or commits (Open, Restore, Done) and the on state of switches. It never marks selection, a match, a filter or a count.

**The Amber Asks Rule.** Amber appears only for a host that needs the user. A partial result from a healthy host is a `+` on its count chip, not a colour.

## Typography

**Body Font:** the host's system sans (no family set)
**Label/Mono Font:** `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`, for tool lines, commands and the install command only

**Character:** One system face at a narrow range of sizes; hierarchy comes from weight (400 / 500 / 600) and ink strength, not scale. Every time and count uses tabular numerals.

### Hierarchy
- **Preview title** (600, 17px, 23px): the selected session's name at the top of the preview pane.
- **Title** (600, 15px, 21px): empty-state headings.
- **Session title** (600, 14px, 19px): each session in the results list.
- **Field** (400, 14px desktop / 16px compact): the search input; 16px on touch layouts so phones do not zoom.
- **Body** (400, 13px, 19px): result lines, excerpt messages, restore dialog copy.
- **Label** (600, 13px, 18px): role headers in the excerpt (at 12px), button text (500 secondary, 600 primary).
- **Meta** (400, 12px, 17px, tabular): workspace · project · provider lines, the status sentence (in foreground), notices, filter-trigger labels (500).
- **Group** (600, 12px, 16px, tabular): Today / Yesterday headings, "Match 2 of 5".
- **Small** (400, 11px, 15px, tabular): role column (You, Agent, Tool, Sub·Agent), "+3 more lines", key hints, notes.
- **Chip** (600, 11px, 16px, tabular): host and count chips.

### Named Rules
**The Weight Not Size Rule.** The ramp spans 11–17px. A new level is a weight or ink change inside that range, not a larger size.

**The Mono Is For Machines Rule.** Monospace marks tool output, commands and paths only, at 12px. Prose quoted from an agent stays in the system sans even when it contains code spans.

## Layout

The screen is a header band over a results area. The header (gutter 24px desktop / 16px compact; 18px / 12px top, 10px bottom, 10px between rows, hairline below) holds the field with a settings icon button beside it, the filter row, the status sentence with per-host count chips and a refresh button, and any host notices.

- **Two panes** when the screen itself (measured by `onLayout`, not the window) is at least 720px wide and the host layout is not compact, and there are results: results column `flex 44` (320–640px) | 1px `border` divider | preview `flex 56`. With nothing selected the right pane shows a centred "Pick a line" state.
- **One column** below that: results only; tapping a line opens the preview in the host's Modal sheet (16px sides, 12px top, 24px bottom), with a shorter excerpt (2 turns either side instead of 3).
- **Filters** wrap in one row with Sort pushed right at 1040px and above; below 1040px (and always on compact) they scroll sideways in a single row that bleeds to the screen edge, with a trailing spacer instead of end padding.
- **Results list**: 14px top, 32px bottom padding; group headings sit 18px below the previous group; result lines indent behind a 40–44px role column.
- **Preview**: 24px sides, 20px top; header, actions, a hairline, the "Match n of m" group line, then the excerpt scrolling on its own (14px between messages), then a key-hint footer above a hairline.
- **Empty states**: centred, 48px vertical padding, 460px text measure, 10px stack.

Rhythm is 4/6/8 inside rows, 10–14 between rows, 18–24 at section and gutter scale.

## Elevation & Depth

Mostly tonal. Depth is `surface0` → `surface1` → `surface2`, plus the family's `raised` ring on the field, secondary buttons and cards. The dropdown popover is the only floating layer and the only drop shadow.

### Shadow Vocabulary
- **Raised, light** (`box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.07), 0px 1px 2px -1px rgba(0,0,0,0.06), 0px 2px 6px 0px rgba(0,0,0,0.04)`): search field, secondary buttons, cards, on light grounds.
- **Raised, dark** (`box-shadow: 0px 0px 0px 1px rgba(255,255,255,0.08)`): the same on dark grounds.
- **Field focus** (`box-shadow: 0px 0px 0px 1px foregroundMuted`): replaces the raised ring while the field has focus; the ring wraps the toggles too.
- **Matched message** (`box-shadow: 0px 0px 0px 1px border` on `surface1`): the message containing the match in the preview, bleeding 12px (8px in a sheet) past the text column.
- **Popover** (shadow `#000` at 0.18, radius 12px, offset 0 4px; hairline `border`): dropdown menus on desktop.

### Named Rules
**The Flat Until Lifted Rule.** Rows are flat; selection and hover are fills. Only controls you type into or press, and the one floating menu, carry depth.

## Shapes

Soft rectangles at three steps: 6px for desktop controls and result lines, 8px for touch controls, row heads, notices and the matched message, 10px for the field, session blocks, cards and the popover. Pills (999px) for filter triggers, recent-search chips and count chips. The mark has 3px corners, key hints 4px, skeleton bars 4px. The only circle is the 40px empty-state icon disc.

## Components

### Buttons
Quiet, compact, one vocabulary (`client/kit.tsx`), all wrapped in PressScale.
- **Shape:** 6px corners desktop (8px compact).
- **Sizes:** 32px default, 28px small (12px text), 44px compact with 16px icon and 14px text; 4px hit slop off touch.
- **Primary:** `accent` fill, `accentForeground` 600 text, 14px icon; may carry a trailing key hint (`↵`) at 70% on desktop.
- **Secondary:** `surface1` with the raised ring; `surface2` on hover and press.
- **Ghost:** transparent; `surface1` hover, `surface2` press. Used for Workspace, Retry, Copy install command, Clear, Cancel.
- **Icon button:** 28px square (44px compact; 26–36px inside the field), muted 15px icon. As a toggle it gains a 1px `foreground` ring on `surface2` with foreground icon.
- **Disabled:** 45% opacity (40% for icon buttons).

### Chips
- **Count / host chip:** pill, 6px × 1px padding, text and 11px icon in one hue, fill `tint` of that hue (12% light / 16% dark). Neutral hue is `foregroundMuted`; amber for a host needing the user. A searching host shows a 10px spinner in the same pill.
- **Filter trigger:** pill outline in `border`, 30px (36px compact), muted label + foreground value. Active (a narrowing value, or Sort set to Best match): `foreground` ring on `surface2`, value in 600.
- **Recent search:** the same neutral choice shape, history icon, 240px max text.

### Cards / Containers
- **Card:** 10px corners, `surface0`, raised, clipped; rows inside divide with hairlines.
- **Host notice band:** 8px corners, `statusWarning` tint, 12 × 8px padding, one line per host with its amber icon, foreground text and at most a ghost action.

### Inputs / Fields
- **Search field:** 42px (46px compact), 10px corners, `surface1`, raised; search icon (or spinner while searching) on the left; clear, a hairline separator, then Match case and Regex toggles inside on the right. Focus swaps the raised ring for a 1px `foregroundMuted` ring around the whole box; the web outline is suppressed.
- **Error:** an unparseable regex shows one `statusDanger` meta line under the field and a centred "Fix the pattern" state with a plain-text fallback.

### Navigation
The host owns the header, sidebar row and back button. The screen adds a settings icon button beside the field and the keyboard map: `/` focuses the field, ↑ ↓ walk result lines (scrolling the selection to 35% of the list), Enter opens, Esc clears the query, a double click opens on desktop.

### Session row and result lines (signature)
A session block (10px corners, `surface1` when it holds the selection on desktop): head with title, archive icon, relative time; a host chip and a muted workspace · project · provider line; then up to three result lines, each a 40–44px muted role column and two lines (three compact) of body text with every match ink-marked. Unselected lines are muted; the selected line is `surface2` with foreground text. "+n more lines" follows in small.

### Preview pane
Title, chips (host, Archived), meta line, actions (Primary Open or Restore and open, Secondary Copy excerpt, Ghost Workspace), a hairline, the "Match n of m" line, then the excerpt: "Started with" the opening turn, an ellipsis gap rule, the surrounding turns, and the matched message lifted on `surface1` with a `border` ring and "· match" in foreground. Collapsed tool turns are one mono line with a wrench. Content arrives with Reveal; loading is three skeleton message blocks on `surface2`.

### Chat tool rows
One 14px line sized like Paseo's tool rows (8 × 4px padding, 8px corners, 22px icon slot, muted until hover). Expanded, it frames in `border` on `surface1` and opens a 320px-max scroll of sessions or messages, matches ink-marked; the found line gets a 5% foreground wash. Failure turns the line `statusDanger`.

### Restore dialog
The host's Modal: body copy saying what restoring does, a meta reassurance line, Ghost Cancel and Primary "Restore and open" right-aligned, with a spinner while it runs.

### Motion
One ease, `cubic-bezier(0.16, 1, 0.3, 1)`, opacity and transform only, and none of it under reduced motion. PressScale eases to 0.97 in 140ms. Reveal rises 6px and fades in over 280ms. IconSwap grows from 40% in 260ms. Skeletons breathe between 55% and 100% opacity on an 800ms loop. Stale results dim to 55% while new ones load.

## Do's and Don'ts

### Do:
- **Do** use only host theme tokens and alphas derived from them through `client/theme.ts`.
- **Do** mark every matched word with `markStyle`: foreground on foreground at 13% light / 17% dark, 600, 3px corners, in results, preview and chat alike.
- **Do** show selection as a surface wash: `surface1` for the session block, `surface2` for the selected line.
- **Do** draw neutral selected controls (active filters, on toggles) as a `foreground` ring on `surface2`.
- **Do** name the host of every result with a chip, and give each host its own count in the status sentence.
- **Do** keep buttons at 28/32px with hit slop on desktop and 44px on compact layouts.
- **Do** switch to two panes at 720px of the screen's own width, and to one sideways-scrolling filter row below 1040px.
- **Do** honour reduced motion in every animation: PressScale, Reveal, IconSwap and Skeleton all go static.

### Don't:
- **Don't** use accent green for anything but primary buttons and switches; never for selection, a match or a filter.
- **Don't** use amber except for a host that needs the user.
- **Don't** mark matches with bold alone or with a coloured highlight.
- **Don't** stack workspace cards or put several rows of filter chips above the results.
- **Don't** add drop shadows to rows or panes; the dropdown popover is the only floating layer.
- **Don't** introduce a font family; monospace is for tool lines, commands and paths only.
