> **Beta release.** This is a pre-release of Atmos Desktop 2026.7.15. It includes the TanStack Query data layer migration alongside GitHub center tabs, workspace grouping, terminal improvements, and TypeScript 7 adoption. Please report any issues you encounter.

## New Features

- **TanStack Query data layer** — Migrated core application data fetching from Zustand stores to TanStack Query for more predictable caching, refresh semantics, and data consistency. The migration covers project and workspace data, filesystem operations, Git snapshots, agent registry and custom agent listings, local services, review sessions, GitHub PR cache, and CI run list / file diff views. Query options, hooks, and an event bridge were added for seven extended domains, along with a typed operation inventory and Bun validation tests.
- **GitHub center tabs** — GitHub pull request details, CI checks, and file diffs now open in center tabs instead of modal dialogs, with improved tab persistence and UX.
- **Workspace grouping** — Workspaces are now grouped by label and priority in the sidebar, with consistent grouping behavior across project scopes.

## Bug Fixes

- Fixed syntax highlighting cache key collisions across FileContents and CodeViewItem components that caused stale rendered output.
- Fixed workspace groups collapsing unexpectedly during drag operations and hardened workspace grouping settings against edge cases.
- Fixed multiline agent command launches in the terminal — long commands are now delivered as a single bracketed-paste write, preventing truncation or mis-execution. Multiline shell arguments are correctly quoted with ANSI-C quoting.
- Fixed agent-fix storing long prompts to a workspace file instead of embedding them inline, and hardened file-tree path fallbacks.
- Fixed refresh icon spinning in the wrong direction on the Atmos Computer and remote access panels.
- Fixed sidebar settings bootstrap retry logic to survive transient failures during app startup.
- Fixed CI workflow triggering for R2 sync after desktop releases.
- Fixed landing page Vercel builds for both Bun 1.3 and Bun 1.4 lockfile formats, and resolved a Next.js inline script hydration warning.

## Improvements

- Adopted TypeScript 7 with a dual-package toolchain setup, keeping TypeScript 6 for ESLint compatibility while using the native `tsc` for typechecking.
- Consolidated duplicate REST endpoints into WebSocket actions, reducing transport surface area and aligning with the project's WebSocket-first transport rule.
- Preserve terminal scroll position on font resize and hide search match selections when the search overlay is dismissed.

## Other Changes

- Refactored GitHub detail modal files into the center-tab module.
- Added editor utility dependencies for upcoming editor enhancements.
