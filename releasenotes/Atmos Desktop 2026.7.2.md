Atmos Desktop 2026.7.2 is the first calendar-versioned desktop release. It rolls up the full desktop-facing work since `desktop-v2.0.0`: richer canvas workspaces, stronger preview and standalone-window flows, more reliable Agent Chat history, tighter Git/GitHub workflows, local runtime and CLI distribution hardening, and a broad set of CI, release, and landing-site follow-through.

## New Features

- Added calendar release naming across Desktop, CLI, Local Web Runtime, and Local Model Runtime, with tags such as `desktop-2026.7.2`, `cli-2026.7.2`, and `local-web-runtime-2026.7.2` instead of `v`-prefixed versions.
- Added desktop preview DevTools, a dedicated desktop preview browser window, native preview occlusion handling, and standalone browser tab preservation so preview workflows can move between embedded and separate windows without losing state.
- Added canvas workspace surfaces, canvas widgets, shared changes UI inside canvas widgets, safer canvas widget navigation, and more stable widget placement for code, preview, and review workflows.
- Added scoped changes diff views, branch validation, remote branch qualification, renamed-path handling in diffs, and stale commit-scope cleanup for more reliable Git change review.
- Added stronger Agent Chat standalone-window coordination, standalone handoff state preservation, global ACP chat history, visible ACP working directories in chat history, compact ACP history metadata, and improved tool output rendering.
- Added a message-link safety modal and refined agent modal behavior so external or sensitive links are handled more deliberately.
- Added streamlined Atmos Computer relay setup, multi-value GitHub trigger filters, GitHub modal interaction improvements, and automation-limit hardening for GitHub/relay workflows.
- Added terminal agent input shortcuts and refreshed terminal/settings panels to make repeated agent work faster.
- Added a localized landing experience and refreshed feature showcase, plus an editorial Atmos intro video for the marketing site.
- Added text-to-Lottie skill support and documented the Lottie workflow.
- Added layered Playwright E2E CI, smoke suites, and a reusable verification harness for desktop/web flows.

## Bug Fixes

- Fixed right-sidebar file reveal behavior.
- Fixed desktop preview chrome, picker behavior, fullscreen interactions, preview browser behavior, standalone preview windows, preview page metadata sync, and native preview overlay behavior while app overlays or loading states are active.
- Fixed native preview visibility so native preview content stays hidden behind blocking overlays instead of visually leaking through.
- Fixed shared app helper stability and preview browser edge cases that could affect desktop shell flows.
- Fixed locale-free GitHub setup return URLs, GitHub setup completion, installation-token parsing, stale GitHub installation selection, callback authorization fallback, trigger setup refresh, and hosted access-key display.
- Fixed PR modal file-change scrolling and GitHub actions modal review issues.
- Fixed branch and diff edge cases, including shallow fetch targets, renamed-path diffs, stale commit scope data, missing scope cleanup, and workspace branch validation.
- Fixed canvas and preview stability issues, including canvas widget navigation isolation, file-tree context menu positioning in canvas overlays, canvas focus pulse scale, preview selection, and several canvas/ACP review findings.
- Fixed agent chat review issues, follow-up review feedback, session persistence, ACP chat panel history UX, and terminal history metadata.
- Fixed imported projects staying visible when empty, including mobile project import visibility.
- Fixed desktop startup error routing.
- Fixed CLI updater asset selection, invalid CLI install-result handling, checked CLI release installation, and runtime-manager CLI update parsing.
- Fixed Rust CI, Linux clippy, diagnostics clippy, token-usage clippy, infra migration tests, Bun setup, web lint regressions, and typecheck regressions around agent chat sessions.
- Fixed E2E CI startup and readiness races, static export root setup, API prebuild/startup behavior, missing client-session handling, smoke assertions, and changed-path web CI scoping.

## Improvements

- Switched the workbench i18n flow to runtime locale handling, reducing mismatches between Desktop, Web, and local runtime entry points.
- Reduced canvas browser viewport lag and improved preview fullscreen interaction smoothness.
- Improved canvas, automation, review, editor preview, repository workflow, app shell, connection, and agent workflow surfaces across the web/desktop workbench.
- Improved global search matching, settings highlighting, workspace welcome content, shared utilities, and feature-showcase layout.
- Improved runtime and frontend integration boundaries, including local runtime publishing under the `atmos-land` scope and removal of the older local runtime npm installer path.
- Moved CLI update logic into runtime-manager, shared CLI updater logic, and hardened release-asset selection so installers and runtime setup choose the intended platform package.
- Added manual-only desktop update handling with GitHub links for cases where automatic update installation is not the right path.
- Optimized E2E setup runtime usage, added setup mocks, cached web translator stability, and limited web lint checks to relevant source changes.
- Kept Windows MSI packaging compatible with calendar app versions by mapping desktop app version `2026.7.2` to the MSI-safe WiX version `26.7.2`.

## Other Changes

- Updated release documentation, release skills, install scripts, Homebrew cask generation, R2 sync logic, and landing changelog data for the new calendar-version release model.
- Added multiple code-quality review records and follow-up cleanup commits from the release window.
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-v2.0.0...desktop-2026.7.2
