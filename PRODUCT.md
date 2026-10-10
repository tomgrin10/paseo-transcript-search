# Transcript Search

The user wants a keyboard shortcut to search text in all Paseo session transcripts, using a current-compatible adaptation of panrafal's agents-history plugin. Their five existing plugins also need a persistent option to hide their sidebar entries while retaining Command Center access.

The product is a native Paseo plugin for someone returning to an earlier conversation. Search should cover all connected hosts in one screen, including active and archived sessions, return readable matching excerpts, and make the originating session accessible. Missing provider transcripts should be explicit. Do not cap the selected session set silently.

Paseo 0.11.0 owns navigation, keyboard routing, Lucide icons, light/dark semantic colors, settings presentation, and host-scoped settings storage. The existing agents-history UI is the visual authority; this task adapts its behavior and compatibility rather than redesigning it. There is no new brand, marketing page, or raster asset work.

Transcripts stay on their originating daemon host and are searched through its authenticated plugin connection; matching snippets are sent to connected clients. Install or update the plugin on each searchable host under the same installation ID (`transcript-search`). Host failures must not hide successful results from other hosts. Session, workspace, and project identities remain scoped to their host; opening and restoring a session targets that host. Never include provider persistence credentials in RPC results. Retain source attribution. The optional search index is disposable; the original transcripts are read-only. Archived sessions require confirmation before restoration.
