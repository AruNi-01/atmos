> **Beta release.** For dogfooding and regression testing. Please report issues before the next stable cut.

Atmos Desktop 2026.8.6-beta.1 ships embedded Browser Use and a first-class Desktop Use control surface, stabilizes terminal mouse/TUI sessions, and deepens agent attention plus workspace status so you can drive the OS, browse in-product, and stay oriented without leaving the desktop shell.

## New Features

- Embedded Browser Use (APP-053): open sites in an Electron webview with host selection UI, multi-tab chrome, Composer slash command, and agent page-action chrome so browsing stays inside Atmos. ([#203](https://github.com/AruNi-01/atmos/pull/203), [#204](https://github.com/AruNi-01/atmos/pull/204))
- Desktop Use (APP-052): Settings group, CLI, AppShot capture migration, pinned control engine under the Atmos Desktop Use host, and a readiness/permissions flow for Screen Recording and related grants. ([#199](https://github.com/AruNi-01/atmos/pull/199), [#202](https://github.com/AruNi-01/atmos/pull/202))
- Desktop Use CDP/AX ladder, cursor-matched agent chrome, native highlight binary, and Electron grant overlay for clearer control sessions.
- Terminal TUI stability (APP-054): mouse-mode observe/restore, proportional wheel, reattach handling, and detached-watch behavior so interactive TUIs scroll and recover more reliably.
- Agent need-attention UX with smarter notifications, sticky attention latches, and idle/dismiss hooks. ([#195](https://github.com/AruNi-01/atmos/pull/195))
- Configurable agent activity indicators and center-tab titles that surface agent names from OSC session metadata.
- Terminal cursor appearance settings and persisted default split agent for new tabs.
- Workspace sidebar rows show agent and PR status at a glance.
- Inline edit of worktree diffs in the Changes view, with a smoother edit toolbar and live git gutter updates while typing and after save.
- Local services stop escalation with process-tree confirmation when a simple stop is not enough.

## Bug Fixes

- Desktop Use: fail fast when Screen Recording is missing; recover window coordinates and sessions; route AppShot through the host engine when installed; harden install/capture/overlay paths.
- Browser webview: fixed black screen on open, multi-tab attach, selection/nav/bind, theme color-scheme sync, Arc-style tab chrome, loading overlay, and guest runtime selection.
- Terminal: stopped reattach from stacking TUI frames into scrollback; zero scrollback only for inline mouse TUIs; kept pre-TUI history; reduced warm-switch cursor flash; stabilized center-tab OSC titles.
- Stopped the macOS Dock tile from collapsing to zero width.
- Stabilized the commit message field and refreshed tab chrome.
- Restored footer agent status indicator; polished Desktop Use readiness and permissions UX.
- Normalized GitHub PR list state casing so Open badges show correctly; improved GitHub sidebar layout and discussion UI.
- Hardened process-tree stop, agent child lifecycle, and thread-safety around process group kill.
- Kept warm terminal chrome from painting over light surfaces; polished fullscreen bus padding and shell surface policies.

## Improvements

- Desktop Settings shows the correct version channel and app version for beta/stable builds.
- Desktop Use settings regrouped into collapsible cards with en/zh i18n and settings search coverage.
- Appshots history popover UX and agent activity indicator picker polish.
- macOS icon toolchain, packaging hooks, and unified host/notification icons.
- Release notes publish path injects Contributors mentions and a collapsed Download section for clearer GitHub Releases.

## Other Changes

- Release tag: `desktop-electron-2026.8.6-beta.1`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.8.2-beta.1...desktop-electron-2026.8.6-beta.1

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.6-beta.1/Atmos_2026.8.6-beta.1_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.6-beta.1/Atmos_2026.8.6-beta.1_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.6-beta.1/Atmos_2026.8.6-beta.1_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.6-beta.1/Atmos_2026.8.6-beta.1_x64.AppImage)

</details>
