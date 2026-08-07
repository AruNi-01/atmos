> **Beta release.** Please report issues before the next stable cut.

Atmos Desktop 2026.8.7-beta.1 ships a more flexible Management Center layout (per-item Outside/Inside placement), morphing browser and center-stage tabs with drag reorder, Run terminal project logs, and the embedded Browser Use plus Desktop Use control surface so you can place tools where you work, drive the OS, and browse in-product without leaving the shell.

## New Features

- Management Center layout: every center entry is a switch under **Settings → Layout → Management Center**, with **Outside / Inside** placement — Outside items sit full-width at the top of the left sidebar; Inside items stay in the 2-column center grid. ([#207](https://github.com/AruNi-01/atmos/pull/207))
- Kanban opens as a normal center-stage page (`/kanban`) instead of a full-screen modal; ⌘⇧K and global search navigate there.
- Morphing browser tabs with drag reorder and overflow scroll, plus center-stage tab pin → drag reorder and unified tab context menus.
- Run terminal project logs (APP-055): stream and inspect project run output from the desktop shell.
- Embedded Browser Use (APP-053): in-product webview browsing with host selection, multi-tab chrome, Composer slash command, and agent page-action chrome.
- Desktop Use (APP-052): Settings group, CLI, AppShot capture migration, pinned control engine, CDP/AX ladder, and readiness/permissions flow for Screen Recording and Accessibility.
- Terminal TUI stability (APP-054): mouse-mode observe/restore, proportional wheel, reattach handling, and detached-watch behavior.
- Agent need-attention UX with smarter notifications, sticky attention latches, and idle/dismiss hooks.
- Configurable agent activity indicators, center-tab titles from OSC session metadata, terminal cursor appearance settings, and persisted default split agent for new tabs.
- Workspace sidebar rows show agent and PR status; inline edit of worktree diffs in Changes with live git gutter updates.
- Local services stop escalation with process-tree confirmation when a simple stop is not enough.

## Bug Fixes

- Desktop Use: clearer Accessibility grant overlay and settings copy; fail fast when Screen Recording is missing; recover window coordinates and sessions.
- Management Center: retry settings load so nav is not permanently hidden; keep unsettled state across computer switch; ignore stale experiment settings loads after computer switch.
- Browser webview: morphing tab strip polish; black screen / multi-tab attach / theme sync fixes from the prior line.
- Run Script: resolve project when bootstrap lags; no-project toast copy.
- Kanban center-stage settings load no longer loops.
- Quota usage refresh honors provider switches; standalone CLI install runs in the background on API startup.
- Terminal reattach / mouse TUI scrollback and warm-switch cursor flash fixes retained from the prior line.
- Normalized GitHub PR list state casing; process-tree stop and agent child lifecycle hardening.

## Improvements

- Outside Management Center items render as an icon+name list without dividers between entries.
- Experimental badge on Terminals / Agents / Automations when those entries remain experiment-gated; Experiments settings keep Project Wiki (Center Tabs) only.
- Desktop Settings shows the correct version channel and app version for beta/stable builds.
- Appshots history popover UX and agent activity indicator picker polish.
- Release notes publish path injects Contributors mentions and a collapsed Download section.

## Other Changes

- Release tag: `desktop-electron-2026.8.7-beta.1`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.8.6-beta.3...desktop-electron-2026.8.7-beta.1

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.7-beta.1/Atmos_2026.8.7-beta.1_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.7-beta.1/Atmos_2026.8.7-beta.1_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.7-beta.1/Atmos_2026.8.7-beta.1_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.7-beta.1/Atmos_2026.8.7-beta.1_x64.AppImage)

</details>
