# PRD · APP-076: Shared session Runtime

> WHAT & WHY. HOW is [TECH.md](./TECH.md).

## Summary

Ship a single user-session **Atmos Runtime** (Atmos Server + same-version CLI + web/skills) as the only local backend. Desktop is a shell. CLI is a thin client that can lazy-ensure Runtime. Closing Desktop does not stop Runtime.

## Must Have

- **M1** One Runtime per user/machine; second entry reuses a healthy Runtime that serves product UI.
- **M2** Desktop does not privately own/kill the Server on quit.
- **M3** CLI-only: commands that need Server lazy-ensure Runtime without Desktop.
- **M4** CLI is not the long-running backend.
- **M5** Desktop Use lifecycle goes through the running Runtime (same handlers as Settings/CLI), not per-click `exec` of `atmos`. Control-engine host TCC identity remains `Atmos Desktop Use`.
- **M6** Explicit `atmos runtime stop` (idle-stop may be specified; not required to ship in this slice).

## Out of scope

Installer/R2 cutover, UDS as sole transport, embedding CUA, Relay/Hub/mobile, Electron IPC for sessions.
