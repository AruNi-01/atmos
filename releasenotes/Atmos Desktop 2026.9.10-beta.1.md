> **Beta release.** Please report issues before the next stable cut.

Atmos Desktop 2026.9.10-beta.1 deepens Agent Chat: native hosts, catalog sign-in, Ask and Plan, and a transcript that stays aligned with the composer. It also docks Files and Changes beside the editor, adds Android Device Preview, and asks for macOS permissions only when a feature needs them.

## New Features

- **Native Agent Chat** — run Claude, Codex, OpenCode, Pi, and Grok as native hosts. Mode, permission, and effort come from live catalog probes; new chats restore the last model and effort instead of resetting to Auto. ([#284](https://github.com/AruNi-01/atmos/pull/284), [#282](https://github.com/AruNi-01/atmos/pull/282))
- **Sign in and catalog reload** — authenticate an agent from the chat dialog (API token, CLI, or browser), then reload models without leaving the composer.
- **Ask, Plan, and approvals** — Ask and Plan chips, an approval card above the composer, and in-session context options so the agent can pause for questions or a plan before it continues.
- **Tool call density** — choose Compact, Standard, or Detailed tool activity in settings so long turns stay readable.
- **Transcript scrolling** — the scroll-to-bottom control shows how many messages sit below the viewport, with a smooth width change between icon-only and labeled states.
- **Files and Changes sidecar** — dock the file tree and changes list beside editor and diff tabs, with empty-state landings and a markdown find panel (including live and preview). ([#287](https://github.com/AruNi-01/atmos/pull/287))
- **Android Device Preview** — pick iOS or Android in the Simulator tab. Each workspace claims a device exclusively; agents can drive a claimed preview without stealing another workspace's device. ([#288](https://github.com/AruNi-01/atmos/pull/288))
- **Resource Monitor** — jump from a live Agent Chat process to its conversation, and close overview tabs with TUI/Chat kind chips.
- **macOS permissions** — Atmos no longer prompts for Accessibility or Screen Recording at launch. Grants appear only when a feature needs them, with a drag-to-list overlay.
- **Markdown mermaid** — diagrams render off the main thread in live notes and previews.
- **Token share** — X handles on `/tok` share and leaderboard pages show a profile hover card. ([#285](https://github.com/AruNi-01/atmos/pull/285))

## Bug Fixes

- **Agent Chat** — keep the transcript aligned with the composer; stop Grok background tools and turns from sticking; keep process groups open while inspecting tools; isolate leftover chat URLs so they do not bleed across center panes.
- **Composer** — chip large pastes, keep model picker tabs circular, and restore landing composer config from cache so the first send matches the picker.
- **Files** — locate still scrolls after the tree expands, and opening a file from the sidebar expands the sidecar.
- **Shell** — empty tab membership no longer collapses center mosaics; new terminal tabs no longer pick a default agent from flag-only OSC titles.
- **Quota** — Grok usage metrics present more clearly, and a failed quota fetch shows below context usage instead of failing silently.

## Improvements

- **Tool results** — search queries and wrapping execute commands show on tool cards; activity lines stay compact in Standard density.
- **Chat chrome** — tighter transcript, scrollbar, and timeline gaps; virtualized history so resume does not mount the full thread.
- **Onboarding** — Chat mode setup continues in the background.
- **Sidebar** — projects remember last-visited time for recency.
- **Popovers** — flyouts flip when they would overflow the viewport.

## Other Changes

- Release tag: `desktop-electron-2026.9.10-beta.1`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.8.30-beta.1...desktop-electron-2026.9.10-beta.1

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.9.10-beta.1/Atmos_2026.9.10-beta.1_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.9.10-beta.1/Atmos_2026.9.10-beta.1_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.9.10-beta.1/Atmos_2026.9.10-beta.1_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.9.10-beta.1/Atmos_2026.9.10-beta.1_x64.AppImage)

</details>
