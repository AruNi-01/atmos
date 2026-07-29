Atmos Desktop 2026.7.29 moves production Desktop to the Electron-based shell, and the Tauri desktop path is no longer the product ship path. It also ships bundled Server runtime, native AppShot dual-shift capture, binary-safe git diffs with image previews, packaging polish, and reliability fixes across skills, terminal, and refresh flows.

## New Features

- **Production desktop engine cutover (Tauri → Electron)** — Atmos Desktop now ships from the Electron production shell (`apps/desktop-electron`) with product identity `Atmos` / `com.atmos.desktop`. The previous Tauri desktop path is deprecated for product releases; users should install this Electron-built `desktop-electron-*` channel going forward.
- Shipped the production Atmos desktop package path with bundled Atmos Server runtime and shared on-disk contracts (`~/.atmos/appshots`, `~/.atmos/desktop`, tunnel gateway + entry token).
- Added native AppShot dual-shift capture with live TCC permission handling, improved frontmost-app detection, and polished capture UX / CLI detection.
- Added binary-safe file diffs: classify content as text, binary, or too-large; never ship binary bytes over the git-diff WebSocket path; and render host `BinaryDiffCard` previews (including image before/after with click-to-zoom). ([#174](https://github.com/AruNi-01/atmos/pull/174))
- Added secure `GET /api/system/git-blob` previews for local and index blobs, with strict rev/path validation and size caps. ([#174](https://github.com/AruNi-01/atmos/pull/174))
- Added a custom minimal macOS DMG layout for cleaner install packaging.

## Bug Fixes

- Fixed skill and wiki YAML frontmatter parsing for folded and literal block scalar descriptions so multi-line fields no longer show indicators like `>-`. ([#173](https://github.com/AruNi-01/atmos/pull/173))
- Fixed terminal TUI mouse hover after reattach (APP-046).
- Fixed user Refresh so files, git status, and PRs re-fetch instead of serving stale snapshots.
- Fixed disabled skill agent icons so they render grayed out instead of looking active.
- Fixed Windows packaging for skill symlinks and restored binary copy after symlink-safe skill packaging.
- Fixed macOS Gatekeeper “damaged” package prompts with ad-hoc codesign of sealed resources.
- Fixed binary diff UI polish: left/right Previous/Current panels, compact binary icons in file lists, and previews embedded inside Pierre CodeView items. ([#174](https://github.com/AruNi-01/atmos/pull/174))

## Improvements

- Improved release artifact naming: local packages use clean `Atmos.*` names; CI renames multi-arch GitHub assets with version and architecture.
- Improved AppShot logging by dropping verbose main-process debug noise.
- Improved tunnel gateway handling and cookie-helper resolution in the production desktop shell.

## Other Changes

- Release tag: `desktop-electron-2026.7.29`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.7.27-beta.1...desktop-electron-2026.7.29
