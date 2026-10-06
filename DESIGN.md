# Paseo transcript search

This plugin extends the established agents-history surface and inherits Paseo's native visual language. It is a task interface for finding something said in a previous session.

Use the host-provided semantic colors (`surface0`, `surface1`, `surface2`, `foreground`, `foregroundMuted`, `border`, `accent`, and status colors), native system typography, Lucide icons, and `layout.compact` for responsive spacing. The host owns headers, navigation, settings scrolling, and settings row presentation. Do not add branding, duplicate headers, or custom settings chrome.

The first action is a focused search field. Literal search, all providers, all dates, and both active and archived sessions are the defaults. Filters sit below the search; status describes coverage and any partial results. Matching snippets are grouped by session and workspace using the inherited layout. Empty, error, indexing, and unavailable-transcript states are explicit.

The Display screen uses Paseo's SettingsSection, SettingsCard, and SettingsSwitch. Preserve keyboard access when its sidebar row is hidden. Display preferences are installation-scoped host settings, not browser storage.
