Atmos Desktop 2026.8.23 adds Prototype Design, named independent center spaces, and a fullscreen center stage. Workspace setup moves into the header jobs chip, Settings is regrouped, Token Usage can be scoped by Computer, and signing in through the system browser now returns you to Atmos.

## New Features

- **Prototype Design** — open an Agent-first wireframe board from Launchpad, the left sidebar, or a workspace-scoped tab. Place components and blocks from a searchable catalog, let a local Agent edit the open board, and optionally invite someone else onto the same canvas. Collab invite links can open a fullscreen guest board without computer onboarding. ([#244](https://github.com/AruNi-01/atmos/pull/244))
- **Center spaces** — keep several named mosaics in one workspace. Extra spaces start empty, reuse the same repo, and stay warm when you switch. Need-attention workspaces ring the space switcher; agent hooks open the space that owns the session.
- **Center fullscreen** — expand a pane over the stage above the footer. Applying a named layout asks before it replaces the current split.
- **Multi-pane center stage** — Changes, Review, Files, Run, and GitHub live as center tool tabs. Split the stage into saved layouts, launch empty panes, and drag terminal panes by their title row.
- **Workspace jobs** — setup progress lives in the header jobs chip instead of a full overlay. Ready workspaces stay on the chip so you can open them without leaving the current context. ([#248](https://github.com/AruNi-01/atmos/pull/248))
- **Settings groups** — You, Workspace, Agents, and System, with in-page tabs for General, Editor, Workspace, Remote Access, and Apps. Reopening Settings restores the last section. ([#248](https://github.com/AruNi-01/atmos/pull/248), [#250](https://github.com/AruNi-01/atmos/pull/250))
- **Token Usage by Computer** — pick a Computer, view another machine over Relay, or see an All computers total without double-counting the same Cursor account. When you are signed out or have only one Computer, Sign in / Add Computer is in the select slot. ([#252](https://github.com/AruNi-01/atmos/pull/252), [#253](https://github.com/AruNi-01/atmos/pull/253))
- **Launchpad layout** — long-press a card or list item to reorder. Placement is remembered across refresh.
- **Back to Atmos** — after system-browser OAuth, a Back to Atmos action focuses the running desktop window.

## Bug Fixes

- **Shell crash** — opening the app no longer hits a React update-depth loop from sidebar workspace job ids. ([#249](https://github.com/AruNi-01/atmos/pull/249))
- **Window flash** — the native window no longer flashes light on load.
- **Terminal** — resize no longer flickers or dumps leftover wraps; reconnect hydration stays ordered; TUI mouse is not enabled from command names; the selection toolbar stays on one line; grok tmux detection stays in the child PTY. Collapsed AI input sits above the pane edge; side chat keeps the agent icon, hittable resize edges, and higher overlay contrast. Live titles drop leftover agent brands after the process exits. Pierre diffs prime before paint and use the Atmos theme.
- **Mosaic** — extra spaces keep their own center context, tab chrome, Run resources, and tmux panes; closing a pane no longer snaps to Overview; docks ignore the source pane; file editors stay hosted outside the tab strip; new tabs land at the end of the strip. An explicit Changes tab in the URL is no longer overwritten by a persisted Files tab.
- **Plus menu** — hover still opens it; switching Tabs / Layout requires a click. Layouts sit first and fullscreen last.
- **Search** — global search keeps focus for typeahead and follows pointer hover in the command list.
- **Account** — GitHub and Google avatars show on the Account profile.
- **Copy and previews** — guest webviews can use the clipboard and local app previews again under the desktop lockdown.
- **Scroll** — macOS overlay bounce is back, overlay menus keep wheel events inside, and GitHub drawers stay inside the center-stage card.
- **Quota and Linear** — Cursor live quota prefers usage-summary; expired Linear tokens refresh instead of forcing a reconnect.
- **Folder Kanban hover** — leaving a hovered column no longer leaves it faded.
- **Disk Analyzer scan** — while a scan is running, hover or focus the control to reveal Cancel instead of a separate scanning label.
- **Notifications** — system notifications use the current brand mark.

## Improvements

- **Prototype Design chrome** — board shortcuts, library, and theme stay with the canvas; agent tools cover layout and lint; the agent island matches Canvas. Handoff maps onto the UI library already in the target project.
- **Mosaic chrome** — drag panes from the header, animated splits, empty-pane launchers sized to the leaf, plus-menu snapshots in saved layouts, and a space switcher that expands the clicked fan card into center.
- **App icon** — the Saturn mark is used across product UI, Dock, and the Desktop Use host helper, and the DMG icon keeps a continuous squircle rim. ([#245](https://github.com/AruNi-01/atmos/pull/245))
- **Token Usage** — dedicated loading screen, reopen share after Hub OAuth, public GitHub cards without a computer, public shares / leaderboards that stay current, and a Keychain enable prompt that explains why the key is needed.
- **Welcome headline** — typewriter copy and shooting-stars background on the landing prompt.
- **DMG volume** — Finder volume icons are inset so the plate does not fill the desktop well.
- **Canvas** — hide the board when the tldraw license overlay appears.
- **Errors** — 404 and server-error screens get a Home action.
- **Settings** — experimental flask notice shared across Browser Use, Desktop Use, and Atmos Computer; account security keeps linked accounts and trusted devices instead of listing Hub sessions.
- **Chrome** — hover fills without color transitions on interactive controls.

## Other Changes

- Release tag: `desktop-electron-2026.8.23`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.8.16...desktop-electron-2026.8.23

<!-- atmos-desktop-contributors -->
Thanks to @AruNi-01 and @cursoragent.

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.23/Atmos_2026.8.23_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.23/Atmos_2026.8.23_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.23/Atmos_2026.8.23_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.23/Atmos_2026.8.23_x64.AppImage)

</details>
