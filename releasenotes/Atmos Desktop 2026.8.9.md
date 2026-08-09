Atmos Desktop 2026.8.9 brings a full Token Usage overview (tokens/cost, agent and model breakdowns, shareable cards), harder AppShot dual-shift capture with fly-in feedback, pinned Desktop Use control engine 0.19.2 with in-app auto-update, richer Browser Use control, canvas terminal agent status that matches mosaic panes, and GitHub hover user cards with contribution context.

## New Features

- **Token Usage overview** — full-page local session dashboard with Tokens/Cost and Agent/Model tabs, dither charts (heatmap, trend, stacked agents, token mix), agent brand icons, and a share flow that screenshots the page into a rounded Atmos card for social export or save.
- **AppShot fly-in** — after dual-shift capture, a thumbnail arcs from the source window into the Appshots chrome for a closed visual loop.
- **CG frontmost geometry** — native CGWindowList helper resolves content-window bounds for Electron-style and custom-UI apps when Accessibility trees are empty.
- **Desktop Use engine pin** — ships `engine-manifest.json` with the Desktop build, resolves pin via app resources / bundled `atmos`, and background force-ensures when an installed engine lags the pin (first-time install stays user-initiated).
- **Browser Use control surface** — richer page-action / ref / xy control paths across CLI, crate backends, and Electron browser-use control.
- **Canvas terminal agent status** — canvas agent terminals reuse the same agent attention/status chrome as mosaic panes so running and need-attention state stay consistent.
- **GitHub hover user card** — profile hover card with server-side contribution context when reviewing people on GitHub surfaces.

## Bug Fixes

- **AppShot window crop** — dual-shift uses host-engine full-display PNG then crops to the focused window; match host list geometry by process id so localization no longer forces full-desktop shots or drops animations.
- **AppShot dual-shift under Desktop Use host** — Left⇧+Right⇧ injects into Atmos Desktop Use so Accessibility/Screen Recording stay on one product identity; socket reconnects after host restart.
- **AppShot identity & noise** — allow capturing Atmos itself; stop false “Permissions required” after a successful host PNG; drop noisy capture spam.
- **Border flash & fly** — restore animation when bounds resolve; brighter border flash; faster fly-in duration.
- **Management Center** — when New Workspace or Canvas is open, only that overlay item stays active so route-backed items do not remain highlighted underneath.

## Improvements

- Desktop Use control engine pin **0.19.2** with updated fixtures and packaging.
- AppShot hot path latency cuts; clearer bounds preflight logging for dual-shift diagnostics.
- Remote access settings grouping and section header polish.
- Agent island capsule visual polish with ocean BorderBeam.
- Tokscale-backed token usage scanning with broader client coverage and fresher pricing data.

## Other Changes

- Release tag: `desktop-electron-2026.8.9`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.8.8-beta.1...desktop-electron-2026.8.9

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.9/Atmos_2026.8.9_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.9/Atmos_2026.8.9_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.9/Atmos_2026.8.9_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.9/Atmos_2026.8.9_x64.AppImage)

</details>
