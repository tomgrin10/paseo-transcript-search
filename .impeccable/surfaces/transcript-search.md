---
version: 1
slug: "transcript-search"
primary_target: "client/search-screen.tsx"
related_targets: ["client/results.tsx","client/preview.tsx","client/search-bar.tsx","client/states.tsx","client/chat.tsx","client/display.tsx","client/open-session.tsx","index.client.tsx"]
---

# Transcript Search: search screen, preview, attach source, chat rows

Scope: the Transcript Search screen (search field, filters, host coverage, results grouped by
session, match preview, recent searches, every empty/loading/partial/failed state), the archived
restore dialog, the composer "+" source **Past conversation**, chat rows for the agent tools
(`transcript_search_conversations`, `transcript_read_conversation`), the `/recall` command, the
sidebar row and the Display settings screen. Visitor mode: Operate. Audience: a developer who
remembers that an agent said something (a decision, a fix, a command) in some earlier session on
one of their hosts and wants it back in seconds.

Job: type a few words, see which sessions said it with the words highlighted, read the match in
its conversation without leaving the screen, then open (or restore) that session on its own host,
or hand the excerpt to the current agent.

Constraints: host theme tokens only, light and dark, 390px phone, reduced motion, keyboard on
desktop/web, grep/FTS5 engine behaviour and limits unchanged, no change to stored data, results
labelled by host, partial host failure never hides other hosts' results, archived sessions confirm
before restore.

## Direction contract

THESIS: A search tool, not a history browser with a filter box. Results are sessions with their
matching lines; selecting a line shows it in its conversation on the right; Enter opens it.
Refuses the inherited stack of workspace cards, three rows of filter chips above the fold, and
match text that is only bold.

OWN-WORLD: Paseo's own ground and system sans with the family kit from Follow-up/Defer (raised
cards, tinted count chips, 97% press, neutral selected chips: foreground ring on surface2, never
accent). Matches are marked in ink: foreground text on a 14-18% foreground wash, the same mark in
results, preview and chat rows. Hosts are named chips; amber only for a host that needs the user;
accent green only on the primary Open button and switches.

STORY: Ctrl+K, "Search all session transcripts", type "idempotency". Seven sessions on Laptop and
Build server appear grouped Today / Earlier, each with two or three marked lines. ↓ walks the lines;
the preview shows the agent's message in the turns around it. Enter opens it on its host; an
archived one asks first. From any session, + → Past conversation attaches the same excerpt.

FIRST VIEWPORT: Desktop: full-width search field (40px) with Match case and Regex toggles inside,
one quiet filter row with Sort on the right, a status sentence with per-host counts; below, a
results column (~44%) and a preview pane (rest) with the session header, the conversation excerpt
around the match, and Open / Copy. Phone: field, one horizontally scrolling filter row, status,
results; a tapped line opens the preview as a sheet.

FORM: Code editor project search (VS Code / Zed "search in files": field with inline toggles,
results grouped by file, line previews) crossed with a mail client reading pane. Seed key: none;
the roll was skipped because the direction is pinned in the task brief, verbatim: "a great search
UX: keyboard-first, instant feedback, highlighted snippets, grouping by session, previewing a match
in context before opening, recent searches, empty/no-results/partial-failure states" and "reuse
their component and copy patterns so the family feels consistent" (orchestrator brief for this
pass). Signature move: the ink-marked match travelling from the result line into the preview's
conversation, with ↑/↓ moving both together.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
