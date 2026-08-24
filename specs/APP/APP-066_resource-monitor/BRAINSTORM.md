# Brainstorm · APP-066: Resource Monitor

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos can diagnose terminal and local-service state, but it cannot show how much CPU or memory the application, a Project, or a Workspace consumes. Users currently leave Atmos for Activity Monitor, `top`, or Task Manager, then manually correlate processes with terminal sessions. That correlation is especially weak for tmux-backed sessions and remote Computers.

The Server owns Project, Workspace, terminal-session, and process-lifecycle context. The Electron shell is the only component that can accurately enumerate its Chromium processes. A useful monitor therefore needs two data sources without making either one impersonate the other.

## Goals (draft)

- Show live host CPU and memory for the active Computer.
- Separate Atmos Server overhead from attributed Project and Workspace workloads.
- Show the local Electron shell as a separate source when the UI runs in Desktop.
- Preserve the same Server-side model for local and Relay-connected Computers.
- Keep monitoring overhead low when no resource surface is visible.
- Be honest about attribution uncertainty and unassigned processes.

## Options

### Option A — Server-only monitor

The Server samples the host process table and attributes terminal descendants to Projects and Workspaces. Desktop Chromium processes remain part of host totals but have no dedicated breakdown.

**Pros**: one transport, remote parity, simplest UI model.
**Cons**: cannot accurately label Electron Browser, renderer, GPU, and utility costs.
**Unknown**: whether a Server-side executable-name heuristic is useful enough to label Desktop.

### Option B — Electron-owned unified monitor

Electron calls the Server, calls `app.getAppMetrics()`, merges both snapshots, and returns one IPC payload to the renderer.

**Pros**: one payload in local Desktop.
**Cons**: duplicates Server connection, Relay, authentication, cache, and reconnect logic; cannot work in hosted web; mixes local shell data with a selected remote Computer.
**Unknown**: none significant; the ownership mismatch is structural.

### Option C — Dual-source, Server-primary attribution

The Server samples and attributes host workloads over the main WebSocket. Electron exposes only shell metrics over Desktop IPC. The web application composes the two sources according to the active Computer.

**Pros**: correct ownership, remote compatibility, no proxy transport, clean hosted-web degradation.
**Cons**: the frontend must reconcile two timestamps and explicitly label local-only data.
**Unknown**: whether users want the local controller shell visible while inspecting a remote Computer.

### Option D — OS-level isolation

Launch each Workspace inside cgroups, job objects, or another operating-system resource container and read exact counters from that boundary.

**Pros**: strongest attribution and a path to limits or enforcement.
**Cons**: platform-specific lifecycle changes, migration risk for existing tmux sessions, and significantly broader scope.
**Unknown**: whether future resource limits justify changing process launch semantics.

## Preferred direction

Option C is the first release direction:

- Server-primary means the Server owns attribution, not that Electron proxies Server traffic.
- The Server sends aggregate resource snapshots through the existing Computer WebSocket.
- Electron returns only local shell metrics through the existing invoke bridge.
- The frontend composes both sources only for the local Computer.
- Attribution is best-effort and exposes explicit shared/unattributed buckets rather than false precision.

## Key forks in the road

- **Transport**: global background broadcast vs connection-scoped subscription — choose subscription in TECH to avoid Relay amplification.
- **Identity model**: extend stop-oriented `ProcessSnapshot` vs separate resource sample — choose a separate sample in TECH.
- **Session PID exposure**: public terminal DTO vs internal registry — choose internal registry in TECH.
- **History**: Server ring buffer vs client-only live history — choose client-only history for v1.
- **Platform parity**: exact behavior everywhere vs declared best-effort — choose best-effort attribution with host metrics on every supported platform.
- **Remote Desktop shell**: merge local Electron into remote Computer vs keep Computer boundaries strict — keep boundaries strict in PRD.

## Open questions

- [ ] Decide in PRD: should the first UI be a Footer popover, a full management page, or both?
- [ ] Decide in PRD: is session-level drilldown required for v1 or only Project/Workspace rollups?
- [ ] Decide in TECH: how terminal roots are refreshed without invoking tmux per session per sample.
- [ ] Decide in TECH: how process CPU is normalized across logical cores.
- [ ] Decide in TEST: acceptable idle and interactive collector overhead.

## References

- Existing process identity: `crates/core-engine/src/local_services/process.rs`
- Terminal sessions: `crates/core-service/src/service/terminal/`
- Local-service attribution: `crates/core-service/src/service/local_services/`
- Main WebSocket protocol: `apps/api/src/api/ws/`
- Query event bridge: `apps/web/src/providers/app/server-state-event-bridge.tsx`
- Desktop invoke bridge: `apps/desktop-electron/src/ipc/handlers.ts`
- Related specs: `APP-016_atmos-computer`, `APP-023_local-run-server-manager`, `APP-035_tanstack-query-data-layer`, `APP-048_api-types`, `APP-049_api-client`
- Electron API: `app.getAppMetrics()`

## Ready to promote

- Promote to PRD: active Computer host totals, Atmos/Project/Workspace breakdown, local-only shell section, explicit unavailable/unattributed states.
- Promote to TECH: one process-table sample per tick, internal session root registry, WebSocket subscription, shell-only IPC, frontend composition.
