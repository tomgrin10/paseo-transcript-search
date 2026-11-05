# UI verification (November 2026 polish)

Checked on Paseo 0.15.0 with two isolated daemons ("Laptop" and "Build server") connected to one web app, seeded with synthetic Claude and Codex transcripts: active and archived sessions, a Claude subagent, a Cursor session with no transcript and a session whose transcript is gone. No user daemon was restarted and no real session was read or messaged.

- `npm run verify`: typecheck and 24 tests, including the excerpt reader (parse cap, Codex mirror dedupe, file allowlist), the composer attachment source, highlight rules per engine, result grouping and keyboard cursor, snippet clean-up, chat rows and both agent tools.
- RPC probes on both hosts: census, literal/regex/ranked search, excerpt around a line and digest, attachment search with and without a query.
- Web UI at 1440×900 and 390×844, dark and light, plus a 1100px window: empty query (browse and recent searches), results, keyboard walk with the preview following, Best match while the index builds, no results, an invalid regular expression, the archived restore dialog, the phone preview sheet, settings, chat rows for both tools, and the composer's Past conversation picker and pill.
- Host problems staged for real: Build server stopped (unreachable), running without the plugin, and running with a missing `grep` (search fails); Laptop's results stay listed in each.
- Not checked: native iOS and Android builds, the Electron app, a real Claude or Codex session calling the agent tools (the chat rows were staged with recorded tool output), and opening a restored session end to end on a real provider.
