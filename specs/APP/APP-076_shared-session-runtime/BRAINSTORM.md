# BRAINSTORM · APP-076: Shared session Runtime

> Problem space for unifying Desktop, CLI, and local web around one user-session Atmos Runtime. Design locked in TECH; no backward compatibility.

## Problem

Desktop privately spawns/kills a sidecar Server; CLI uses `runtime-manager`; local-web-runtime is a third install layout. Concurrent Desktop + CLI fights over ownership. CLI-only users still need the same Server.

## Rejected

- CLI process as the long-running HTTP/WS backend.
- Embedding the control engine in Electron.
- Per-entry private Server + `startedServer` quit-kills.

## Chosen

One Runtime daemon per user/machine; entries only ensure/reuse; explicit stop (or idle-stop later); Desktop Use via Server; host TCC identity stays separate.
