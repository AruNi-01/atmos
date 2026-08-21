> **Beta release.** Please report issues before the next stable cut.

Atmos Desktop 2026.8.18-beta.1 adds Prototype Design — an Agent-first wireframe board you can open from Launchpad or the sidebar — and rebuilds the workspace around a multi-pane center stage. It also ships the new app mark, a custom Launchpad layout, and copy/preview permissions inside guest webviews.

## New Features

- **Prototype Design** — open a standalone board from Launchpad or the left sidebar, or a workspace-scoped tab from center New. Place shadcn-aligned components and blocks from a searchable catalog, then let a local Agent edit the open board without sharing. Invite is optional when you want another person on the same canvas. ([#244](https://github.com/AruNi-01/atmos/pull/244))
- **Component catalog** — Component and Block tabs, search, variant lists, and placement into nearby empty space with a brief reveal pulse. The catalog sits next to Library in the board sidebar.
- **Multi-pane center stage** — Changes, Review, Files, Run, and GitHub live as center tool tabs. Split the stage into saved layouts, launch empty panes, and drag terminal panes by their title row. The right sidebar is gone.
- **Launchpad layout** — long-press a card or list item to reorder. Placement is remembered across refresh.

## Bug Fixes

- **Copy and previews** — guest webviews can use the clipboard and local app previews again under the desktop lockdown.
- **Folder Kanban hover** — leaving a hovered column no longer leaves it faded.
- **Disk Analyzer scan** — while a scan is running, hover or focus the control to reveal Cancel instead of a separate scanning label.
- **Center tab restore** — an explicit Changes tab in the URL is no longer overwritten by a persisted Files tab.

## Improvements

- **App icon** — the Saturn mark is used across product UI, and the Dock / DMG icon keeps a continuous squircle rim. ([#245](https://github.com/AruNi-01/atmos/pull/245))
- **Token Usage cookies** — the Keychain enable prompt explains why the key is needed and puts Enable in the card corner.
- **Center chrome** — pane titles match the center-stage treatment, with tighter floating chrome and instant list hover.

## Other Changes

- Release tag: `desktop-electron-2026.8.18-beta.1`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.8.16...desktop-electron-2026.8.18-beta.1

<!-- atmos-desktop-contributors -->
Thanks to @AruNi-01 and @cursoragent.

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.18-beta.1/Atmos_2026.8.18-beta.1_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.18-beta.1/Atmos_2026.8.18-beta.1_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.18-beta.1/Atmos_2026.8.18-beta.1_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.18-beta.1/Atmos_2026.8.18-beta.1_x64.AppImage)

</details>
