Atmos Desktop 2026.8.7 ships embedded Browser Use and Desktop Use, a flexible Management Center layout, deeper GitHub Issues/Actions/Checks workbench, Run terminal project logs, and a steadier terminal and agent attention experience—so you can browse, drive the OS, and stay oriented without leaving the shell.

## New Features

- **Browser Use** — open sites in the in-app browser with multi-tab chrome, host selection, Composer slash command, and agent page-action controls. Morphing browser tabs support drag reorder and overflow scroll. ([#203](https://github.com/AruNi-01/atmos/pull/203), [#204](https://github.com/AruNi-01/atmos/pull/204))
- **Desktop Use** — Settings group, CLI, AppShot capture path, pinned control engine, CDP/AX ladder, and readiness/permissions for Screen Recording and Accessibility. ([#199](https://github.com/AruNi-01/atmos/pull/199), [#202](https://github.com/AruNi-01/atmos/pull/202))
- **Management Center layout** — each center entry has Outside / Inside placement under Settings → Layout; Outside items sit full-width at the top of the left sidebar, Inside items stay in the center grid. Kanban opens as a normal center-stage page (`/kanban`) via ⌘⇧K and global search. ([#207](https://github.com/AruNi-01/atmos/pull/207))
- **GitHub workbench** — Issues sidebar and detail view; Actions workflow graph and commit detail tabs; dedicated PR Checks with merge controls and Agent Fix; editable PR assignees/labels; conflict files via local merge-tree; jump from reviewers to Files line comments. ([#191](https://github.com/AruNi-01/atmos/pull/191), [#193](https://github.com/AruNi-01/atmos/pull/193))
- **Run terminal project logs** — stream and inspect project run output from the desktop shell (APP-055).
- **Terminal titles & TUI** — native OSC 0/2 titles as pane suffixes with marquee for long names; mouse-mode observe/restore, proportional wheel, reattach, and detached-watch for interactive TUIs. ([#180](https://github.com/AruNi-01/atmos/pull/180))
- **Agent attention** — need-attention notifications, sticky attention latches, idle/dismiss hooks, and configurable activity indicators; center-tab titles surface agent names from session metadata. ([#195](https://github.com/AruNi-01/atmos/pull/195))
- Center-stage tab pin, drag reorder, and unified tab context menus.
- Workspace sidebar rows show agent and PR status; inline edit of worktree diffs in Changes with live git gutter updates.
- Canvas empty marquee opens a compact add-widget UI. ([#178](https://github.com/AruNi-01/atmos/pull/178))
- Onboarding agent detection step; agent YOLO mode, split launch flags, and smarter builtin upgrades.
- Shared ColorPicker for project/label colors; durable local event queue for more resilient desktop runs. ([#187](https://github.com/AruNi-01/atmos/pull/187))
- Shared WebSocket session client across web/mobile (Desktop inherits the more consistent connect path). ([#183](https://github.com/AruNi-01/atmos/pull/183))
- Terminal cursor appearance settings; persisted default split agent for new tabs; process-tree stop confirmation when a simple stop is not enough.

## Bug Fixes

- Browser: black screen / multi-tab attach / theme sync; toolbar DevTools open again in release builds (shell DevTools remain blocked); traffic-light and tab-rail inset polish.
- Desktop Use: clearer Accessibility grant overlay; fail fast when Screen Recording is missing; recover window coordinates and sessions.
- Terminal: TUI sessions restore after restart; no stacked reattach frames in scrollback; reduced Grok warm-switch / hop flash; reconnect loops on attach offer a clear New path. ([#175](https://github.com/AruNi-01/atmos/pull/175))
- Management Center: retry settings load so nav is not permanently hidden; keep unsettled state across computer switch; left-sidebar edge-hover peek when collapsed; group header polish.
- Run Script: resolve project when bootstrap lags; clearer no-project toast.
- Kanban center-stage settings load no longer loops.
- GitHub: PR list Open badge casing; conflict listing against current base tip; PR reviewers jump to Files comments; Actions graph styles and status rings.
- Composer `@` file search and keyboard scroll; editor breadcrumb siblings without requiring the file tree open. ([#177](https://github.com/AruNi-01/atmos/pull/177))
- macOS Dock visibility; reduced Keychain re-prompts for cookie helpers.
- Quota usage refresh honors provider switches; standalone CLI install runs in the background on API startup.
- Files Diff hover refresh icon placement; commit message field and tab chrome stability.

## Improvements

- Outside Management Center items render as a clean icon+name list.
- Desktop Settings shows the correct version channel and app version.
- Desktop Use settings regrouped into collapsible cards with en/zh i18n.
- Appshots history popover and agent activity indicator picker polish.
- Electron desktop releases sync to Homebrew and R2 latest installers. ([#185](https://github.com/AruNi-01/atmos/pull/185))
- Landing download/install CTA points at the desktop install flow. ([#176](https://github.com/AruNi-01/atmos/pull/176))

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.7/Atmos_2026.8.7_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.7/Atmos_2026.8.7_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.7/Atmos_2026.8.7_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.7/Atmos_2026.8.7_x64.AppImage)

</details>
