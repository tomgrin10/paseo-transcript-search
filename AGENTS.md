# Transcript Search

Paseo 0.14.0 or newer. This is a trusted plugin with independent client and server entries.

- Keep contribution wiring in `index.client.tsx` and `index.server.ts`.
- `client/` contains React Native views; `server/` contains filesystem and search code; `shared/` contains contracts and pure view models safe in both bundles (and read by the tests).
- The search screen is `addScreen("search")` (`client/search-screen.tsx`, state in `client/search-state.ts`), opened by the `addSidebarHeaderItem` row, ⌘K and `/recall <words>` (screen param `q`). Results are sessions (`shared/results.ts`: grouping, keyboard cursor, no-result suggestions); every match is marked with `shared/highlight.ts`, which mirrors each engine's matching. Selecting a line previews it through `transcript-search.excerpt` (`server/excerpt.ts`): streamed, parse-capped, budgeted, and limited to the session's own transcript files by base name. Keep a click a selection; opening is Enter, a double click or the preview's button.
- `client/kit.tsx`, `client/theme.ts` and `client/motion.tsx` are the plugin family's shared kit (Follow-up, Defer, Smart Session). Accent green is for primary buttons and switches only; amber means a host needs the user; marks are foreground ink on a faint wash (`markStyle`).
- `addAttachmentSource` (**Past conversation**) calls `transcript-search.attach-search` on the composer's own host (`server/attach.ts`). Paseo's picker filters the returned rows again by the typed text, so a row's subtitle must contain the match; the identifier stays empty because the picker prints it before the title.
- **Attach to <session>** (Paseo 0.16): `/recall` passes screen params `from` (agent id) and `fromTitle`. The preview fills that session's composer, or the focused one, through `client.composers(selector)` (`client/attach-target.ts`), using `transcript-search.attach-item` (`attachItemFor` in `server/attach.ts`, the same item the + menu builds) on the result's host. There is no target on 0.15, or when nothing resolves; Copy stays the 0.15 path.
  - A plugin screen gets no provider for the host's state or composer hooks (`useAgent`, `useComposers`, …). They throw, and on 0.16 that blanked the screen. Reach host state from the screen through plain `client` calls, guarded with try/catch, or through screen params. `test/attach-target.test.mjs` fails on any of those hooks in `client/`.
  - On the client, `SessionResult.key` and `result.agent.id` are host-scoped (`["host","id"]`). RPCs take the raw id: unwrap it with `sourceKey(key).id` (`attachRequest` in `shared/results.ts`). A scoped id finds no session on the server.
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
- Releases need Tom's manual permission. Features and fixes ship as betas (`X.Y.Z-beta.N`, npm `beta` tag) by default. A stable version, npm `latest`, or a hotfix needs Tom's explicit OK for that exact version before it is tagged; never infer it from a plan.
- Update package.json and package-lock.json together for a release. Tag the exact clean main commit as vX.Y.Z (or vX.Y.Z-beta.N) and push the tag.
- **Betas.** `publish-npm.yml` publishes any version containing `-` with `--tag beta` (`scripts/check-dist-tag.mjs`), then verifies after publishing, on the retry path too, that the expected dist-tag points at the version and that a prerelease is never `latest`. Mark the GitHub release as a prerelease (`gh release create vX.Y.Z-beta.N --prerelease --latest=false`). Install with `paseo plugin update transcript-search --version X.Y.Z-beta.N` (the plugin id, not the package name). `test/release-channel.test.mjs` guards the publish command and the post-publish check.
- .github/workflows/publish-npm.yml validates the tag, runs verification and package inspection, and publishes with npm Trusted Publishing through GitHub OIDC. Do not publish manually.
- Keep npm publisher permissions scoped to tomgrin10/paseo-transcript-search and publish-npm.yml. No long-lived npm token is needed in GitHub.
- Wait for the workflow and registry integrity check before creating a GitHub release or updating an installed copy. Test the bare package-name installer in an isolated Paseo home; never restart the user's daemon.

## Release notes

Every GitHub release, betas included, shows real notes in one shape across Tom's plugins. `scripts/release-notes.mjs`
(identical in each repo; keep the copies in sync) builds the body and the publish workflow creates the release with it:

```
<summary or "## What's new in X.Y.Z-beta.N">

### New        what a user can now do
### Improved   what got better
### Fixed      what stopped going wrong

## Install     the command for that channel, the Paseo minimum
```

- **Betas** are generated: the titles of the PRs merged since the previous tag, grouped by their prefix (`feat` is New,
  `fix` is Fixed, anything else user-visible is Improved). `docs`, `chore`, `ci`, `test`, `refactor` and `build`
  PRs, bots, merge lines and raw commit text never appear. So write PR titles as a sentence a user can read:
  `fix: remember which Follow-up plugin id answered`. No PR numbers, no em dashes.
- **Stable and rc** are curated: add `release-notes/<version>.md` (an rc uses its final version's file) before tagging. One
  summary sentence, then `### New`, `### Improved`, `### Fixed` with plain-words bullets for the person using the plugin,
  grouped by what they get and merged across every beta since the last stable. Omit empty groups. The publish workflow
  runs `node scripts/release-notes.mjs --check <tag>` first and fails a stable or rc tag that has no file, before anything
  is published.
- Releases that already exist: edit the body with `gh release edit <tag> --notes-file <file>`. Never touch the tag, assets
  or the prerelease/latest flags. In-app What's new popups stay major-only; this is GitHub only.
- `node --test scripts/release-notes.test.mjs` covers the generator and runs in `verify`.

## Public repo: no real identifiers

This repository is public, and so is everything built from it: npm packages, release files, PR and issue text. A name that lands in a commit stays in git history and in every published package, and removing it later takes a history rewrite, npm unpublishes and GitHub Support. Keep real-world identifiers out of everything you write here.

- **Never write** the developer's employer or its domain, GitHub org or repo names, Slack or Linear workspace URLs, cloud project, service, registry or deploy-label names, customer names, colleagues' GitHub logins, work email addresses, real machine hostnames, or absolute home paths. This covers code, defaults, tests, fixtures, docs, screenshots, commit messages, PR titles and descriptions, review replies and issues.
- **Use fictional stand-ins:** org `example`, repo `example/app`, project `acme`, host `dev-box`, email `alice@example.com`, path `/home/user`. Ticket keys such as `ABC-123` and first names on their own are fine.
- **Machine-specific values live on the machine.** Which services to watch, who reviews, local paths: read them from local settings. Never ship them as defaults in the code.
- **Output from real data stays local.** Logs, sample results and screenshots from a run on the developer's real setup don't go into a commit or PR as-is. Describe them, or swap every real value for a fictional one first.
- **Commit only source.** Never commit symlinks, `node_modules`, or anything that points into the local machine. Before every commit, read `git diff --cached` for absolute paths and real names.
- **Found one already in the repo?** Fix it in a commit whose message doesn't quote the value (for example "replace a real name with a fictional one"), and tell the developer so they can decide whether history and npm need cleaning too.
