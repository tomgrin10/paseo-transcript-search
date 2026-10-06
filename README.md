# Transcript Search for Paseo

Search text across active and archived sessions, including Claude subagents and archived Codex transcripts. Requires Paseo **0.10.1 or newer**.

Open **⌘K** on macOS or **Ctrl+K** on Windows/Linux, type **Search all session transcripts**, and press Enter. The search field receives focus. Searches are literal and case-insensitive by default; optional regex, case sensitivity, relevance ranking, and project/provider/date filters are available. Results include matching snippets and links to sessions. Archived sessions ask for confirmation before restoring them.

In **Settings → Plugins → Transcript Search → Display**, disable **Show in sidebar** to keep keyboard access while hiding the sidebar entry. The setting is saved on the host and survives updates and reloads; other connected clients apply it within five seconds.

Paseo session records determine which transcripts belong to sessions. Claude and Codex transcripts are resolved from their configured data directories; other providers are searchable when their native handle points to a local transcript file. Providers without retained transcripts appear as unavailable. Missing files do not prevent other sessions from being searched. The UI searches all selected sessions in batches without the original 2,000-session cutoff. Large searches retain explicit timeout and output-limit notices.

Literal and regex searches use the host's `grep`; optional ranked search builds a local SQLite FTS5 cache on demand and falls back to literal search when SQLite is unavailable. Searches and transcript data remain on your Paseo host and its connected clients.

```sh
paseo plugin install /path/to/paseo-transcript-search --id transcript-search
npm ci
npm run verify
```

Adapted from [panrafal's agents-history](https://github.com/panrafal/paseo-plugins/tree/004c6a80c6aa8e76bb563694c3eee5c2c0b0466f/agents-history), pinned at `004c6a80c6aa8e76bb563694c3eee5c2c0b0466f`, under the included MIT license. The fork uses the current SDK, native persistent display settings, a keyboard-first search entry, and bounded searches across the full session set. It installs no runtime dependencies.

Command Center actions are scoped by Paseo to the current host. Open a workspace or plugin on that host first; the hostless start page does not list plugin actions.

The repository is private. With GitHub authentication configured on the daemon host, you can install it with `paseo plugin install https://github.com/tomgrin10/paseo-transcript-search --id transcript-search`.
