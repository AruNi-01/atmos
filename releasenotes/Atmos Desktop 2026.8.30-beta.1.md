> **Beta release.** Please report issues before the next stable cut.

Atmos Desktop 2026.8.30-beta.1 makes Agent Chat a first-class conversation host: center-stage tabs, a history sidebar, and a standalone window that share the same chats. It also ships a live markdown editor for notes, persists center layouts on disk, and polishes tool results, GitHub discussion, and file tree navigation.

## New Features

- **Agent Chat** — start and resume conversations as center-stage tabs, from the plus menu, or in a standalone window. History is grouped by working directory, each session shows the agent that ran it, and switching chats keeps the title instead of flashing New session. Project, workspace, and thread chats all appear in the standalone list. ([#278](https://github.com/AruNi-01/atmos/pull/278))
- **Chat composer and permissions** — pick model and thinking before the agent starts, attach files into the conversation, queue follow-ups while a turn is running, and approve or deny permission prompts on a card above the composer.
- **Live markdown notes** — open a Live tab for worktree markdown. Untitled notes save as `Untitled.md` in the current project or workspace, and Live supports tables, toggles, headings, and embeds without hijacking ordinary links. ([#273](https://github.com/AruNi-01/atmos/pull/273), [#279](https://github.com/AruNi-01/atmos/pull/279), [#280](https://github.com/AruNi-01/atmos/pull/280))
- **Center layout persist** — mosaic splits and tab placement are stored on disk and restored when you reopen a workspace. Closing a tab returns to the previous one. ([#274](https://github.com/AruNi-01/atmos/pull/274))
- **Footer agent overview** — the footer session popover lists every agent state, including exited sessions you can dismiss. ([#277](https://github.com/AruNi-01/atmos/pull/277))

## Bug Fixes

- **Agent Chat** — stop interrupts an in-flight turn so the queue does not auto-fire; tool and plan updates fold into the live transcript; attachments go out as resource links; catalog probing no longer races send.
- **Markdown Live** — backspace deletes whole blocks, IME composition in headings stays intact, empty inline code and leftover toggle markup are cleaned up, and toolbar converts keep shortcuts working. ([#279](https://github.com/AruNi-01/atmos/pull/279), [#280](https://github.com/AruNi-01/atmos/pull/280))
- **GitHub** — PR and issue discussion map REST timeline events so comments and reviews show in order. ([#272](https://github.com/AruNi-01/atmos/pull/272))
- **Changes** — discarding the first file no longer clears the rest of the list.
- **Shell** — agent pane jumps stay on the owning space; Overview overlay panes scroll again; Project overflow menu separators are inset.

## Improvements

- **Tool results** — agent tool cards format diffs, code, and command output instead of dumping raw payloads. ([#276](https://github.com/AruNi-01/atmos/pull/276))
- **File tree** — folders nest as branches with cached path lookup so expanding directories stays stable.
- **Sidebar** — project logos invert with the theme; unstatused workspaces group with their project.
- **Desktop package** — unused Electron locales and SwiftShader are dropped from the installer.

## Other Changes

- Release tag: `desktop-electron-2026.8.30-beta.1`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.8.23...desktop-electron-2026.8.30-beta.1

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.30-beta.1/Atmos_2026.8.30-beta.1_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.30-beta.1/Atmos_2026.8.30-beta.1_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.30-beta.1/Atmos_2026.8.30-beta.1_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.30-beta.1/Atmos_2026.8.30-beta.1_x64.AppImage)

</details>
