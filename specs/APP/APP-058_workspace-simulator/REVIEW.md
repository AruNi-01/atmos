# REVIEW · APP-058: Workspace Simulator - Implementation Review

> Post-implementation review log for functional completeness, architecture, maintainability, code size, testability, and follow-up fixes. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: 2026-08-13  
**Review scope**: functional review | quality review | implementation review | architecture review  
**Related code**: `apps/desktop-electron/src/simulator/`, `apps/web/src/features/simulator/`, `apps/web/src/app-shell/`, `apps/cli/src/commands/simulator.rs`, `e2e/tests/specs/APP-058_workspace-simulator.e2e.ts`

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After code implementation reaches review or post-review and the findings need durable tracking before cleanup. |
| **Entry id** | `REV-NNN` - zero-padded, monotonic in this file (next: **REV-053**). |
| **Status** | `open` -> `in_progress` -> `fixed` -> `verified` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH/TEST content; link to baseline docs and record only review findings plus fix status. |
| **Fix proof** | Each fixed item should name the code change and the verification command or manual check. |

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P0 | backend | Boot gate treats any Booted simulator as the target | verified |
| REV-002 | P0 | backend | `--detach` launcher `exit` treated as helper death | fixed |
| REV-003 | P0 | frontend | Attach IPC result ignored; event bridge not awaited | fixed |
| REV-004 | P0 | frontend | Project route keys the session by project id | fixed |
| REV-005 | P0 | frontend | `helper_missing` Reinstall Atmos is a no-op | fixed |
| REV-006 | P1 | backend | Attach reports `streaming` before first frame | fixed |
| REV-007 | P1 | backend | `failAttach` always uses `setup_required` | fixed |
| REV-008 | P1 | backend | screenshot/ax/logs fetch the helper port directly | fixed |
| REV-009 | P1 | backend | Helper version mismatch throws outside attach catch | fixed |
| REV-010 | P1 | backend | Probe capture smoke never receives `helperHealth` | fixed |
| REV-011 | P1 | backend | Spawn env omits `DEVELOPER_DIR` / Xcode `PATH` | verified |
| REV-012 | P1 | backend | Take-over audit log can ENOENT | fixed |
| REV-013 | P1 | backend | `assertSpawnSafety` is test-only | fixed |
| REV-014 | P1 | backend | `workspace_ambiguous` candidates are objects | fixed |
| REV-015 | P1 | backend | `stop()` does not await session teardown | fixed |
| REV-016 | P1 | frontend | `?tab=simulator` falls back before persist hydration | fixed |
| REV-017 | P1 | frontend | Closing the center tab can reopen from a stale URL | fixed |
| REV-018 | P1 | frontend | `helper_dead` has no card copy | fixed |
| REV-019 | P1 | frontend | Take-over can pick a different available UDID | fixed |
| REV-020 | P1 | frontend | Config WS frames are parsed and discarded | fixed |
| REV-021 | P1 | backend | CLI `ok: false` without `error_code` exits 0 | fixed |
| REV-022 | P2 | backend | `control.json` is written on Desktop start | verified |
| REV-023 | P1 | backend | Re-attach ignores a new `simulatorId` | fixed |
| REV-024 | P2 | backend | Global `serve-sim --kill` on every Desktop start | verified |
| REV-025 | P2 | test | Opcode unit tests omit pinch / key / software keyboard | verified |
| REV-026 | P2 | docs | TEST.md S6 still names `helper_not_installed` | verified |
| REV-027 | P0 | backend | Control plane reads `address()` before listen | verified |
| REV-028 | P1 | backend | Health probe accepts `{ ok: true }` without protocol | verified |
| REV-029 | P1 | backend | Cross-instance take-over does not kill the remote helper | verified |
| REV-030 | P1 | backend | `releaseClaim` ignores instance identity | verified |
| REV-031 | P1 | frontend | Panel has no keyboard input path | verified |
| REV-032 | P1 | frontend | Parent bezel forces a fixed 9/19.5 aspect | verified |
| REV-033 | P1 | backend | CLI `type` drops shift | verified |
| REV-034 | P2 | backend | Nested `/anything/health` passed the proxy allow-list | verified |
| REV-035 | P1 | backend | Same-instance take-over left the previous helper running | verified |
| REV-036 | P1 | frontend | Disconnect immediately reattaches | verified |
| REV-037 | P1 | backend | Reconnect keeps old token but new proxy URLs | verified |
| REV-038 | P1 | backend | Failed session cannot be reattached | verified |
| REV-039 | P1 | backend | Handshake timeout leaks the detached helper | verified |
| REV-040 | P1 | backend | `killSession` does not emit idle | verified |
| REV-041 | P1 | backend | CLI invoke aborts after 5s | verified |
| REV-042 | P1 | frontend | Touch end dropped off the screen | verified |
| REV-043 | P1 | backend | In-flight spawn can kill the take-over winner | verified |
| REV-044 | P1 | backend | Hidden throttle is never restored | verified |
| REV-045 | P1 | backend | Disconnect during reconnect does not stick | verified |
| REV-046 | P1 | backend | Capture smoke uses reconnecting sessions | verified |
| REV-047 | P1 | backend | Overlapping degrade respawns | verified |
| REV-048 | P1 | frontend | Open in simulator queues Metro on the pane id | verified |
| REV-049 | P1 | backend | Handshake reap `--kill` can still hit the winner | verified |
| REV-050 | P1 | backend | Handshake accepts another spawn's UDID record | verified |
| REV-051 | P1 | backend | Degrade respawn catch can delete a replacement session | verified |
| REV-052 | P1 | frontend | Same-token reconnect leaves a dead MJPEG/WS | verified |

---

## REV-001 · Boot gate treats any Booted simulator as the target

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P0 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`bootIfNeeded` boots only when the chosen UDID is missing from `simctl list` **or** the entire stdout lacks `Booted`. A Shutdown target is skipped whenever any other simulator is already Booted.

### Evidence

- `apps/desktop-electron/src/simulator/bridge.ts` — `bootIfNeeded` uses `!/Booted/.test(list.stdout)` instead of the chosen entry's `state`.

### Required fix

Parse `simctl list -j` and boot only when the chosen id is absent or `state !== "Booted"`.

### Acceptance

- [x] Mixed-state fixture: other UDID Booted, target Shutdown → `simctl boot <target>` runs.

### Fix log

- 2026-08-13 - `simulatorNeedsBoot` parses chosen UDID state. `bun test src/simulator` (parse-simctl.test.ts) pass.

---

## REV-002 · `--detach` launcher `exit` treated as helper death

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P0 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The helper is spawned with `detached: true`. The wrapper process exits after daemonize, but `child.on("exit")` calls `handleHelperExit`. That reconnects against a live daemon and can spawn duplicates.

### Evidence

- `apps/desktop-electron/src/simulator/bridge.ts` — `spawnHelper` binds `exit` to the launcher and prefers `child.pid` over `record.pid`.

### Required fix

Track `record.pid`. Do not listen for launcher `exit`. Detect death with `kill(pid, 0)` (and `/health`) on the tick.

### Acceptance

- [x] Launcher exit does not enter reconnect. Tick notices a dead daemon pid.

### Fix log

- 2026-08-13 - spawn tracks `record.pid`; launcher `exit` is ignored; tick uses `kill(pid, 0)`.

---

## REV-003 · Attach IPC result ignored; event bridge not awaited

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P0 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`beginAttach` only `applyStatus` on IPC **error**. Success depends on `simulator://status`. If the listener is not yet registered, phase stays `idle` and attach loops.

### Evidence

- `apps/web/src/features/simulator/components/SimulatorPanel.tsx` — `desktopInvoke("simulator_attach")` catch-only apply.
- `ensureSimulatorEventBridge()` is fired without await.

### Required fix

Await the event bridge, then `applyStatus` with the attach result (and keep the event path).

### Acceptance

- [x] Successful attach updates phase even if the status event is missed.

### Fix log

- 2026-08-13 - `beginAttach` awaits the event bridge and `applyStatus` on the attach result.

---

## REV-004 · Project route keys the session by project id

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P0 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Right sidebar and center frame pass `contextId` (`workspaceId || projectId`) into `SimulatorPanel`. On `/project`, the session is keyed by project guid, violating TECH §6.1 / M2 (one session per worktree). E2E currently depends on that bug.

### Evidence

- `apps/web/src/app-shell/RightSidebar.tsx` — `workspaceId={contextId ?? null}`
- `apps/web/src/app-shell/workspace-center-frame.tsx` — `workspaceId={contextId}`
- `e2e/tests/specs/APP-058_workspace-simulator.e2e.ts` — parses project `id`

### Required fix

Pass the real workspace id (URL workspace id / `currentWorkspace.id`). Do not fall back to project id. Point E2E at the workspace guid from `pvUrl`.

### Acceptance

- [x] Sidebar and center attach with a workspace id on `/workspace`.
- [x] `/project` without a workspace id does not attach under the project guid.

### Fix log

- 2026-08-13 - sidebar/center pass workspace id, never project id. E2E reads workspace guid from `pvUrl`.

---

## REV-005 · `helper_missing` Reinstall Atmos is a no-op

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P0 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`handleAction` returns immediately for `reinstall`, so the setup-card primary button does nothing.

### Evidence

- `apps/web/src/features/simulator/components/SimulatorPanel.tsx` — `if (action === "reinstall") return;`

### Required fix

Same path as `check_update`: open GitHub releases and optionally `checkForUpdate()`.

### Acceptance

- [x] Reinstall Atmos opens the releases page.

### Fix log

- 2026-08-13 - Reinstall Atmos uses the same GitHub releases + updater path as Check for update.

---

## REV-006 · Attach reports `streaming` before first frame

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`spawnHelper` sets `phase: "streaming"` immediately. PRD/TECH say `streaming` after first frame; until then the phase is `starting`.

### Evidence

- `apps/desktop-electron/src/simulator/bridge.ts` — `spawnHelper` return value; `reportStreamEvent("first_frame")` does not emit status.

### Required fix

Keep `starting` until `first_frame`, then emit `simulator://status`.

### Acceptance

- [x] Fresh attach view is `starting` until `simulator_stream_event` `first_frame`.

### Fix log

- 2026-08-13 - spawn phase is `starting`; `first_frame` emits `simulator://status`.

---

## REV-007 · `failAttach` always uses `setup_required`

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Capture failures (`capture_failed`, mismatch, bind errors) are emitted as `setup_required`. Probe/prerequisite codes belong on the setup card; capture errors belong in `failed`.

### Evidence

- `apps/desktop-electron/src/simulator/bridge.ts` — `failAttach` hard-codes `setup_required`.

### Required fix

`setup_required` for probe/prerequisite codes including `simulator_in_use` and `helper_missing`. `failed` for capture/runtime errors.

### Acceptance

- [x] `capture_failed` view phase is `failed`. `missing_iphone` stays `setup_required`.

### Fix log

- 2026-08-13 - `failAttach` uses `setup_required` only for probe/prerequisite codes; capture errors are `failed`.

---

## REV-008 · screenshot/ax/logs fetch the helper port directly

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Control-plane invoke talks to `127.0.0.1:${helperPort}` instead of the tokened proxy. TECH: never talk to the helper except through `/s/<token>/…`. Failed helper HTTP also returns `ok: false` with no `error_code`.

### Evidence

- `apps/desktop-electron/src/simulator/bridge.ts` — `handleControlInvoke` screenshot/ax/logs.

### Required fix

Fetch via the control-plane session URL. On helper HTTP failure return `error_code: "helper_request_failed"`.

### Acceptance

- [x] Those ops use `/s/<sessionToken>/…` on the control-plane port.

### Fix log

- 2026-08-13 - screenshot/ax/logs go through `/s/<token>/…`; helper HTTP failure returns `helper_request_failed`.

---

## REV-009 · Helper version mismatch throws outside attach catch

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`assertHelperVersion` throws a raw `Error` before the spawn `try`, so IPC surfaces 500 instead of a setup card.

### Evidence

- `apps/desktop-electron/src/simulator/bridge.ts` — `assertHelperVersion(helper)` immediately after resolve.

### Required fix

Map mismatch to `failAttach(..., "helper_missing")`.

### Acceptance

- [x] Version mismatch returns a session view, not an uncaught IPC error.

### Fix log

- 2026-08-13 - helper version mismatch maps to `failAttach(..., helper_missing)`.

---

## REV-010 · Probe capture smoke never receives `helperHealth`

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`probeSimulator` only runs capture smoke when `helperHealth` is injected. The bridge never passes it, so the Booted-sim smoke path is dead in production.

### Evidence

- `apps/desktop-electron/src/simulator/bridge.ts` — `probe()` omits `helperHealth`.
- `apps/desktop-electron/src/simulator/probe.ts` — smoke gated on `deps.helperHealth`.

### Required fix

Pass a health callback that hits the proxied `/health` of a live session.

### Acceptance

- [x] Bridge `probe()` supplies `helperHealth`.

### Fix log

- 2026-08-13 - bridge `probe()` passes proxied `/health` as `helperHealth`.

---

## REV-011 · Spawn env omits `DEVELOPER_DIR` / Xcode `PATH`

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TECH requires `PATH` and `DEVELOPER_DIR` for the selected Xcode. `stripHelperEnv` only strips tokens.

### Evidence

- `apps/desktop-electron/src/simulator/spawn-args.ts`
- TECH spawn-environment paragraph

### Required fix

Set `DEVELOPER_DIR` from `xcode-select -p` / probe `xcodePath` and prepend Xcode `usr/bin` to `PATH`.

### Acceptance

- [x] Spawn env includes `DEVELOPER_DIR` when Xcode path is known.

### Fix log

- 2026-08-13 - `withHelperSpawnEnv` sets `DEVELOPER_DIR` and Xcode `PATH`. spawn-args.test.ts pass.

---

## REV-012 · Take-over audit log can ENOENT

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`appendFileSync(auditLogPath)` does not `ensureDir` the parent. First take-over can throw.

### Evidence

- `apps/desktop-electron/src/simulator/bridge.ts` — `takeOver`

### Required fix

Create the state directory before appending.

### Acceptance

- [x] Take-over succeeds when `audit.log` does not exist yet.

### Fix log

- 2026-08-13 - take-over creates the audit log parent directory first.

---

## REV-013 · `assertSpawnSafety` is test-only

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`--no-preview` / loopback host are asserted in unit tests but not before the real spawn.

### Evidence

- `apps/desktop-electron/src/simulator/spawn-args.ts`
- `apps/desktop-electron/src/simulator/bridge.ts` — `spawnHelper`

### Required fix

Call `assertSpawnSafety(argv)` in `spawnHelper`.

### Acceptance

- [x] Runtime spawn runs the same argv assertions as tests.

### Fix log

- 2026-08-13 - `assertSpawnSafety(argv)` runs in `spawnHelper`.

---

## REV-014 · `workspace_ambiguous` candidates are objects

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

CLI tests expect `candidates` to be workspace id strings. The bridge returns `{workspaceId, simulatorId}` objects.

### Evidence

- `apps/desktop-electron/src/simulator/bridge.ts` — `candidates: this.activeSessions()`
- `apps/cli/src/commands/simulator.rs` — `resolve_workspace` test expects `["a", "b"]`

### Required fix

Return workspace id strings.

### Acceptance

- [x] Ambiguous invoke payload `candidates` is an array of strings.

### Fix log

- 2026-08-13 - `workspace_ambiguous` candidates are workspace id strings.

---

## REV-015 · `stop()` does not await session teardown

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Quit fires `void this.killSession(...)` then immediately tears down the control plane, so helpers can outlive Desktop.

### Evidence

- `apps/desktop-electron/src/simulator/bridge.ts` — `stop()`
- `apps/desktop-electron/src/main.ts` — `state.simulator?.stop()` in `before-quit`

### Required fix

Make `stop()` async and await `killSession` for every workspace. Await it from `before-quit`.

### Acceptance

- [x] Quit waits for session SIGTERM before closing the control plane.

### Fix log

- 2026-08-13 - `stop()` is async and awaited from `before-quit`; sessions are killed before the control plane closes.

---

## REV-016 · `?tab=simulator` falls back before persist hydration

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`resolvedTab` treats an unhydrated persist store as "closed" and replaces `tab=simulator` with the last terminal tab, which can then be persisted as the last tab.

### Evidence

- `apps/web/src/app-shell/CenterStage.tsx` — `isSimulatorCenterTabValue(tabFromUrl)` branch

### Required fix

While URL is `simulator` and persist has not hydrated, keep `resolvedTab === "simulator"`.

### Acceptance

- [x] Deep link `?tab=simulator` is not replaced by the fallback before hydration.

### Fix log

- 2026-08-13 - `resolvedTab` keeps `simulator` until persist hydration finishes.

---

## REV-017 · Closing the center tab can reopen from a stale URL

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The URL→persist effect depends on `simulatorTabOpen`. Closing the tab (store false) while `tab=simulator` is still in the URL re-opens the tab.

### Evidence

- `apps/web/src/app-shell/CenterStage.tsx` — effect keyed on `simulatorTabOpen`

### Required fix

Do not re-open from URL when the store transitions to closed. Drive open from URL + hydration, not from the close edge.

### Acceptance

- [x] Close stays closed even if nuqs lags one frame.

### Fix log

- 2026-08-13 - URL→open effect no longer re-runs when the persist store closes.

---

## REV-018 · `helper_dead` has no card copy

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Degrade exhaustion emits `helper_dead`. The panel looks for `reconnecting_exhausted`. Missing i18n key `cards.helper_dead`.

### Evidence

- `apps/desktop-electron/src/simulator/degrade.ts` — `helper_dead`
- `apps/web/messages/en.json` / `zh.json` — no `helper_dead`
- `apps/web/src/features/simulator/components/SimulatorPanel.tsx`

### Required fix

Show the failed card for `helper_dead` and add en/zh copy (zh must be Chinese).

### Acceptance

- [x] Both locale files contain `simulator.cards.helper_dead`.

### Fix log

- 2026-08-13 - added `cards.helper_dead` in en.json and zh.json; failed card shows for that code.

---

## REV-019 · Take-over can pick a different available UDID

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Take-over falls back to `probe.facts.simulators.find(isAvailable)`, which can steal a different simulator than the one named on the card.

### Evidence

- `apps/web/src/features/simulator/components/SimulatorPanel.tsx` — `handleAction` `take_over`

### Required fix

Require `session.simulator?.id`. Do nothing if it is missing.

### Acceptance

- [x] Take-over is a no-op without an explicit simulator id on the session.

### Fix log

- 2026-08-13 - take-over requires `session.simulator.id`.

---

## REV-020 · Config WS frames are parsed and discarded

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`parseConfigFrame` runs on WS text frames but the width/height are unused, so bezel aspect ratio stays at the 9/19.5 default.

### Evidence

- `apps/web/src/features/simulator/components/SimulatorScreen.tsx`

### Required fix

Keep local size from config frames (and from the `size` prop when present).

### Acceptance

- [x] A config frame with width/height updates the screen `aspect-ratio`.

### Fix log

- 2026-08-13 - SimulatorScreen keeps local size from config frames.

---

## REV-021 · CLI `ok: false` without `error_code` exits 0

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Invoke treats missing `error_code` as success. `--out` can write a failed screenshot body.

### Evidence

- `apps/cli/src/commands/simulator.rs` — `exit_code = protocol_error_code.map(exit_code_for).unwrap_or(0)`

### Required fix

Any `ok: false` is non-zero (`error_code` mapped, else 1). Write `--out` only when `ok === true`.

### Acceptance

- [ ] Unit test: `{ok:false}` without `error_code` → exit 1. Test is in `simulator.rs`; `cargo test -p atmos` could not run here (rustc 1.83 / edition2024).

### Fix log

- 2026-08-13 - `invoke_exit_code`: any `ok: false` is non-zero. `cargo test -p atmos` blocked on rustc 1.83 / edition2024 in this environment.

---

## REV-022 · `control.json` is written on Desktop start

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TECH originally said write the control file on first session. The bridge writes it when the control plane starts so `atmos simulator list` can discover the loopback plane before any attach.

### Evidence

- `apps/desktop-electron/src/simulator/bridge.ts` — `start()`
- TECH control-plane discovery

### Required fix

Keep write-on-start. Add a lease (`pid` + `GET /v1/health`) so a second Desktop process does not overwrite a live owner's `control.json`.

### Acceptance

- [x] TECH §3.2 documents write-on-start plus lease / take-over.
- [x] A live owner (pid alive + `/v1/health`) is not overwritten.
- [x] Non-owner `stop()` does not unlink the owner's file.

### Fix log

- 2026-08-13 - implemented as a `control.json` lease (`pid`, `instance_id`, unauthenticated `GET /v1/health`) rather than delaying the write until first attach.

---

## REV-023 · Re-attach ignores a new `simulatorId`

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

If a session already exists, `attach(workspaceId, simulatorId)` returns the current view and ignores a different requested id.

### Evidence

- `apps/desktop-electron/src/simulator/bridge.ts` — early `existing` return

### Required fix

When `simulatorId` is set and differs, tear down and attach the requested simulator.

### Acceptance

- [x] Attach with a new id replaces the previous session for that workspace.

### Fix log

- 2026-08-13 - attach with a different `simulatorId` tears down and re-attaches.

---

## REV-024 · Global `serve-sim --kill` on every Desktop start

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`reconcileOrphans` ran `serve-sim --kill`, which tears down helpers owned by another Atmos Desktop instance on the same machine.

### Evidence

- `apps/desktop-electron/src/simulator/bridge.ts` — `reconcileOrphans`

### Required fix

Scoped orphan cleanup: `serve-sim --list -q` (tmpdir state-record fallback), keep helpers whose claim `desktopPid` is a live other process, `--kill <udid>` only for leftovers.

### Acceptance

- [x] Start does not call `serve-sim --kill` with no argument.
- [x] `planOrphanKills` keeps helpers owned by another live Desktop pid.
- [x] Dead `desktopPid` rows are dropped and targeted for `--kill <udid>`.

### Fix log

- 2026-08-13 - left open; not fixed in this pass.
- 2026-08-13 - scoped reconcile via `orphan.ts` + claims `desktopPid`; unit tests in `orphan.test.ts` / `control-lease.test.ts`.

---

## REV-025 · Opcode unit tests omit pinch / key / software keyboard

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | test |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Encoder coverage for opcodes 5, 6, and 12 is missing on both the Electron and web copies.

### Evidence

- `apps/desktop-electron/src/simulator/opcode.test.ts`
- `apps/web/src/features/simulator/lib/simulator-stream-client.test.ts`

### Required fix

Add unit assertions for pinch, key, and software keyboard.

### Acceptance

- [x] Tests encode opcodes 5, 6, and 12.

### Fix log

- 2026-08-13 - pinch/key/software-keyboard opcode tests added; bun tests pass.

---

## REV-026 · TEST.md S6 still names `helper_not_installed`

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | docs |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The shipped probe code is `helper_missing`. TEST S6 still lists `helper_not_installed`.

### Evidence

- `specs/APP/APP-058_workspace-simulator/TEST.md` — S6 Then clause

### Required fix

Align the scenario with `helper_missing`.

### Acceptance

- [x] TEST.md does not mention `helper_not_installed`.

### Fix log

- 2026-08-13 - TEST.md S6 now names `helper_missing`.

---

## REV-027 · Control plane reads `address()` before listen

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P0 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`server.listen()` is asynchronous in Node/Electron. Reading `server.address()` on the same tick can return `null` and throw, blocking Desktop boot. Bun's test runtime binds synchronously, so the existing test did not catch this.

### Required fix

Await the `listening` event before reading the bound port.

### Acceptance

- [x] `SimulatorControlPlane.start()` is async and waits for `listening`.
- [x] `control-plane.test.ts` awaits start/stop.

### Fix log

- 2026-08-13 - await `listening`; `stop()` awaits `close()`.

---

## REV-028 · Health probe accepts `{ ok: true }` without protocol

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TECH requires `{ ok: true, protocol: "atmos-simulator/v1" }`. Missing `protocol` was treated as healthy, which can suppress lease take-over.

### Required fix

Require an exact protocol match. Reject non-loopback `base_url`.

### Acceptance

- [x] `probeControlHealth` requires `CONTROL_PROTOCOL` and a loopback URL.

### Fix log

- 2026-08-13 - protocol + loopback checks in `control-lease.ts`.

---

## REV-029 · Cross-instance take-over does not kill the remote helper

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`takeOver` only `killSession`s a workspace in this process. A helper owned by another Desktop stays up, and that instance may reconnect.

### Required fix

Write the new claim first, `--kill <udid>` / SIGTERM `helperPid` for the previous holder, and skip reconnect when this process no longer owns the claim.

### Acceptance

- [x] Take-over compares `instanceId`, not only `workspaceId`.
- [x] `handleHelperExit` does not respawn after a lost claim.

### Fix log

- 2026-08-13 - `killClaimedHelper` + `stillOwnsClaim` gate on reconnect.

---

## REV-030 · `releaseClaim` ignores instance identity

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Release matched only `workspaceId`, so a quitting `.dev` instance could drop a production claim for the same workspace.

### Required fix

Require `instanceId` on release.

### Acceptance

- [x] Unit test: another instance cannot release the holder.

### Fix log

- 2026-08-13 - `releaseClaim(..., instanceId)` and all bridge call sites updated.

---

## REV-031 · Panel has no keyboard input path

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

PRD M5 requires keyboard input. `SimulatorScreen` only handled pointer and wheel.

### Required fix

Focusable screen; map keys to HID usages including shift.

### Acceptance

- [x] `tabIndex={0}` + keydown/keyup; `hid.test.ts` covers mapping.

### Fix log

- 2026-08-13 - panel HID mapping in `apps/web/src/features/simulator/lib/hid.ts`.

---

## REV-032 · Parent bezel forces a fixed 9/19.5 aspect

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Config frames update `SimulatorScreen` local size, but the parent bezel used `aspect-[9/19.5]` and `h-full w-full`, so the child's `aspectRatio` could not change the box.

### Required fix

Let the screen own the aspect ratio; do not stretch it to a fixed parent box.

### Acceptance

- [x] Bezel has no fixed aspect class; screen is `w-full` with inline `aspectRatio`.

### Fix log

- 2026-08-13 - `SimulatorPanel` / `SimulatorScreen` layout.

---

## REV-033 · CLI `type` drops shift

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`hidUsageForChar` returns `shift` for uppercase, but `type` only sent the letter usage.

### Required fix

Wrap shifted characters with left-shift HID 0xE1 down/up.

### Acceptance

- [x] Bridge `type` sends `HID_LEFT_SHIFT` around shifted letters.

### Fix log

- 2026-08-13 - shift key events in the `type` opcode path.

---

## REV-034 · Nested `/anything/health` passed the proxy allow-list

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The last-segment exception allowed `/s/<token>/anything/health`.

### Required fix

Keep exact `/health` and last-segment `stream-settings` only.

### Acceptance

- [x] `isAllowedUpstreamPath("/nested/health")` is false.

### Fix log

- 2026-08-13 - proxy allow-list no longer treats last-segment `health` as allowed.

---

## REV-035 · Same-instance take-over left the previous helper running

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The cross-instance take-over change only killed sessions when `instanceId` differed, so taking over from another workspace in the **same** Desktop process left two helpers on one UDID. Failed attach after writing the claim could also leak the row.

### Required fix

Kill the previous local session when the workspace differs; kill the remote helper when the instance differs; release the claim if attach then fails with no session. Reconnect and `patchClaim` require `stillOwnsClaim(simulatorId, workspaceId)`.

### Acceptance

- [x] Same-instance other-workspace take-over calls `killSession`.
- [x] `stillOwnsClaim` includes workspace id.

### Fix log

- 2026-08-13 - take-over branches on remote vs other-workspace; failed attach releases the claim; helper input/settings go through the token proxy.

---

## REV-036 · Disconnect immediately reattaches

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The panel auto-attached whenever an active surface saw `phase === idle`. Disconnect emits `idle`, so Disconnect started a new session immediately.

### Required fix

Auto-attach only when the surface **becomes** active while idle, not on every idle transition while already active.

### Acceptance

- [x] Disconnect while the tab stays open does not call `beginAttach`.
- [x] Opening the tab from inactive still attaches.

### Fix log

- 2026-08-13 - `wasActiveRef` gates auto-attach on becoming active; workspace id changes reset the gate.

---

## REV-037 · Reconnect keeps old token but new proxy URLs

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`spawnHelper` minted a new session token into `wsUrl` / `streamSettingsUrl`, then reconnect copied only the old `sessionToken`. Proxy lookup uses the session token, so input and stream-settings hit 403 while `streamBaseUrl` stayed on the dead token.

### Required fix

Pass the reused token into `spawnHelper` so proxy URLs are built from that token.

### Acceptance

- [x] Reused token appears in both `wsUrl` and `streamSettingsUrl`.
- [x] A helper pid on a different port is not SIGTERM'd on spawn failure.

### Fix log

- 2026-08-13 - `sessionProxyUrls` + `spawnHelper({ sessionToken })`. `bun test src/simulator` handshake tests.

---

## REV-038 · Failed session cannot be reattached

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

After reconnect exhaustion, `attach` returned the dead session. Recheck probed that session's `/health`, got `capture_failed`, and the setup card had no Disconnect.

### Required fix

Replace `failed` / `helper_dead` sessions; skip capture-smoke against them; Recheck may attach when phase is `failed`.

### Acceptance

- [x] `liveSessionShouldRestart` is true for `failed` and `health: dead`.
- [x] Store allows attach from `failed`.

### Fix log

- 2026-08-13 - `attach` kills restartable sessions first; `probeHelperHealth` skips them.

---

## REV-039 · Handshake timeout leaks the detached helper

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`waitForFile` / parse failures threw before `killSpawned`, leaving a detached helper. `attach` then released the claim.

### Required fix

Reap this spawn on any handshake failure: SIGTERM own pids; `--kill <udid>` only while this workspace still owns the claim.

### Acceptance

- [x] Spawn failure path always calls `reapSpawnedHelper`.
- [x] Lost-claim reap does not `--kill` the winner's UDID.

### Fix log

- 2026-08-13 - `reapSpawnedHelper` + `spawnFailurePids` port guard.

---

## REV-040 · `killSession` does not emit idle

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Same-instance take-over and warm-cap eviction killed the helper without `simulator://status`, so the victim UI stayed `streaming` against a 403 URL.

### Required fix

Emit `idle` from `killSession`.

### Acceptance

- [x] `killSession` emits `emptyView(..., "idle")`.
- [x] Idle-release no longer double-emits from `onTick`.

### Fix log

- 2026-08-13 - emit moved into `killSession`.

---

## REV-041 · CLI invoke aborts after 5s

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`atmos simulator attach` used a 5 s reqwest timeout while Desktop boot can take 90 s, so cold attach failed as transport exit 1.

### Required fix

120 s request timeout and 5 s connect timeout.

### Acceptance

- [x] `INVOKE_TIMEOUT_SECS >= 90`.

### Fix log

- 2026-08-13 - CLI client timeouts; unit assertion in `simulator.rs`.

---

## REV-042 · Touch end dropped off the screen

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`normalizePointer` throws outside 0–1, so a swipe that ended on the bezel never sent `touch end` and the helper stayed finger-down.

### Required fix

On pointer up/cancel, send `end` with the last in-range point.

### Acceptance

- [x] `resolveTouchEndPoint(null, last)` returns `last`.

### Fix log

- 2026-08-13 - `lastPointRef` + `resolveTouchEndPoint` in `SimulatorScreen`.

---

## REV-043 · In-flight spawn can kill the take-over winner

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Same-instance take-over during an in-flight attach had no session to `killSession`, skipped `--kill <udid>`, and the loser's `killSpawned` SIGTERM'd `record.pid` — often the winner's helper.

### Required fix

`--kill <udid>` for other-workspace take-over; check the claim before unlink/spawn; on lost claim SIGTERM only this spawn's port/pids.

### Acceptance

- [x] Other-workspace take-over always calls `killClaimedHelper`.
- [x] `spawnFailurePids` ignores a record whose port is not ours.

### Fix log

- 2026-08-13 - take-over `--kill` for other workspace; claim check before unlink; port-guarded reap.

---

## REV-044 · Hidden throttle is never restored

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`onTick` posted 5 fps / 720 px after hide and never restored native settings when a surface became visible.

### Required fix

Latch throttle once; on `visible: true` POST native stream-settings.

### Acceptance

- [x] `NATIVE_FPS` > throttle fps.
- [x] `setVisibility(true)` clears `streamThrottled`.

### Fix log

- 2026-08-13 - `streamThrottled` + restore 60 fps / 4096 px.

---

## REV-045 · Disconnect during reconnect does not stick

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`handleHelperExit` / degrade respawn kept going after `killSession` and could `sessions.set` a new helper over idle.

### Required fix

After `spawnHelper`, discard the helper if `suppressExit` or the claim is gone; do not emit `failed` over idle.

### Acceptance

- [x] Reconnect and respawn check `suppressExit` / claim before `sessions.set`.

### Fix log

- 2026-08-13 - `discardSpawnedHelper` after lost claim or Disconnect.

---

## REV-046 · Capture smoke uses reconnecting sessions

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`probeHelperHealth` fetched any non-failed session, including `reconnecting`/`stale`, with no timeout, so another workspace's attach could fail `capture_failed`.

### Required fix

Smoke only `health === ok` + `starting`/`streaming`, 2 s abort; timeout skips smoke.

### Acceptance

- [x] Reconnecting sessions are not used for capture smoke.

### Fix log

- 2026-08-13 - live-only smoke + 2 s abort.

---

## REV-047 · Overlapping degrade respawns

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Two panels both fired `webrtc_unusable`; overlapping `respawnHelperKeepingToken` could `--kill` the fallback helper.

### Required fix

Single-flight via `reconnecting`; set `transport`/`codec` before await; wait for the old pid to exit.

### Acceptance

- [x] Second degrade event while reconnecting is a no-op.

### Fix log

- 2026-08-13 - `reconnecting` gate + waitForPidExit on degrade respawn.

---

## REV-048 · Open in simulator queues Metro on the pane id

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`queuePaneInput` used `paneId` while Terminal consumes `sessionId`, and the pane was created before the worktree check.

### Required fix

Queue on `pane.sessionId` after a successful `metroCommand`; do not create a Metro tab on failure.

### Acceptance

- [x] `handleOpenProject` queues `created.pane.sessionId`.

### Fix log

- 2026-08-13 - create pane after `metroCommand`; queue the PTY session id.

---

## REV-049 · Handshake reap `--kill` can still hit the winner

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`reapSpawnedHelper` snapped `owns` then awaited `--kill <udid>`, so a take-over that completed during that await was killed.

### Required fix

Reap only this spawn's port-guarded pids. Do not `--kill <udid>` from handshake failure.

### Acceptance

- [x] `reapSpawnedHelper` has no `helperCli(["--kill", ...)`.

### Fix log

- 2026-08-13 - handshake reap is SIGTERM of own pids only. Also re-read the control lease after `control.start()` before writing.

---

## REV-050 · Handshake accepts another spawn's UDID record

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`waitForFile` accepted the first `server-<udid>.json` even when `record.port` was not this spawn's port, so a take-over winner could bind the loser's helper.

### Required fix

Keep polling until `record.port === spawnPort`. Disconnect/kill bumps an attach generation so an in-flight attach cannot `sessions.set` after abort.

### Acceptance

- [x] `isOwnHelperRecord` is false for a different port.
- [x] `killSession` bumps attach generation even with no session row.

### Fix log

- 2026-08-13 - port-matched handshake; attach generation.

---

## REV-051 · Degrade respawn catch can delete a replacement session

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`respawnHelperKeepingToken` catch deleted whatever was in the map whenever `suppressExit` was true and a row still existed, including a session installed by a later attach.

### Required fix

Only tear down if the map still points at this session object.

### Acceptance

- [x] Catch no-ops when `sessions.get(workspaceId) !== session`.

### Fix log

- 2026-08-13 - identity check in respawn catch.

---

## REV-052 · Same-token reconnect leaves a dead MJPEG/WS

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Reconnect reuses the session token so `streamBaseUrl` is unchanged. `SimulatorScreen` only remounts when that URL or codec changes, so the panel kept dead MJPEG and input sockets.

### Required fix

Bump `streamRev` on each helper spawn and key the screen on it.

### Acceptance

- [x] `toView` includes `streamRev`.
- [x] Panel `streamKey` includes `streamRev`.

### Fix log

- 2026-08-13 - `streamRev` on `SessionView`; `SimulatorScreen` remounts on bump.



