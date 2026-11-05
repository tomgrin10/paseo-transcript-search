# Transcript Search

Paseo 0.14.0 or newer. This is a trusted plugin with independent client and server entries.

- Keep contribution wiring in `index.client.tsx` and `index.server.ts`.
- `client/` contains React Native views; `server/` contains filesystem and search code; `shared/` contains contracts and pure view models safe in both bundles (and read by the tests).
- The search screen is `addScreen("search")` (`client/search-screen.tsx`, state in `client/search-state.ts`), opened by the `addSidebarHeaderItem` row, ⌘K and `/recall <words>` (screen param `q`). Results are sessions (`shared/results.ts`: grouping, keyboard cursor, no-result suggestions); every match is marked with `shared/highlight.ts`, which mirrors each engine's matching. Selecting a line previews it through `transcript-search.excerpt` (`server/excerpt.ts`): streamed, parse-capped, budgeted, and limited to the session's own transcript files by base name. Keep a click a selection; opening is Enter, a double click or the preview's button.
- `client/kit.tsx`, `client/theme.ts` and `client/motion.tsx` are the plugin family's shared kit (Follow-up, Defer, Smart Session). Accent green is for primary buttons and switches only; amber means a host needs the user; marks are foreground ink on a faint wash (`markStyle`).
- `addAttachmentSource` (**Past conversation**) calls `transcript-search.attach-search` on the composer's own host (`server/attach.ts`). Paseo's picker filters the returned rows again by the typed text, so a row's subtitle must contain the match; the identifier stays empty because the picker prints it before the title.
- Agent tools (`server/native-tools.ts`): `transcript_search_conversations` and `transcript_read_conversation`, injected through `agent.session_open`. Their chat rows are `client/chat.tsx` with the parsing in `shared/chat.ts`; match tool names by suffix (`mcp__paseo__…`, `paseo.…`).
- Runtime dependencies come from Paseo; install only development dependencies.
- All session records and transcripts remain on the daemon host. Never commit them, credentials, indexes, logs, daemon configuration, or local machine paths.
- Preserve the MIT attribution for the agents-history code from panrafal.
- The sidebar setting lives in the host's native installation-scoped settings; hiding the sidebar row must keep the screen, Command Center and `/recall`.
- The grep and FTS5 engines, their limits, batching and the index schema are behaviour, not presentation: UI work must not change them. Presentation-only clean-up (for example Codex's JSON envelope around shell output) belongs in `shared/snippet-text.ts`, not in `server/snippets.ts`, whose classifier also feeds the index.
- Search every selected session in bounded batches. Do not silently restore the old 2,000-session cutoff.
- Session records may have a null persistence value; include them as unavailable rather than dropping them from history.
- Build the optional SQLite index only when ranked search requests it. Literal search requires no index.
- Release intervals, registrations, subprocesses, and the SQLite handle during cleanup. Never restart the Paseo daemon to load changes; reload only this plugin.
- Verify with `npm ci`, `npm run verify`, `npm pack --dry-run`, a plugin reload, RPC probes, and desktop/mobile UI checks (1440 and 390, light and dark, two hosts, plus an offline host, a host without the plugin and a failing search). The tests must use isolated provider and Paseo data directories.

## Automated npm releases

- The public install command is `paseo plugin install paseo-transcript-search`. Keep it in the README and keep Other plugins as its final section.
- Update package.json and package-lock.json together for a release. Tag the exact clean main commit as vX.Y.Z and push the tag.
- .github/workflows/publish-npm.yml validates the tag, runs verification and package inspection, and publishes with npm Trusted Publishing through GitHub OIDC. Do not publish manually.
- Keep npm publisher permissions scoped to tomgrin10/paseo-transcript-search and publish-npm.yml. No long-lived npm token is needed in GitHub.
- Wait for the workflow and registry integrity check before creating a GitHub release or updating an installed copy. Test the bare package-name installer in an isolated Paseo home; never restart the user's daemon.
