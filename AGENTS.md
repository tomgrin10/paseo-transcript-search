# Transcript Search

Paseo 0.10.1 or newer. This is a trusted plugin with independent client and server entries.

- Keep contribution wiring in `index.client.tsx` and `index.server.ts`.
- `client/` contains React Native surfaces; `server/` contains filesystem and search code; `shared/` contains contracts and models safe in both bundles.
- Runtime dependencies come from Paseo; install only development dependencies.
- All session records and transcripts remain on the daemon host. Never commit them, credentials, indexes, logs, daemon configuration, or local machine paths.
- Preserve the MIT attribution for the agents-history code from panrafal.
- The sidebar setting lives in the host's native installation-scoped settings; hiding a sidebar item must retain the surface and Command Center actions.
- Search every selected session in bounded batches. Do not silently restore the old 2,000-session cutoff.
- Session records may have a null persistence value; include them as unavailable rather than dropping them from history.
- Build the optional SQLite index only when ranked search requests it. Literal search requires no index.
- Release intervals, registrations, subprocesses, and the SQLite handle during cleanup. Never restart the Paseo daemon to load changes; reload only this plugin.
- Verify with `npm ci`, `npm run verify`, `npm pack --dry-run`, a plugin reload, RPC probes, and desktop/mobile UI checks. The tests must use isolated provider and Paseo data directories.
