Atmos Desktop 2026.8.11 ships Atmos Hub sign-in and account security, Relay device credentials for multi-device work, Linear issue integration in Tasks, mobile QR pairing, and a redesigned Token Usage overview with shareable charts.

## New Features

- **Atmos Hub account** — sign in with Hub, manage linked accounts and sessions, and use account security settings (name, sessions, delete account) from Settings.
- **Relay device identity** — computers enroll as Hub-backed devices so Desktop, web, and mobile share a consistent device credential model instead of hand-managed access tokens.
- **Linear tasks** — connect Linear via OAuth, browse and filter issues in Tasks, open issue drawers, and link workspaces to external Linear issues.
- **Mobile pair QR** — show a pair code/QR from Atmos Computer so a phone can claim a device credential and connect without pasting tokens.
- **Token Usage overview** — full-page token usage with dither charts, sliding metrics, heatmap/share tooling, and a compact metric/dimension cycle control.
- **Shared Hub & Relay clients** — common client packages for auth, devices, and Relay sessions across Desktop, web, and mobile.

## Bug Fixes

- **Desktop boot errors** — reject non-UI servers and show clear HTML error pages when the local runtime cannot serve the app shell.
- **Port reclaim** — reclaim the default local API port when a stale process is holding it, including hub-auth routes in the static desktop build.
- **AppShot host matching** — align structural tests and host-window matching so capture stays reliable.
- **Disk Analyzer paths** — wrap long paths in the delete confirmation so the popover stays readable.
- **Task GitHub search** — hydrate the default open-issue search on first load so lists are not empty until a manual refresh.
- **Token / quota data paths** — keep token-usage and quota-usage under the canonical data layout (not the desktop install tree).

## Improvements

- **Canonical `~/.atmos` layout** — credentials, state, config, and data live under a consistent home layout shared by CLI, Desktop, and runtime.
- **Token Usage polish** — morphing charts, model icons, loading tips, and share export for the usage surface.
- **Integrations settings** — clearer Linear and GitHub integration management in Settings.
- **Quality & packaging** — TypeScript 7 typecheck alignment, CI lint/typecheck fixes, and packaging stability for the Electron shell.

## Other Changes

- Release tag: `desktop-electron-2026.8.11`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.8.10...desktop-electron-2026.8.11

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.11/Atmos_2026.8.11_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.11/Atmos_2026.8.11_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.11/Atmos_2026.8.11_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.11/Atmos_2026.8.11_x64.AppImage)

</details>
