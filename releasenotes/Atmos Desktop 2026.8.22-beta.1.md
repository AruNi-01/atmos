> **Beta release.** Please report issues before the next stable cut.

Atmos Desktop 2026.8.22-beta.1 adds named independent center spaces, a fullscreen center stage, and Token Usage scoped by Computer. Workspace setup moves into the header jobs chip, Settings is regrouped, and signing in through the system browser now returns you to Atmos.

## New Features

- **Center spaces** — keep several named mosaics in one workspace. Extra spaces start empty, reuse the same repo, and stay warm when you switch. The plus menu splits Tabs and Layout.
- **Center fullscreen** — expand a pane over the stage above the footer. Applying a named layout asks before it replaces the current split.
- **Workspace jobs** — setup progress lives in the header jobs chip instead of a full overlay. Ready workspaces stay on the chip so you can open them without leaving the current context. ([#248](https://github.com/AruNi-01/atmos/pull/248))
- **Settings groups** — You, Workspace, Agents, and System, with in-page tabs for General, Editor, Workspace, Remote Access, and Apps. ([#248](https://github.com/AruNi-01/atmos/pull/248), [#250](https://github.com/AruNi-01/atmos/pull/250))
- **Token Usage by Computer** — pick a Computer, view another machine over Relay, or see an All computers total without double-counting the same Cursor account. When you are signed out or have only one Computer, Sign in / Add Computer is in the select slot. ([#252](https://github.com/AruNi-01/atmos/pull/252), [#253](https://github.com/AruNi-01/atmos/pull/253))
- **Guest Prototype Design** — collab invite links open a fullscreen guest board without computer onboarding.
- **Back to Atmos** — after system-browser OAuth, a Back to Atmos action focuses the running desktop window.

## Bug Fixes

- **Shell crash** — opening the app no longer hits a React update-depth loop from sidebar workspace job ids. ([#249](https://github.com/AruNi-01/atmos/pull/249))
- **Window flash** — the native window no longer flashes light on load.
- **Terminal** — resize no longer flickers or dumps leftover wraps; reconnect hydration stays ordered; TUI mouse is not enabled from command names; the selection toolbar stays on one line; grok tmux detection stays in the child PTY.
- **Mosaic** — extra spaces keep their own center context and tmux panes; closing a pane no longer snaps to Overview; docks ignore the source pane; file editors stay hosted outside the tab strip; new tabs land at the end of the strip.
- **Plus menu** — hover still opens it; switching Tabs / Layout requires a click.
- **Scroll** — macOS overlay bounce is back, overlay menus keep wheel events inside, and GitHub drawers stay inside the center-stage card.
- **Quota and Linear** — Cursor live quota prefers usage-summary; expired Linear tokens refresh instead of forcing a reconnect.
- **Notifications** — system notifications use the current brand mark.

## Improvements

- **Mosaic chrome** — drag panes from the header, animated splits, empty-pane launchers sized to the leaf, plus-menu snapshots in saved layouts, and a smoother space switcher.
- **Token Usage** — dedicated loading screen, reopen share after Hub OAuth, public GitHub cards without a computer, and public shares / leaderboards that stay current.
- **Welcome headline** — typewriter copy and shooting-stars background on the landing prompt.
- **DMG volume** — Finder volume icons are inset so the plate does not fill the desktop well.
- **Canvas** — hide the board when the tldraw license overlay appears.
- **Errors** — 404 and server-error screens get a Home action.
- **Settings** — experimental flask notice shared across Browser Use, Desktop Use, and Atmos Computer; account security keeps linked accounts and trusted devices instead of listing Hub sessions.

## Other Changes

- Release tag: `desktop-electron-2026.8.22-beta.1`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.8.18-beta.1...desktop-electron-2026.8.22-beta.1

<!-- atmos-desktop-contributors -->
Thanks to @AruNi-01.

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.22-beta.1/Atmos_2026.8.22-beta.1_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.22-beta.1/Atmos_2026.8.22-beta.1_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.22-beta.1/Atmos_2026.8.22-beta.1_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.22-beta.1/Atmos_2026.8.22-beta.1_x64.AppImage)

</details>
