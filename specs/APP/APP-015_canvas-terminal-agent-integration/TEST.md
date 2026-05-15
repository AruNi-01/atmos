# TEST · APP-015: Canvas Terminal Agent Integration

> Test Plan · verifies [PRD.md](./PRD.md) against [TECH.md](./TECH.md). Implements after code lands; scenarios are acceptance targets, not current CI status.

---

## 1. Test strategy

| Layer | What | When |
|------|------|------|
| **Unit** | Canvas Command Bus: JSON validation → allow-listed `update-shape` keys, layout bounds (**≤24×24**, id caps), sanitization codes (`STALE_SHAPE_ID`, `VALIDATION_*`). | Implementation PR |
| **API / WS integration** | `POST` invoke handler: auth rejection, ambiguous routing (**409**), offline bridge (**503**), timeout (**504**/code `RELAY_TIMEOUT`), **`request_id` echo** through pending map; **`canvas_bridge_*`** registry lifecycle on connect/disconnect. | `cargo test` / focused integration in `apps/api` or `core-service` (as team patterns allow). |
| **Browser integration** | `onEvent("canvas_agent_dispatch")` → bus → mocked or headed `Editor`; confirm **`canvas_agent_dispatch_result`** always sent for known/unknown **`command`** (unknown → `UNSUPPORTED_COMMAND`) and Agent presence updates are produced from command results. | `bun test` where hooks exist; Storybook/mock optional. |
| **End-to-end (manual)** | Full stack: local **`just dev-api` + `just dev-web`**, authenticated CLI **`atmos canvas`**, bridge toggle, observable canvas mutations + autosave persistence. See §5. Required before marking M1 done. |

**Out of scope for M1 automated gate**: MCP, `@tldraw/driver` conformance tests, agent products (Codex/etc.) injecting Skill.

---

## 2. Coverage map

| PRD / TECH | Scenario IDs |
|------------|----------------|
| M1 Skill + manifest sync | **S-D01**–**S-D02** |
| M2 CLI surface + verbs | **S-C01**, verb rows in §5 |
| M3 Bridge enable / disable | **S-B01**–**S-B03** |
| M4 Live editor execution | **S-E01**–**S-E02**, **S-B03** |
| M5 `status` | **S-R01** |
| M6 `get-state` | **S-R02** |
| M7 Create (note/frame/geo/arrow/draw) | **S-M01**–**S-M05** |
| M8 `create-note` only (no `create-text`) | **S-M06** |
| M9 Selection / move | **S-M07**–**S-M08** |
| M10 `delete` + confirm | **S-M09**, **S-N06** |
| M11 Layout row/column/grid + bounds | **S-M10**–**S-M11** |
| M12 `update-shape` allow-list | **S-M12** |
| M13 `viewport` | **S-M13** |
| M14 Correlation | **S-N01** |
| M15 Auth | **S-N02** |
| M16 HTTP CLI ingress + WS browser | **S-T01**, **T-WS01** |
| M17 Recoverable errors | **S-N03**–**S-N05** |
| M18 Diagnostic vs read vs mutate permissions | **S-B02**, **S-B03**, **S-R01** |
| M19 Clipboard + `skill-dir` | **S-D03**–**S-D05** |
| M20 Agent presence + Follow Agent | **S-P01**–**S-P04** |
| TECH: multi-tab ambiguity | **S-N07** |

---

## 3. Acceptance scenarios — relay & bridge

### S-T01 — Happy path relay (CLI HTTP → WS → CLI response)

**Given** API and web are running, user is authenticated for CLI **`POST`** and browser **`/ws`**.  
**When** Canvas is open with **bridge enabled** and a single registered tab, the operator runs **`atmos canvas status`** (or **`get-state`**) against the configured **`--api-url`**.  
**Then** CLI exits **0**, stdout JSON includes **`ok: true`**, echoed **`request_id`**, structured **`data`**; server debug log (optional) correlates **`request_id`** across HTTP + WS phases.

### T-WS01 — Browser receives `canvas_agent_dispatch`

**Given** same as **S-T01**, with devtools or structured WS logging enabled.  
**When** **`atmos canvas get-state`** is invoked (or noop read command implemented first).  
**Then** Browser handles **exactly one** **`canvas_agent_dispatch`** notification matching **`command`** + **`request_id`**; **`canvas_agent_dispatch_result`** is sent uplink once.

### S-B01 — Bridge register / unregister lifecycle

**Given** authenticated web session with Canvas overlay.  
**When** Operator **enables bridge**, then verifies server-side registry contains **`client_id`**, **disables bridge** or **closes Canvas** / refreshes disconnecting **`/ws`**.  
**Then** Subsequent **`POST` invokes** behave per **TECH §5**: after disable/disconnect **`CANVAS_BRIDGE_OFFLINE`** (or equivalent stable code)—**no silent no-op**.

### S-B02 — Bridge off ⇒ diagnostics work, live editor commands reject

**Given** Canvas visible but bridge **explicitly OFF**.  
**When** **`atmos canvas status`**, **`get-state`**, and a mutate verb fire **`POST`** invoke.  
**Then** **`status` succeeds** and reports no eligible bridge target / disabled state, while **`get-state`** and mutate return **`ok: false`** with actionable message + stable **`error.code`**; HTTP status aligns with [TECH §12](./TECH.md) *Structured errors*.

### S-B03 — Bridge on before meaningful mutate smoke

**Given** Bridge enabled, editor mounted.  
**When** First **`create-note`** succeeds, then **`get-state`** lists new shape **`id`** and metadata.  
**Then** Persisted board (APP-014 autosave cadence + optional manual refresh) retains change after wait/reload bounded by Canvas settings (< 2× autosave interval + buffer).

---

## 4. Acceptance scenarios — read model

### S-C01 — CLI surface is discoverable

**Given** the CLI is installed.  
**When** Operator runs **`atmos canvas --help`**.  
**Then** Help lists M1 verbs from TECH §10, marks **`skill-dir`** as local-only, documents **`--api-url`**, **`--client-id`**, **`--actor-id`**, **`--actor-name`**, **`--actor-color`**, **`--timeout-ms`**, and does **not** expose `@tldraw/driver` primitives.

### S-R01 — `status`: connected client + ambiguity cue

**Given** zero, one, or multiple bridge-eligible tabs.  
**When** **`atmos canvas status`**.  
**Then** Payload reports **bridge_registered_count**, disabled/offline state when no bridge is eligible, **ambiguous=true** iff **>1 tab** without **`--client-id`**, and exposes **`clients[]`** with **`client_id`** for disambiguation.

### S-R02 — `get-state`: schema & terminal cards

**Given** Canvas with mixed shapes including at least **one terminal card**.  
**When** **`atmos canvas get-state`**.  
**Then** Parsed JSON conforms to **`canvas_agent_state.v1`** shape (see TECH §10): **page**, **viewport**, **selection_shape_ids**, **shapes[]** entries include **terminal-relevant props** (**`tmux_window`**, etc.) when applicable.

---

## 5. Acceptance scenarios — mutate / layout / safety (diagram smoke)

Assume **bridge ON**, single **`client_id`**, sane defaults. **When/Then** columns stay minimal; automate as integration where viable.

### S-E01 — Mutation executes in live editor, not direct JSON overwrite

**When** **`create-note`** is invoked.  
**Then** Browser receives **`canvas_agent_dispatch`**, the bus mutates the live `Editor`, and the shape is visible without manually reloading board JSON.

### S-E02 — Undo/save semantics remain coherent

**When** Two CLI mutations run sequentially.  
**Then** The editor remains interactive, no duplicated save loop is observed, and the persisted board after autosave contains both operations in order.

### S-M01 — `create-note`

**Given** Blank region on page.**When** `create-note` with text.**Then** Visible sticky + **`get-state.text_preview`** sane.

### S-M02 — `create-frame`

**When** `create-frame` with title/size.**Then** Frame present; **`get-state`** bounds consistent.

### S-M03 — `create-geo` bounded kinds

**When** **`--kind rectangle`** succeeds; unsupported kind fails **`VALIDATION_ARG`**.**Then** Error copy lists allowed kinds subset.

### S-M04 — `create-arrow` page coords

**When** Arrow with endpoints.**Then** Connected arrow shape in inventory.

### S-M05 — `create-draw` structured path

**When** Structured stroke/path payload.**Then** **`draw`**-like shape; **not** live pointer replay verification (static outcome only).

### S-M06 — M8 note-only story

**When** Inspect **`--help`/Skill**.**Then** **No separate `create-text` subcommand** in M1; plain text diagrams documented via **`create-note`**.

### S-M07 / S-M08 — `select`, `clear-selection`, **`move`**

**When** Create two notes, **`select`** both, then **`move --dx ... --dy ...`**.**Then** **Selection + delta-updated positions** reflected in **`get-state`**.

### S-M09 / S-N06 — `delete` without `--confirm` vs with

**When** **`delete`** without confirm.**Then** **`ok: false`**, guarded error.**When** **`--confirm`** + matching args.**Then** Shape removed from **`get-state`**.

### S-M10 — `layout-row` / `layout-column`

**When** Arrange multiple shapes.**Then** Bounding layout change detectable (**delta** thresholds doc’d in SKILL/QA notes).

### S-M11 — `layout-grid` bound violation

**When** Request **25×1** grid or **`> TECH max`**.**Then** **`VALIDATION_ARG`** (or TECH code) recoverable failure.

### S-M12 — `update-shape` allow-list vs unknown patch key

**When** Allowed patch (e.g. color).**Then** Accept.**When** Unknown key.**Then** Stable rejection (never silent apply).

### S-M13 — `viewport`

**When** **`viewport`** adjusts zoom/pan.**Then** Subsequent **`get-state.viewport`** coherent with UI.

---

## 6. Negative & edge scenarios

### S-N01 — Correlation

**When** Two parallel **`atmos`** invocations with distinct **`request_id`**.  
**Then** Responses never cross-match (each **`data`/error`** pairs correctly).

### S-N02 — Auth failure

**When** **`POST`** without/with invalid credential.  
**Then** **401/403**, **`PERMISSION_DENIED`**, no bridge side-effects visible.

### S-N03 — Stale **`shape_id`** on **`update-shape`/`move`/`delete`**

**When** Use fabricated id.**Then** **`STALE_SHAPE_ID`**, remediation text references **`get-state`**.

### S-N04 — Editor not mounted

**When** Simulate bridge registered but editor teardown (implementation-defined test hook or race window).  
**Then** **`EDITOR_NOT_READY`** or **`CANVAS_BRIDGE_OFFLINE`** as specified—never success with no-op.

### S-N05 — Browser never answers (`timeout`)

**Given** Debugger holds bus (or sabotage uplift in dev harness).  
**Then** **`RELAY_TIMEOUT`** / **504**, CLI non-zero exit, pending map cleaned (**no leaked waiters** on second invoke).

### S-N07 — Multi-tab ambiguity (**default policy**)

**Given** Two bridge-enabled tabs.**When** **`POST`** omit **`client_id`.**Then** **`409`** + **`CANVAS_CLIENT_AMBIGUOUS`** listing ids.**When** Retry with **`client_id=<target>`.**Then** Targets correct canvas only.

---

## 7. Discoverability (**M19**)

### S-D01 — Repo skill present

**Then** **`skills/atmos-canvas-agent/SKILL.md`** exists in repo; manifest + **`ALL_SYSTEM_SKILL_NAMES`** synced per TECH.

### S-D02 — User install dir after sync

**Given** Post API start / desktop parity.**Then** **`~/.atmos/skills/.system/atmos-canvas-agent/SKILL.md`** present (manual check on developer machine).

### S-D03 — **`atmos canvas skill-dir`** (alias `skill-path`)

**When** Invoked.**Then** Matches TECH §4 canonical **prompt + expanded path** conventions (local home); **does not touch network.**

### S-D04 — Canvas “copy agent instructions”

**Given** Reliable **`fs_get_home_dir`** semantics (local/runtime).  
**When** User triggers **M19** control.**Then** Clipboard = **TECH §4 prompt + absolute directory**.

### S-D05 — Fallback path wording

**When** Home expansion unavailable.**Then** UI/CLI degrade to **`~`/`<template>`** line per TECH—not empty clipboard.

---

## 8. Agent presence & Follow Agent (**M20**)

### S-P01 — Agent appears as a distinct presence

**Given** Bridge enabled and Canvas open in the target tab.  
**When** `atmos canvas create-note --actor-name "Codex Agent"` succeeds.  
**Then** Canvas shows an Agent activity chip / presence affordance distinct from the human user, and the active tldraw presence state includes an Agent **`userId`** matching TECH §9 (`agent:<actor_id>`).

### S-P02 — Follow Agent tracks latest command area

**Given** An Agent presence exists and the user clicks **Follow Agent**.  
**When** the Agent runs two mutations in different board regions.  
**Then** the viewport follows or jumps to the latest changed bounds using tldraw following semantics (`startFollowingUser` / `zoomToUser` equivalent), and the dispatch result includes **`agent_user_id`** plus **`changed_bounds`**.

### S-P03 — Manual interaction stops following normally

**Given** User is following the Agent.  
**When** the user manually pans/zooms/selects on the canvas.  
**Then** Follow Agent stops according to normal tldraw follow behavior; later Agent commands update presence but do not forcibly retake the user’s viewport unless the user follows again.

### S-P04 — Presence cleanup / stale prevention

**Given** Agent commands have stopped or the bridge unregisters.  
**When** Agent presence TTL expires (TECH §2) or the tab disconnects.  
**Then** Agent activity UI becomes idle/cleared, stale presence is not followable as an active actor, and no document state is persisted solely for presence.

---

## 9. Non-functional checks

| ID | Requirement | Evidence |
|----|-------------|-----------|
| **NF-01** | Relay default timeout **≤ 45 s** (**TECH §2**); **`--timeout-ms`** honoured client-side | Manual stopwatch / log timestamps |
| **NF-02** | Autosave interleaving: rapid CLI invokes ≠ corrupt doc / wedged undo (TECH §8.1 mutex) | Manual spam + reopen board |
| **NF-03** | Debug tracing: searchable **`request_id`** in `./logs/debug/` per `agents/references/debug-logging.md` | Spot check one failed + one okay run |
| **NF-04** | Agent presence is session-only; no `TLInstancePresence` records leak into persisted board JSON | Reload board / inspect persisted payload |

---

## 10. Manual regression checklist pre-release

- [ ] **S-T01** local E2E (status + simple create-note)  
- [ ] **S-B01** bridge toggle/offline behaviours  
- [ ] **S-N07** two-tab ambiguity + **`--client-id`** success path  
- [ ] **S-M09/S-N06** delete guard  
- [ ] **S-D04** clipboard content matches TECH  
- [ ] **S-P01/S-P02** Agent presence visible and Follow Agent tracks latest command area  
- [ ] Persistence round-trip (**S-B03** tail)  

---

## 11. Automated test placement (implementation guide)

| Component | Suggested venue |
|-----------|----------------|
| **`canvas-agent-bus`** (TS) | `apps/web` colocated **`*.test.ts`** or **`bun:test`** fixtures—pure functions first. |
| **`canvas-agent-presence`** (TS) | Unit tests for actor normalization, TTL cleanup, and `changed_bounds` → presence/camera metadata. |
| **HTTP relay + waiter** | `apps/api` or `core-service` **`#[tokio::test]`** using mock **`WsManager`** / fake browser sender callback. |
| **`canvas_dispatch_result` handler** | Same—assert waiter completion + malformed **`request_id`** dropped safely. |

---

## 12. Coverage status

_Pre-implementation: no automated suites recorded._

| Scenario / bucket | Automated | Manual | Last verified |
|-------------------|-----------|--------|---------------|
| §3 Relay & bridge | — | — | _not run_ |
| §4 Read model | — | — | _not run_ |
| §5 Mutations | — | — | _not run_ |
| §6 Negative | — | — | _not run_ |
| §7 M19 | — | — | _not run_ |
| §8 M20 Agent presence | — | — | _not run_ |

After **`atmos-specs-test-run`**: append row results + commit SHA.

---

## 13. References

- [PRD.md](./PRD.md) · [TECH.md](./TECH.md)
- Canvas baseline QA context: [APP-014 TECH](../APP-014_canvas/TECH.md)
- Debug logs: [`agents/references/debug-logging.md`](../../../agents/references/debug-logging.md)
- tldraw user following: https://tldraw.dev/sdk-features/user-following
