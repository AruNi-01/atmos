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
| **Entry id** | `REV-NNN` - zero-padded, monotonic in this file (next: **REV-028**). |
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
