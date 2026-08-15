Atmos Desktop 2026.8.15 lets you publish a public Token Usage page, opens Settings as its own page, and groups workspaces by live Agent status so you can find Agents that need you without scanning every project.

## New Features

- **Public Token Usage pages** — publish one latest snapshot to `atmos.land/tok/@handle`, with public or unlisted links, social chips, and Token / Cost leaderboards. ([#239](https://github.com/AruNi-01/atmos/pull/239))
- **Settings page** — preferences now live at `/settings` with a sidebar, appearance controls, and Browser cookie import or cleanup. Close leaves Settings in one step. ([#239](https://github.com/AruNi-01/atmos/pull/239))
- **By Agent Status** — group the sidebar and Task kanban into Need permission, Need attention, Running, and Idle. ([#233](https://github.com/AruNi-01/atmos/pull/233))
- **Disk Analyzer worktrees & Agent data** — default scans include machine Git worktrees and Agent session folders, with Clear suggest cards and time-based cleanup hints. ([#228](https://github.com/AruNi-01/atmos/pull/228))
- **Repository script trust** — setup and Run wait until you review every command in `.atmos/scripts/atmos.json`. Trust is bound to the file bytes. ([#231](https://github.com/AruNi-01/atmos/pull/231))
- **Need-attention auto-summary** — after an Agent finishes unacknowledged, Atmos writes a one-sentence recap with next-step chips above the terminal input. ([#214](https://github.com/AruNi-01/atmos/pull/214), [#219](https://github.com/AruNi-01/atmos/pull/219))
- **iOS Simulator preview** — embed serve-sim so you can preview iOS simulators from Desktop. ([#238](https://github.com/AruNi-01/atmos/pull/238))

## Bug Fixes

- **Need-attention recap** — keep the summary after focusing Terminal, and close races that could drop or restore the wrong recap. ([#230](https://github.com/AruNi-01/atmos/pull/230))
- **Untrusted origins** — reject browser WebSocket and HTTP requests from origins that are not trusted. ([#229](https://github.com/AruNi-01/atmos/pull/229))
- **Disk Analyzer** — faster scans; hover-to-cancel and borderless refresh; chart drill-in from Clear suggest; decode session folder names; ignore git submodules as worktrees; unregister worktrees on delete.
- **Sidebar** — keep Project groups collapsed after you fold them, and keep expansion stable under StrictMode.

## Improvements

- **Browser Use** — one state envelope, first-success snapshot, and Settings → Browser as the placement authority. Downloads stay in the system Downloads folder. ([#236](https://github.com/AruNi-01/atmos/pull/236), [#239](https://github.com/AruNi-01/atmos/pull/239))
- **Permission Access** — collect browser-cookie consent and Desktop Use OS grants under Privacy & Security, and ask before Token Usage decrypts cookies.
- **Side chat** — open side chat from agent hook navigation, and keep the overlay focused when you click the modal header.
- **Agent Status** — leftover workspaces (never-run or acknowledged need-attention) now land in Done instead of Idle.
- **Tasks** — warmer GitHub tab cache and Task source tabs so switching sources feels snappier.
- **Token Usage** — tighter metric chrome and less footer noise on GitHub lists.

## Other Changes

- Release tag: `desktop-electron-2026.8.15`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.8.11...desktop-electron-2026.8.15

<!-- atmos-desktop-contributors -->
Thanks to @AruNi-01 and @cursoragent.

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.15/Atmos_2026.8.15_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.15/Atmos_2026.8.15_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.15/Atmos_2026.8.15_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.15/Atmos_2026.8.15_x64.AppImage)

</details>
