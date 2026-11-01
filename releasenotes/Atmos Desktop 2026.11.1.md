Atmos Desktop 2026.11.1 makes Agent Chat a native place to work. Claude, Codex, OpenCode, Pi, and Grok run as hosts with live model, mode, and effort controls. Sessions share one inbox you can search, filter, and archive, and Observer shows what each agent is doing. Live notes can message an agent in place, Files and Changes dock beside the editor, and Automations, device preview, and Prototype Design go further.

## New Features

- **Native Agent Chat** — run Claude, Codex, OpenCode, Pi, and Grok as hosts. Mode, permission, and effort come from live catalog probes, and a new chat restores the last model and effort. Ask and Plan, an approval card, and in-session questions sit with the composer. Sign in with an API token, the CLI, or the browser, then reload models without leaving the chat. ([#284](https://github.com/AruNi-01/atmos/pull/284), [#282](https://github.com/AruNi-01/atmos/pull/282))
- **Session inbox** — open project, workspace, and thread chats as center tabs, from the sidebar, or in a standalone window. Search them from the command palette, filter by the agents you have enabled, mention one session from the composer, and archive or delete a host session.
- **Agent Observer** — watch live agent steps on a graph, answer permission prompts from a card, and fold or dismiss idle agents. The chat drawer opens from the same cards.
- **Agent Bridge** — address other agents on this Computer to list, send, or request.
- **Live notes** — open a Live tab for worktree markdown, with tables, toggles, headings, and GitHub or path embeds. Hover the note to message an agent; the thread can pin or minimize and stays tied to that file. ([#377](https://github.com/AruNi-01/atmos/pull/377), [#273](https://github.com/AruNi-01/atmos/pull/273))
- **Files and Changes** — dock the file tree and changes list beside editor and diff tabs. ([#287](https://github.com/AruNi-01/atmos/pull/287))
- **Device preview** — pick iOS or Android in the Simulator tab. Each workspace claims a device, with host inventory, appearance, and Android camera controls. ([#288](https://github.com/AruNi-01/atmos/pull/288))
- **Automations** — run Terminal or Chat jobs from setup, the sidebar, and live tabs, and keep the execute mode you chose.
- **Center spaces** — preview a space in place, pin or rename it, and restore mosaic splits from disk. Layout snapshots keep reusable center tabs, and thumbnails refresh while the app is idle.
- **Prototype Design** — draw on an interactive canvas with Artist inner strokes, and reopen the last board on the pinned Excalidraw build. ([#290](https://github.com/AruNi-01/atmos/pull/290))
- **Git** — open Blame and Commit as center tabs, and see added and deleted line counts on workspace status.
- **Link previews** — pasted URLs chip into the composer and show an Open Graph card on hover.
- **Image markup** — draw on an image preview and save it back.
- **Hub sign-in** — sign in with GitHub or Google from the header, the welcome gate, and computer settings.
- **Desktop Use capture** — AppShot captures windows through Desktop Use.
- **macOS permissions** — Accessibility and Screen Recording are requested only when a feature needs them, with a drag-to-list overlay.

## Bug Fixes

- **Archive undo** — archiving a workspace shows a 5-second undo pill so you can restore it before the archive commits.
- **Agent Chat** — the transcript stays aligned with the composer, tool updates stay on the owning message, and a finished Grok turn seals its answer. Thinking and plan stay in the assistant process fold. Stopping a turn no longer lets a queued follow-up send on its own.
- **Computer** — Relay reclaims this machine instead of registering a duplicate, finishes actions when the local client is challenged, and signs this computer back in when Relay rejects it.
- **Center stage** — Close all stays closed when you switch workspaces, deep links win after a layout restore, and the space overview no longer covers the live surface. Unpinned preview tabs stay unpinned.
- **Sessions** — a dropped connection retries sync, the session list stops rescanning, and search closes after you resume a chat.
- **GitHub** — discussion stays in timeline order, views use pill tabs, and a pull request shows both branches when its base changes.
- **Files** — locate still scrolls after the tree expands, and discarding the first change no longer clears the rest of the list.
- **Workspace files** — git blob reads stay inside the workspace.
- **Shell** — host-shortcut scans no longer crash the app, and first-run setup no longer waits on a fake Chat progress step.

## Improvements

- **Tool activity** — choose Compact, Standard, or Detailed density. Subagent tools nest in the transcript and stay open until the child finishes. Search queries and wrapped commands show on the card.
- **Composer** — Grok Fast is a sibling toggle beside the model, favorite groups show agent icons, and large pastes stay chipped. Factory Droid keeps Mode and permission separate and remembers Fast per model.
- **Transcript** — long threads virtualize, both edges fade, and sticky prompts stay pinned while you scroll. Chat favorites and the agent picker sit with the composer.
- **Workspace setup** — creating a workspace keeps worktree options, terminal titles stay live, and a hidden workspace keeps terminals and find state warm. ([#348](https://github.com/AruNi-01/atmos/pull/348))
- **Sidebar** — project rows roll agent status up, and the view you picked stays selected.
- **Settings** — Integrations, Browser, and Desktop Use are separate sections.
- **Launchpad** — first run turns on Terminals and Agent Chat.
- **Mermaid** — diagrams render off the main thread, and CJK labels measure correctly.
- **Installer** — the macOS disk image uses the restyled volume icon and an Applications alias.
- **Runtime** — one Atmos Server stays up for your user session, and the embedded web runtime includes current security fixes.
- **Resource Monitor** — jump from a live process to its conversation.

## Other Changes

- Release tag: `desktop-electron-2026.11.1`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.8.23...desktop-electron-2026.11.1

<!-- atmos-desktop-contributors -->

Thanks to @AruNi-01, @cursoragent, and @dependabot[bot].

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.11.1/Atmos_2026.11.1_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.11.1/Atmos_2026.11.1_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.11.1/Atmos_2026.11.1_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.11.1/Atmos_2026.11.1_x64.AppImage)

</details>
