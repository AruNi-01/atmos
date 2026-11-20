Atmos Desktop 2026.11.20 makes Agent Chat sessions easier to pick up again, keeps Agent activity tied to the terminal tab it belongs to, and shows more accurate quota reset times. Remote connections through Atmos Computer also handle large transfers more efficiently.

## Improvements

- **Atmos Computer** — Remote requests and responses stream through Relay, so large transfers no longer have to wait for the entire body to be buffered. Cancelled requests stop in-flight work, and supported connections can encrypt HTTP payloads and app and terminal frames between the client and Computer. ([#381](https://github.com/AruNi-01/atmos/pull/381))
- **Sidebar and footer** — Projects without workspaces show just the empty label and a New button. Project-row Agent status moves aside when actions appear. The footer’s Agent Sessions popover puts the Observer shortcut beside the title and Clear idle at the right edge.

## Bug Fixes

- **Agent Chat** — Supported agents resume the same conversation on the next message after an idle runtime shuts down. A disconnected provider no longer leaves a turn stuck running, and streamed thinking and tool activity stay with the right assistant message.
- **Terminal tabs** — Agent events and terminal titles stay with the tab that owns them, including when multiple Codex sessions are open. Scrolling respects the live terminal app’s mouse mode, and reconnecting no longer enables mouse tracking for apps that had it disabled.
- **Quota usage** — Codex, Claude, Factory Droid, and OpenCode quota displays better reflect the windows and reset times reported by their providers.
- **Startup and workspace panels** — Local connection checks time out instead of waiting indefinitely, notification preferences load when the connection starts, and closed center panels stay closed when a workspace is restored.
- **Resource Monitor** — On Linux, workspace processes now show their listening ports even when the name in the launch command differs from the name reported by the kernel.
- **Security** — Updated the desktop workbench to the patched Next.js 16.4.5 release. ([#387](https://github.com/AruNi-01/atmos/pull/387))
- **Archive extraction** — Agent tooling rejects archive entries that would write outside the intended destination.

## Other Changes

- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.11.1...desktop-electron-2026.11.20

<!-- atmos-desktop-contributors -->

Thanks to @AruNi-01, @cursoragent, and @dependabot[bot].

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.11.20/Atmos_2026.11.20_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.11.20/Atmos_2026.11.20_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.11.20/Atmos_2026.11.20_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.11.20/Atmos_2026.11.20_x64.AppImage)

</details>
