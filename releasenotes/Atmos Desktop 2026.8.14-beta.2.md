> **Beta release.** Beta.2 supersedes beta.1. It carries all beta.1 content plus the changes below. Please report issues before the next stable cut.

## Changes Since Beta.1

- **Browser Use kernel** — one state envelope, first-success snapshot, pick-as-handoff, and Settings → Browser as the placement authority. In-app Browser is the default; new tabs open in the Browser you are already using. ([#236](https://github.com/AruNi-01/atmos/pull/236))
- **Permission Access** — collect browser-cookie consent and Desktop Use OS grants under Privacy & Security, and ask before Token Usage decrypts cookies.
- **Side chat** — open side chat from agent hook navigation, and keep the overlay focused when you click the modal header.
- **Agent Status** — leftover workspaces (never-run or acknowledged need-attention) now land in Done instead of Idle.
- **Atmos Server** — Activity Monitor and Keychain prompts show Atmos Server instead of the leftover sidecar name.

---

Atmos Desktop 2026.8.14-beta.1 groups workspaces by live Agent status, expands Disk Analyzer to Git worktrees and Agent session data, asks before running repository scripts, and auto-summarizes unattended Agents that need attention.

## New Features

- **By Agent Status** — group the sidebar and Task kanban into Need permission, Need attention, Running, and Idle so you can find Agents that need you without scanning every workspace. ([#233](https://github.com/AruNi-01/atmos/pull/233))
- **Disk Analyzer worktrees & Agent data** — default scans now include machine Git worktrees and Agent session folders, grouped by kind, with Clear suggest cards, paths, and time-based cleanup hints. ([#228](https://github.com/AruNi-01/atmos/pull/228))
- **Repository script trust** — setup and Run no longer execute `.atmos/scripts/atmos.json` until you review every command in the file. Trust is bound to the file bytes, so a later pull or edit asks again. ([#231](https://github.com/AruNi-01/atmos/pull/231))
- **Need-attention auto-summary** — after an Agent finishes and stays unacknowledged, Atmos writes a one-sentence recap with next-step chips above the terminal input. Summaries stay after you focus Terminal, and can use the terminal transcript as context. ([#214](https://github.com/AruNi-01/atmos/pull/214), [#219](https://github.com/AruNi-01/atmos/pull/219))

## Bug Fixes

- **Need-attention recap** — keep the summary after focusing Terminal, and close races that could drop or restore the wrong recap. ([#230](https://github.com/AruNi-01/atmos/pull/230))
- **Untrusted origins** — reject browser WebSocket and HTTP requests from origins that are not trusted. ([#229](https://github.com/AruNi-01/atmos/pull/229))
- **Disk Analyzer** — faster scans; hover-to-cancel and borderless refresh; chart drill-in from Clear suggest; decode session folder names; ignore git submodules as worktrees; unregister worktrees on delete.

## Improvements

- **Code Agent Behaviour** — settings for attention auto-summary (enable, delay, agent, model) plus a clearer Behaviour settings layout.
- **Tasks** — warmer GitHub tab cache and Task source tabs so switching sources feels snappier.
- **Token Usage** — tighter metric chrome and less footer noise on GitHub lists.

## Other Changes

- Release tag: `desktop-electron-2026.8.14-beta.2`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.8.11...desktop-electron-2026.8.14-beta.2

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.14-beta.2/Atmos_2026.8.14-beta.2_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.14-beta.2/Atmos_2026.8.14-beta.2_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.14-beta.2/Atmos_2026.8.14-beta.2_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.14-beta.2/Atmos_2026.8.14-beta.2_x64.AppImage)

</details>
