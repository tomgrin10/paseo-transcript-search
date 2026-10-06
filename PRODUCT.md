# Transcript Search

The user wants a keyboard shortcut to search text in all Paseo session transcripts, using a current-compatible adaptation of panrafal's agents-history plugin. Their five existing plugins also need a persistent option to hide their sidebar entries while retaining Command Center access.

The product is a native Paseo plugin for someone returning to an earlier conversation. Search should include active and archived sessions, return readable matching excerpts, and make the originating session accessible. Missing provider transcripts should be explicit. Do not cap the selected session set silently.

Paseo 0.10.1 owns navigation, keyboard routing, Lucide icons, light/dark semantic colors, settings presentation, and host-scoped settings storage. The existing agents-history UI is the visual authority; this task adapts its behavior and compatibility rather than redesigning it. There is no new brand, marketing page, or raster asset work.

Data stays on the configured daemon host and connected clients. Never include provider persistence credentials in RPC results. Retain source attribution. The optional search index is disposable; the original transcripts are read-only. Archived sessions require confirmation before restoration.
