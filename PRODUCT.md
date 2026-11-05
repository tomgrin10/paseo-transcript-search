# Transcript Search

<!-- impeccable:product-schema 1 -->

> Updated during the November 2026 UI polish pass without a live interview. Facts come from the
> README, AGENTS.md, the code and the owner's written brief; lines marked *(inferred)* are
> assumptions to confirm.

## Platform

adaptive

## Users

Developers who run many Paseo sessions (Claude Code, Codex, their subagents) across a laptop and one
or more remote hosts, and who later need something one of those sessions said: a decision, a fix, a
command, a reason. They remember a word or two, not which session or host it was in. Agents are
users too: they search and read past sessions through the plugin's tools when Paseo tools are on.

## Product Purpose

Find what was said in any past session, active or archived, on every connected host, from one
screen; read the match in its conversation; then open that session on its own host (restoring it
when archived) or hand the excerpt to the session you are in. Success is a person who gets an old
answer back in seconds instead of re-asking an agent, and an agent that checks earlier decisions
before repeating work.

## Positioning

The only Paseo plugin that searches the providers' own transcripts across hosts, archived sessions
and subagents included, with snippets and a readable preview. *(inferred)* Paseo's built-in Search
finds sessions by name; agents-history (the code this plugin adapts) searched one host.

## Operating Context

- Entry points: the **Transcript Search** sidebar row and screen, ⌘K **Search all session
  transcripts**, `/recall <words>` in any session, the composer **+** menu's **Past conversation**
  source, Settings → Plugins → Transcript Search → Display.
- Agents reach it through `transcript_search_conversations` and `transcript_read_conversation`
  (Paseo tools); their calls show as one-line chat rows.
- Used mostly on desktop and web with a keyboard *(inferred)*; phones get the same screen with a
  preview sheet.

## Capabilities and Constraints

- Literal and regex search use the host's `grep` in bounded batches; Best match uses a disposable
  SQLite FTS5 index built on demand. Limits (timeouts, output cap, 2,000-session batches) are
  reported, never silent.
- Transcripts stay on their host and are read-only; only snippets and short excerpts travel.
  Provider credentials in session records never leave the server.
- Every host answers on its own; a failing or offline host never hides the others' results.
- Paseo ≥ 0.14, no runtime dependencies, host theme tokens only, no react-native-svg.

## Brand Commitments

Part of Tom Gringauz's Paseo plugin family (Follow-up, Defer, Smart Session, Transfer, Vitals, …):
native to Paseo, host theme tokens only, the shared slate icon tile, plain short copy, accent green
only for primary actions and switches.

## Evidence on Hand

Synthetic two-host harness data (Laptop, Build server) with Claude and Codex transcripts, archived
sessions and a subagent; no usage analytics. Registry installs: 14 at the time of this pass.

## Product Principles

1. The match is the unit: show the words that matched, marked, in their own conversation.
2. Name the host and the scope of every answer; partial is fine, silent is not.
3. Keyboard first on desktop, one tap less on phones.
4. Never restore, start or message a session without the person asking.

Attribution: adapted from panrafal's agents-history (MIT); keep the attribution in LICENSE.
