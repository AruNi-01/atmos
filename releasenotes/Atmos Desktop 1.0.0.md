Atmos 1.0.0 is our first major release. This version brings remote access to your desktop, real-time agent state tracking across the entire UI, a live file tree with Git status, branch sync visibility in the top bar, and a range of reliability and polish improvements throughout the app.

## New Features

- **Remote Access** — Connect to your Atmos desktop from anywhere using Tailscale, Cloudflare Tunnel, or ngrok. Enable the built-in web service from the desktop app and share access over the internet or your local network. Includes opt-in LAN trust for the API. ([#67](https://github.com/AruNi-01/atmos/pull/67), closes [#26](https://github.com/AruNi-01/atmos/issues/26))

- **Agent Hooks & Real-Time State Sync** — Agent lifecycle events (running, idle, waiting for permission, complete) now flow through hooks for Claude Code, Codex, and OpenCode, keeping the sidebar, footer, and terminal tabs in sync in real time. A new animated bell icon appears when an agent is waiting for your permission. ([#63](https://github.com/AruNi-01/atmos/pull/63), closes [#24](https://github.com/AruNi-01/atmos/issues/24), [#25](https://github.com/AruNi-01/atmos/issues/25))

- **Live File Tree with Git Status** — The file tree now updates in real time and shows live Git status indicators, so you can see which files have been modified, added, or deleted without leaving the editor pane.

- **Branch Sync Status in Top Bar** — The top bar now shows whether your current branch is ahead, behind, or in sync with its remote, giving you a quick read on your Git state at all times. ([#66](https://github.com/AruNi-01/atmos/pull/66))

- **Skills UI Overhaul** — The skills panel and settings modal have been redesigned with a refreshed layout, smooth view transitions between list and detail views, custom agent SVG icons, and a new SkillAgentBadge component. ([#67](https://github.com/AruNi-01/atmos/pull/67))

## Bug Fixes

- **PTY Leak on Page Refresh** — Fixed a leak where terminal PTY sessions were not properly released on page refresh. Sessions now use stable grouped names to prevent accumulation across reloads. ([#68](https://github.com/AruNi-01/atmos/pull/68), closes [#64](https://github.com/AruNi-01/atmos/issues/64))

- **Agent Permission Latency & Stuck State** — Resolved a bug where Claude Code would appear stuck after the user granted a permission prompt. Permission reply handling is now more reliable and the agent resumes promptly.

- **Remote Access HTTPS Tunnel Connectivity** — Fixed connectivity issues with HTTPS tunnels and added session renewal to keep remote access sessions alive under adverse network conditions.

- **Blocking Async Executor & Hardcoded Sidecar Port** — Fixed a case where the sidecar was blocking the async executor and removed a hardcoded port that prevented the sidecar from starting in some environments.

- **Agent Chat Panel Opacity** — Restored opacity control for the agent chat panel that was inadvertently removed in a prior refactor.

- **Spinning Icon Alignment** — Corrected misaligned spinner icons in the usage and timer UI. ([#38](https://github.com/AruNi-01/atmos/issues/38))

- **Desktop Terminal Pane Drag and Drop** — Fixed drag-and-drop behavior in the desktop terminal pane.

- **Terminal Tab Hydration** — Fixed an issue where terminal tabs would fail to hydrate correctly on desktop app startup.

## Improvements

- **Idle Session Badge** — Hovering over an idle agent session in the sidebar now reveals a CLEAR action with a slide animation, making it easier to dismiss finished sessions without navigating away.

- **Agent State Indicator Sizing** — The compact agent state indicator in the sidebar and terminal tab is now slightly larger for better visibility at a glance.

- **AI Usage Provider Simplification** — Internal provider implementations for AI usage tracking have been simplified, reducing overhead in the common path.

- **Landing Changelog Page** — A changelog page and shared CTA components are now live on the Atmos landing site. ([#69](https://github.com/AruNi-01/atmos/pull/69))

- **Desktop App Icons Refresh** — Updated desktop app icons for a more polished look on macOS.
