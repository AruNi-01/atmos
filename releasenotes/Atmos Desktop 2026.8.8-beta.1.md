> **Beta release.** Please report issues before the next stable cut.

Atmos Desktop 2026.8.8-beta.1 hardens AppShot dual-shift capture (real window crop, border flash, fly-into-Atmos), pins Desktop Use to control engine 0.19.2 with in-app auto-update when already installed, and expands Browser Use control so page actions and shell wiring stay aligned.

## New Features

- **AppShot fly-in** — after capture, a thumbnail arcs from the source window into Atmos top-right Appshots chrome for a closed visual loop.
- **CG frontmost geometry** — native CGWindowList helper resolves content-window bounds for Electron-style and custom-UI apps when Accessibility trees are empty.
- **Desktop Use engine pin in the app** — ships `engine-manifest.json` with the Desktop build, resolves pin via app resources / bundled `atmos`, and background force-ensures when an installed engine lags the pin (first-time install stays user-initiated).
- **Browser Use control surface** — richer page-action / ref / xy control paths across CLI, crate backends, and Electron browser-use control.

## Bug Fixes

- **AppShot window crop** — dual-shift uses host-engine full-display PNG then crops to the focused window; match host list geometry by **process id** (e.g. `QQMusic` vs `QQ音乐`) so localization no longer forces full-desktop shots or drops animations.
- **AppShot dual-shift under Desktop Use host** — Left⇧+Right⇧ injects into Atmos Desktop Use so Accessibility/Screen Recording stay on one product identity; socket reconnects after host restart.
- **AppShot identity & noise** — allow capturing Atmos itself; stop false “Permissions required” after a successful host PNG; drop noisy `screencapture -l` / Untitled / capture_via spam.
- **Border flash & fly** — restore animation when bounds resolve; brighter border flash; faster fly-in duration.
- **Management Center** — when New Workspace or Canvas is open, only that overlay item stays active so route-backed items (Kanban, Skills, …) do not remain highlighted underneath.

## Improvements

- Desktop Use control engine pin **0.19.2** (from 0.17.0) with updated fixtures and packaging.
- AppShot hot path latency cuts; clearer bounds preflight logging for dual-shift diagnostics.
- Remote access settings grouping and section header polish on web settings.

## Other Changes

- Release tag: `desktop-electron-2026.8.8-beta.1`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.8.7...desktop-electron-2026.8.8-beta.1

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.8-beta.1/Atmos_2026.8.8-beta.1_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.8-beta.1/Atmos_2026.8.8-beta.1_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.8-beta.1/Atmos_2026.8.8-beta.1_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.8-beta.1/Atmos_2026.8.8-beta.1_x64.AppImage)

</details>
