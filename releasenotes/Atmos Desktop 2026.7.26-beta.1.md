> **Beta release.** This is the first beta for Atmos Desktop 2026.7.26. It carries all 2026.7.19 beta content plus the work below. Please report any issues before the stable release.

## Changes Since 2026.7.19-beta.2

- **Project / Workspace Groups** — Organize projects and workspaces into top-level groups with multi-mode Kanban boards, drag reorder, adopt/follow dialogs, and a polished two-column sidebar. ([#170](https://github.com/AruNi-01/atmos/pull/170))
- **Workspace Surface Cache** — Switch between warm workspaces instantly while keeping terminals and panes alive, with higher warm-workspace limits and non-blocking hops. ([#169](https://github.com/AruNi-01/atmos/pull/169))
- **Disk Analyzer** — Browse disk usage from the Management Center with Atmos-scoped scans, treemap/sunburst views, cleanup actions, and breadcrumb navigation. ([#168](https://github.com/AruNi-01/atmos/pull/168))
- **Browser cookie sync & site data** — Sync browser cookies into the in-app browser, clear cache/site data from a toolbar overflow menu, and improve CHIPS partition detection. ([#166](https://github.com/AruNi-01/atmos/pull/166))
- **Dynamic Skills disable** — Turn skills off from the prompt composer and terminal AI input without losing them for later restore. ([#167](https://github.com/AruNi-01/atmos/pull/167))
- **Onboarding wizard** — Guided first-run flow with dependency checks, install guides, and temporary Atmos terminals for setup. ([#163](https://github.com/AruNi-01/atmos/pull/163))
- **Native folder picker** — Use the OS folder dialog when importing projects on Desktop.
- **Terminal `/spawn`** — Spawn a new agent terminal that reuses the current agent context.
- **Canvas overlay keep-alive** — Keep closed Canvas overlays warm for an hour so reopen feels instant.
- Fixed terminal close confirmation for running panes, selection toolbar clamping, named-terminal pane budgets, and agent-hook late progress after idle.
- Disabled DevTools in production Desktop builds and improved Factory Droid multi-window billing limits.

---

## New Features

- Added local Canvas documents with automatic drafts, document management, autosave, and document scripts for interactive Canvas tools. ([#162](https://github.com/AruNi-01/atmos/pull/162))
- Added Canvas widgets for GitHub pull requests and Actions, plus improved agent diagrams, follow controls, and screenshot previews. ([#160](https://github.com/AruNi-01/atmos/pull/160), [#161](https://github.com/AruNi-01/atmos/pull/161))
- Added center-stage browser tabs and concurrent isolated browser windows for Desktop.
- Added workspace note summaries and clearer separation between Canvas agent chats.
- Added Project / Workspace Groups with multi-mode Kanban boards, drag reorder, and adopt/follow dialogs. ([#170](https://github.com/AruNi-01/atmos/pull/170))
- Added workspace surface caching for seamless multi-workspace switching with keep-alive terminals. ([#169](https://github.com/AruNi-01/atmos/pull/169))
- Added Disk Analyzer in the Management Center for Atmos-scoped usage scans and cleanup. ([#168](https://github.com/AruNi-01/atmos/pull/168))
- Added browser cookie sync, toolbar overflow actions, and clear cache/site-data controls. ([#166](https://github.com/AruNi-01/atmos/pull/166))
- Added Dynamic Skills disable from the prompt composer and terminal AI input. ([#167](https://github.com/AruNi-01/atmos/pull/167))
- Added an onboarding wizard with dependency checks and install guides. ([#163](https://github.com/AruNi-01/atmos/pull/163))
- Added a native OS folder picker for Desktop project import.
- Added `/spawn` terminal command that reuses the current agent context.
- Added Canvas closed-overlay keep-alive with a one-hour unmount TTL.

## Bug Fixes

- Fixed Canvas document writes, renames, deletes, autosave, keyboard input scopes, and replacement documents so content remains isolated and reliable.
- Fixed Chinese labels for recent Canvas controls, including copying hovered styles, framing selections, and page-menu controls.
- Fixed stale workspace note updates, terminal mouse tracking after reattachment, long browser-tab labels, and transformed file-tree context menus.
- Fixed group create/delete races, membership cleanup, reorder races, and sidebar menu open/rename reliability. ([#170](https://github.com/AruNi-01/atmos/pull/170))
- Fixed workspace switch blocking, warm-frame terminal budgets, and restore of center tabs after hops. ([#169](https://github.com/AruNi-01/atmos/pull/169))
- Fixed Disk Analyzer chart transitions, list drill-in breadcrumbs, treemap hover, and scan-session cleanup on disconnect. ([#168](https://github.com/AruNi-01/atmos/pull/168))
- Fixed browser cookie backup/error propagation and CHIPS partition detection for site data. ([#166](https://github.com/AruNi-01/atmos/pull/166))
- Fixed skills project context so project-mode skills use the real project GUID instead of a workspace id. ([#167](https://github.com/AruNi-01/atmos/pull/167))
- Fixed onboarding install-namespace i18n, create-workspace update loops, and first-run gate validation. ([#163](https://github.com/AruNi-01/atmos/pull/163))
- Fixed terminal selection toolbar clamping, split-submenu dismissal, and Run/Stop from shell shim title state.
- Fixed Factory Droid multi-window billing limits and disabled DevTools in production Desktop builds.
- Fixed agent-hook late progress after idle and cleared progress when a pane is killed.

## Improvements

- Improved Canvas viewport focus, pinned terminal targeting, GitHub widget details, and document-script capability handling.
- Improved the sidebar workspace list with pagination controls and clearer browser-tab separators.
- Improved warm-workspace defaults (up to 8) and session-list snapshot caching for faster header/sidebar hops.
- Improved Group sidebar chrome, count/menu slot behavior, and a11y for reorder and error states.
- Improved Disk Analyzer default Atmos-scoped scans, details cleanup UX, and chart polish.
- Improved onboarding layout so form and art fit one screen as a centered cluster.
- Confirm before closing terminal tabs that still have running panes.

## Other Changes

- Refined end-to-end report retention and GitHub Pages reporting behavior.
- Renamed agent-hook config file to `atmos-hooks.json`.
- Updated Mole referral link and desktop dialog capability wiring.
