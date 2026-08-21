Atmos Desktop 2026.8.16 opens Graph History as a center-tab commit graph, restyles Changes around list/tree views and scoped bulk actions, and polishes Launchpad motion across Settings, Skills, and Automations.

## New Features

- **Graph History** — open a topological commit graph in a center tab from the Changes scope menu. Search commits, resize columns, and click a row to show that commit’s diff in Changes. ([#242](https://github.com/AruNi-01/atmos/pull/242))
- **Changes list/tree** — switch the file list between list and tree, with a denser toolbar for Stage all / Unstage all and other scoped bulk actions. ([#242](https://github.com/AruNi-01/atmos/pull/242))
- **Automations memory & runs** — keep persistent `memory.md`, filter the dashboard, and inspect a run in a drawer with chat and artifacts. ([#241](https://github.com/AruNi-01/atmos/pull/241))
- **Skills launchpad** — browse skills with tabs and filters, then open detail with the same push-page motion as Settings and Canvas. ([#241](https://github.com/AruNi-01/atmos/pull/241))
- **Repository scripts** — review setup, run, and purge as separate phases, with a trust hint bound to `.atmos/scripts/atmos.json`. ([#241](https://github.com/AruNi-01/atmos/pull/241))

## Bug Fixes

- **Settings drag** — opening Settings no longer starts a Desktop window drag from the page chrome.
- **Browser address bar** — new Browser tabs focus the URL field so you can type immediately.
- **Scan-and-select hover** — list hover highlighting updates instantly instead of lagging behind the pointer.
- **Desktop Use on quit** — quitting Atmos stops the Desktop Use host instead of leaving it running in the background.

## Improvements

- **Launchpad motion** — Settings, Canvas, and skill detail share one slide transition, and Settings keeps the previous page mounted underneath. ([#241](https://github.com/AruNi-01/atmos/pull/241))
- **Token Usage share** — publish lives in the share menu, public `/tok/@handle` pages no longer embed the leaderboard, and `/tok/leaderboard` stays the ranking destination. ([#240](https://github.com/AruNi-01/atmos/pull/240), [#241](https://github.com/AruNi-01/atmos/pull/241))
- **Side chat attention** — minimized terminal side chats show when they need you, without auto-opening the composer. ([#241](https://github.com/AruNi-01/atmos/pull/241))
- **Drawers** — overlay close chrome is shared across Automations, GitHub, Linear, and similar drawers.
- **Desktop Use branding** — Activity Monitor shows `Atmos Desktop Use` instead of the upstream engine process name.
- **Changes confirm** — destructive bulk actions ask before they run, and switching branch or project drops a stale history selection.

## Other Changes

- Release tag: `desktop-electron-2026.8.16`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.8.15...desktop-electron-2026.8.16

<!-- atmos-desktop-contributors -->
Thanks to @AruNi-01 and @cursoragent.

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.16/Atmos_2026.8.16_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.16/Atmos_2026.8.16_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.16/Atmos_2026.8.16_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.16/Atmos_2026.8.16_x64.AppImage)

</details>
