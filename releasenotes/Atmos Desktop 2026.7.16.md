Atmos Desktop 2026.7.16 adds first-class Grok Build terminal support. It ships the TanStack Query data layer, GitHub center tabs, workspace grouping, TypeScript 7 tooling, and a wave of terminal and editor reliability fixes.

## New Features

- **Grok Build terminal agent** — First-class support for the Grok Build CLI (`grok`) as a built-in terminal agent, including agent select, run configuration, automations, streaming-json parsing (text + thinking), and theme-paired icons. ([#159](https://github.com/AruNi-01/atmos/pull/159))
- **Grok Build usage & hooks** — Grok Build / SuperGrok subscription credits appear in AI usage. Status-only Grok hooks install under `~/.grok/hooks/` (opt-out respected), auto-install on API startup when `grok` is detected, and a CLI identity probe correctly resolves contested `agent` titles. ([#159](https://github.com/AruNi-01/atmos/pull/159))
- **TanStack Query data layer** — Core application data fetching migrated from Zustand stores to TanStack Query for more predictable caching, refresh semantics, and consistency. Covers project and workspace data, filesystem operations, Git snapshots, agent registry and custom agents, local services, review sessions, GitHub PR cache, and CI run list / file diff views, with query options, hooks, and an event bridge across extended domains. ([#156](https://github.com/AruNi-01/atmos/pull/156))
- **GitHub center tabs** — Pull request details, CI checks, and file diffs open in center tabs instead of modal dialogs, with improved tab persistence and UX.
- **Workspace grouping** — Workspaces group by label and priority in the sidebar, with consistent behavior across project scopes and two-column settings toggles for priority and label grouping.

## Bug Fixes

- Fixed syntax highlighting cache key collisions across FileContents and CodeViewItem that caused stale rendered output.
- Fixed workspace groups collapsing unexpectedly during drag operations and hardened workspace grouping settings against edge cases.
- Fixed multiline agent command launches in the terminal — long commands are delivered as a single bracketed-paste write; multiline shell arguments use ANSI-C quoting.
- Fixed agent-fix storing long prompts to a workspace file instead of embedding them inline, and hardened file-tree path fallbacks.
- Fixed refresh icon spin direction on Atmos Computer and remote access panels.
- Fixed sidebar settings bootstrap retry logic to survive transient failures during app startup.
- Fixed the editor minimap so it stays fixed while the document scrolls.
- Fixed terminal focus returning to the terminal when AI input is hidden.
- Fixed the usage panel embedded footer overlapping scrollable content in global search.
- Hardened Grok-related terminal title matching (pipes, Windows paths, platform-packaged `grok-*` binaries) and disabled incompatible foreign hooks for Grok sessions. ([#159](https://github.com/AruNi-01/atmos/pull/159))
- Fixed CI workflow triggering for R2 sync after desktop releases.
- Fixed landing page Vercel builds for Bun 1.3 and Bun 1.4 lockfile formats, and resolved a Next.js inline script hydration warning.

## Improvements

- Adopted TypeScript 7 with a dual-package toolchain, keeping TypeScript 6 for ESLint while using native `tsc` for typechecking. ([#154](https://github.com/AruNi-01/atmos/pull/154))
- Consolidated duplicate REST endpoints into WebSocket actions, reducing transport surface area and aligning with the WebSocket-first transport rule.
- Preserve terminal scroll position on font resize and hide search match selections when the search overlay is dismissed.
- Cursor built-in launches now use `cursor-agent` instead of the bare `agent` command so identity stays unambiguous when Grok is also installed. ([#159](https://github.com/AruNi-01/atmos/pull/159))
- Agent hooks status card no longer surfaces noisy version numbers; hooks install and labeling are clearer for Grok and other agents.

## Other Changes

- Refactored GitHub detail modal files into the center-tab module.
- Added editor utility dependencies for upcoming editor enhancements.
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-2026.7.9...desktop-2026.7.16
