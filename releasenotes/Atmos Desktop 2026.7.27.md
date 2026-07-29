Atmos Desktop 2026.7.27 ships Project/Workspace Groups with Kanban boards, warm workspace surface caching, Disk Analyzer, browser cookie sync, Dynamic Skills disable, a first-run onboarding wizard, and a stronger Canvas + composer context workflow — including protocol chips for AI context paste and browser element selections.

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
- Added unified AI context protocol chips in the prompt composer — paste or insert context (including browser element selections from Preview) as structured chips instead of raw text.

## Bug Fixes

- Fixed Canvas document writes, renames, deletes, autosave, keyboard input scopes, and replacement documents so content remains isolated and reliable.
- Fixed Chinese labels for recent Canvas controls, including copying hovered styles, framing selections, and page-menu controls.
- Fixed stale workspace note updates, terminal mouse tracking after reattachment, long browser-tab labels, and transformed file-tree context menus.
- Fixed group create/delete races, membership cleanup, reorder races, and sidebar menu open/rename reliability. ([#170](https://github.com/AruNi-01/atmos/pull/170))
- Fixed workspace switch blocking, warm-frame terminal budgets, and restore of center tabs after hops. ([#169](https://github.com/AruNi-01/atmos/pull/169))
- Fixed Disk Analyzer chart transitions, list drill-in breadcrumbs, treemap hover, and scan-session cleanup on disconnect. ([#168](https://github.com/AruNi-01/atmos/pull/168))
- Fixed Disk Analyzer Windows desktop runtime build: identity and allocated-size queries now use stable Win32 handle APIs.
- Fixed browser cookie backup/error propagation and CHIPS partition detection for site data. ([#166](https://github.com/AruNi-01/atmos/pull/166))
- Fixed skills project context so project-mode skills use the real project GUID instead of a workspace id. ([#167](https://github.com/AruNi-01/atmos/pull/167))
- Fixed onboarding install-namespace i18n, create-workspace update loops, and first-run gate validation. ([#163](https://github.com/AruNi-01/atmos/pull/163))
- Fixed terminal selection toolbar clamping, split-submenu dismissal, and Run/Stop from shell shim title state.
- Fixed Factory Droid multi-window billing limits and disabled DevTools in production Desktop builds.
- Fixed agent-hook late progress after idle and cleared progress when a pane is killed.
- Fixed native Preview webview occlusion so browser content stays hidden under sidebar peek and maximized browser layouts.

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
- Refreshed the landing-page feature showcase demos and README feature presentation. ([#171](https://github.com/AruNi-01/atmos/pull/171))
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-2026.7.16...desktop-2026.7.27
