# TEST · APP-075: PT Design Interactive Canvas

> Test Plan · extract/project, real DOM Interact, Excalidraw Edit + **native undo**, Agent PTX. References PRD APP-075 and TECH APP-075. No APP-062 compatibility tests.

## Test strategy

- **Bun** in `packages/pt-design`: PTX codec, extract/project, headless session, tools, CLI/MCP parity, isolation.
- **Playground / E2E**: overlay, Interact, Edit drag, **Cmd+Z after drag and after Agent apply**.
- **Host**: new persistence key; sidebar still opens PT Design.
- **Collab**: remote apply does not grow local undo (manual or fixture).
- No new REST document API.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 PTX Agents/files | S1, S3, S12 |
| M2 Live mapping | S2, S9, S19 |
| M3 Spatial on node | S4, S9 |
| M4 Real DOM catalog | S5, S6, S29, S36, S37 |
| M5 Options | S7, S8 |
| M6 Palette = Agent | S14 |
| M7 `.ptd` | S15, S16 |
| M8 Edit + Excalidraw undo | S9, S10, S21, S30 |
| M9 Interact | S6, S10, S11, S31 |
| M10 Runtime via board | S6, S17 |
| M11 Agent PTX file loop | S12, S13, S35 |
| M12 Screenshot | S33 |
| M13 Isolation / headless | S20, S22 |
| M14 Atmos embed | S23, S24 |
| M15 New tools only | S18, S25, S26 |
| M16 Collab NEVER undo | S27 |
| N* | not required |

## Execution map

| Scenario | Level | Expected tool | Target | Fixture | Signals | Status |
|----------|-------|---------------|--------|---------|---------|--------|
| S1 | Bun | `bun test` | PTX round-trip | golden ptx | AST preserved | planned |
| S2 | Bun | `bun test` | extract/project | fake elements | ids + spatial + payload | planned |
| S3 | Bun | `bun test` | `pt_ptx_get` | headless | PTX, no scene JSON required | planned |
| S4 | Bun | `bun test` | parse spatial | button attrs | numbers on node | planned |
| S5 | Bun + browser | playground + `bun test` | full catalog | Interact / registry | every frozen id is a real Renderer, not a drawing | planned |
| S6 | E2E | Playwright `just test-e2e -- tests/specs/APP-075_pt-design-interactive-canvas.e2e.ts` | Interact | select+input+click | values in extract; action fired | planned |
| S7 | Bun | `bun test` | invalid option | no value | `invalid_option` | planned |
| S8 | Bun | `bun test` | valid option | value+label | AST options | planned |
| S9 | E2E | Playwright | Edit drag | handle | extract x/y changed | planned |
| S10 | E2E | Playwright | pointer exclusivity | both modes | Interact no spatial change | planned |
| S11 | E2E | Playwright | Interact pan | view | spatial unchanged | planned |
| S12 | Bun | `bun test` | edit PTX file | temp `document.ptx` | add option in XML, apply, file matches | planned |
| S13 | Bun | `bun test` | `pt_ptx_apply` full source | edited XML string | new option present; orphan snippet rejected | planned |
| S14 | Bun | `bun test` | defaultNode vs create | button | equal minus id | planned |
| S15 | Bun | `bun test` | bundle IO | temp dir | ptx + canvas.json | planned |
| S16 | Bun | `bun test` | headless missing canvas | ptx only | loads | planned |
| S17 | Bun | `bun test` | click action | mock liveBoard | applyDocument NEVER; host action payload | planned |
| S18 | Bun | `bun test` | old tool name | `pt_ir_get` | unknown tool error | planned |
| S19 | Bun | `bun test` | customData.pt.id | project | mapping stable across project | planned |
| S20 | Bun | `bun test` | isolation | src | no forbidden imports | planned |
| S21 | E2E | Playwright | Cmd+Z after drag | Edit | extract restored | planned |
| S22 | Bun | import graph | headless | no `@excalidraw/excalidraw` | planned |
| S23 | Bun | structural | host tab | `"pt-design"` registered | planned |
| S24 | agent-browser | web | sidebar | mode **Edit**/**Interact** | planned |
| S25 | Bun | `bun test` | MCP/CLI/headless parity | same ops | canonical PTX | planned |
| S26 | Bun | `bun test` | bad PTX | CLI | `invalid_ptx` / `missing_file` | planned |
| S27 | Manual | two clients | collab drag | room | B sees move; B undo stack unchanged by A's drag | planned |
| S28 | Bun | `bun test` | old storage key | v1 blob | ignored, fresh doc | planned |
| S29 | E2E | Playwright | Select list | Interact | custom list, no OS popup required | planned |
| S30 | E2E | Playwright | Cmd+Z after `pt_ptx_apply` | **Edit Mode** | option/value reverted | planned |
| S31 | E2E | Playwright | Cmd+Z in Interact | after an Edit drag | board x/y **unchanged**; no Excalidraw undo | planned |
| S33 | Bun/E2E | screenshot | live | png bytes | planned |
| S35 | Bun | `bun test` | serialize pretty | same AST | identical XML bytes (stable attr order) | planned |
| S36 | Bun | `bun test` | nested children | card+input PTX | children round-trip; project = 1 handle | planned |
| S37 | Bun | `bun test` | dotted block tags | `block.auth-form` | `<block-auth-form>` parse/serialize | planned |

## Scenarios

### S1 — PTX round-trip
Parse → serialize → parse the source sample page. Ids, spatial, options, events match.

### S2 — extract/project
Project a two-node document onto `[]`, extract. Same nodes. Second project keeps handle element ids.

### S3 — Agent PTX only
`pt_ptx_get` returns pretty XML (`<page`…). No Excalidraw JSON required.

### S4 — Spatial on the node
`<button x="580" y="180" width="120" height="40"/>` → AST numbers.

### S5 — Full catalog is real UI
Every id in `SHADCN_BASIC_IDS` and `REQUIRED_BLOCKS` parses as a `PtNodeType` (minimal self-closing tag with spatial attrs). After the renderer wave: the registry maps each id to a real `Renderer` (no wireframe-only fallback). Playground/E2E: Interact a representative set — button/input/textarea/checkbox/`radio-group`/select/switch, plus one overlay type (dialog or select list **in-canvas**), plus one block (`block.auth-form`). Overlay types must not use `document.body` portals.

### S6 — Interact commits
Change select to `gemini`, type input, click Run. Extract shows values; agent action `run` once.

### S7 — Option without value
`<option>Claude</option>` → `invalid_option`; previous doc unchanged.

### S8 — Option pair
`value` + text → `{ value, label }`.

### S9 — Edit drag writes extract
Drag `run` so x≈580. `pt_ptx_get` / extract reflects x. `customData.pt.id` stable.

### S10 — Pointer exclusivity
Interact drag on button does not change x/y. Edit click selects the handle, not focusing the control as primary.

### S11 — Interact pan
Pan/zoom does not change node spatial props.

### S12 — Agent edits `document.ptx` like source
Headless: read PTX, insert `<option value="deepseek">DeepSeek</option>` into the select, write/apply full file. File and `pt_ptx_get` show the option.

### S13 — Apply is the full file; orphan snippet fails
`pt_ptx_apply` with complete edited XML succeeds. `pt_ptx_apply` with only `<option value="x">X</option>` (no `<page>`) → `invalid_ptx`; previous doc unchanged. Freehand in `project()` still kept when applying a full page.

### S14 — Palette vs Agent XML
Palette `defaultNode("button")` serializes to the same PTX tag/attrs an Agent would write (ignore `id`).

### S15 — Bundle
Save writes `document.ptx` and `canvas.json`.

### S16 — PTX without canvas
Headless open succeeds.

### S17 — Action via board
Interact click: mocked `applyDocument(..., "NEVER")` plus host action payload. Board undo stack does not grow.

### S18 — Old tools gone
`pt_ir_get` / `pt_layout_row` → unknown tool; no mutation.

### S19 — Stable mapping
`customData.pt.id === "run"` after move/undo (unit: project twice).

### S20 — Isolation
No `api-*` / shared / ui / `apps/*`.

### S21 — Undo drag (Excalidraw, Edit Mode)
Edit Mode: drag then Cmd+Z. Extract x/y restored. **No app-owned history API involved.**

### S30 — Undo Agent XML apply (Edit Mode)
Edit Mode: `pt_ptx_get`, add an option in the XML text, `pt_ptx_apply`, Cmd+Z, option gone in extract.

### S31 — Interact does not undo the board
Edit Mode: drag a node. Switch to Interact (board or a control focused). Cmd+Z does **not** restore the pre-drag position. Switch back to Edit; Cmd+Z then restores. A focused input may undo its own typed text only.

### S22 — Headless graph
No `@excalidraw/excalidraw`.

### S23 — Host registration
Center/sidebar PT Design still registered.

### S24 — Sidebar chrome
agent-browser: **PT Design**, **Edit**, **Interact** (not `EDIT`).

### S25 — Parity
Same create+update via session, CLI `--json`, MCP → canonical PTX equal.

### S26 — Bad file
Missing `.ptd` / malformed XML → structured error, non-zero CLI.

### S27 — Collab
A drags; B sees it. A's op must be applied on B with capture `NEVER` (B Cmd+Z does not revert A's drag as a local redo/undo surprise). Manual.

### S28 — Old key ignored
v1 scene blob at old key → empty new document, no throw.

### S29 — Select does not use OS popup
Interact: options list is in-page; choosing an option updates `value`.

### S33 — Screenshot
Live capture returns image bytes.

### S35 — Pretty, stable XML
Serialize twice from the same AST → identical bytes; attribute order matches TECH (id, label, value, spatial, others).

### S36 — Nested children
Parse a `<card>` containing an `<input>` child. AST has `children[0].type === "input"`. `projectDocument` yields **one** handle; payload contains the nested node. Extract restores the tree. Nested `x`/`y` stay relative (not added to parent canvas x/y).

### S37 — Dotted block XML tags
`<block-auth-form id="a" x="0" y="0" width="320" height="200"/>` parses to `type: "block.auth-form"`. Serialize uses `<block-auth-form>`. Same for the other three `REQUIRED_BLOCKS` ids. Unknown tag `<nope/>` → `invalid_ptx`.

## Performance & load budgets

- Extract of 200 nodes < 50ms (measure if cheap).
- Overlay follow during pan: flag jank in agent-browser, no hard FPS gate in v1.

## Regression checklist

- [ ] Headless CI without Excalidraw.
- [ ] Invoke still uses `pt_design_bridge_*`.
- [ ] Collab ciphertext; no PTX in API logs.
- [ ] Sentence case **Edit** / **Interact**.
- [ ] Cmd+Z after drag and after Agent apply **in Edit Mode** (S21, S30); Cmd+Z in Interact does not pop board history (S31).
- [ ] Theme/ink `updateScene` still `NEVER` (does not create undo noise).
- [ ] APP-014 untouched.

## Exploratory agent-browser checks

Load Agent Browser skill or `agent-browser skills get core --full`. Else `specs/references/agent-browser-setup.md`.

1. Closed loop: Agent-style PTX edit → Interact click → Edit drag → Cmd+Z → save `document.ptx`.
2. Narrow viewport: mode toggle not clipped.
3. Select custom list + switch.
4. Console: no failed bridge register; no overlay exceptions while zooming.

## Acceptance criteria

- [ ] M1–M16 each have a passing scenario (S27 may be recorded manual).
- [ ] S21 and S30 pass (Excalidraw undo, not a custom stack).
- [ ] No new document REST endpoints.
- [ ] Old Agent tools are absent/unknown.
- [ ] `atmos-specs-test-run` Coverage Status filled.
- [ ] Package `bun test` + scoped web tests / `just lint` pass or scoped alternatives recorded.

## Manual verification steps

1. Two profiles, shared room, Edit drag, peer sees move; peer undo does not rewind the remote drag (S27).
2. Optional: Electron shell, sidebar → center PT Design.

## Non-coverage

- N3–N7, pixel-perfect shadcn, codegen, mobile, APP-062 import, orphan-snippet apply RPC.

## Coverage Status

_Last run: 2026-09-02 · atmos-specs-test-run S33/S5/S27 evidence · worktree Next `:3130` + worktree API `:31303` (`E2E_API_PORT=31303`, CORS `localhost:3130`). Leftover OpenSource `:30303` still listening, unused by this invoke._

Commands (exact):

- `cd packages/pt-design && bun test src` → **241 pass / 1 skip / 0 fail**, exit **0** (S33 live bun still skip; S27 `onScene` NEVER + crypto round-trip green).
- `bun run --cwd e2e lint` → exit **0**.
- `E2E_API_PORT=31303 E2E_WEB_PORT=3130 E2E_SINGLE_SERVER=0 E2E_REUSE_SERVER=1 just test-e2e tests/specs/APP-075_pt-design-interactive-canvas.e2e.ts --project=chromium --workers=1` (no extra `--`; no `E2E_START_WEB=0`; reused Next `:3130` `/pt-design` HTTP **200**). Official 10-test run → **10 passed / 0 failed / 0 skipped**, exit **0** (~1.2m). Added `@spec S33` and `@spec S5`; existing S6/S9/S10/S11/S21/S29/S30/S31 bodies unchanged.
- `just lint` / full `just test-e2e` (mobile project) not claimed.

Live board: `seedOnboardingComplete` + `{ ptx }` at `pt-design/v2/global` projects chrome, Edit/Interact, Excalidraw toolbar, and overlay ids `model` / `prompt` / `run` (S5 also `dlg` / `auth`). Scope this pass: S6 / S9 / S10 / S11 / S21 / S29 / S30 / S31 / **S33 live PNG** / **S5 dialog + block.auth-form**. S24 agent-browser only if Edit/Interact observed. S27 source-level (no dual-browser).

- S1 — ✅ `packages/pt-design/src/protocol/ptx.test.ts::S1 PTX round-trip > parse → serialize → parse preserves golden AST`
- S2 — ✅ `packages/pt-design/src/protocol/scene.test.ts::S2 extract/project > project onto empty then extract; second project keeps handle ids`
- S3 — ✅ `packages/pt-design/src/agent/agent.test.ts::S3 Agent PTX only > pt_ptx_get returns pretty XML and does not require scene JSON`
- S4 — ✅ `packages/pt-design/src/protocol/ptx.test.ts::S4 spatial on the node > button spatial attrs become numbers`
- S5 — ✅ bun registry/catalog/overlay/form: `packages/pt-design/src/components/registry.test.ts::listComponentTypes > S5 every frozen id has a real Renderer, defaultNode, and parsePtx-round-trippable node`; `packages/pt-design/src/catalog/catalog.test.ts::S5 catalog completeness`; `packages/pt-design/src/components/groups/overlay/overlay.test.ts::S5 in-place overlay renderers (no document.body portal)` including `S5 representative page PTX parsePtx accepts dialog + block-auth-form`; `packages/pt-design/src/components/groups/form/form.test.ts::Interact markup > S29 / S5 select uses an in-tree listbox`. ✅ e2e `@spec S5 — Interact representative overlay dialog and block.auth-form` (**2.7s**): `[data-pt-overlay-id="dlg"]` visible inside `[data-pt-overlay]`, no escaped `role="dialog"` on `document.body`; `[data-pt-overlay-id="auth"]` has real `input` + `button` (not unresolved placeholder). Plus S6 button/input + S29 in-page select.
- S6 — ✅ e2e `@spec S6 — Interact commits select, input, and click` (**2.4s**). Overlay projected; Interact: Gemini + `hello from S6` + Run; extract showed values. Invoke on worktree `:31303`.
- S7 — ✅ `packages/pt-design/src/protocol/ptx.test.ts::S7 / S8 options > S7 option without value is invalid_option`; `packages/pt-design/src/core/headless-session.test.ts::headless PTX session > S7 invalid_option leaves the previous document unchanged`
- S8 — ✅ `packages/pt-design/src/protocol/ptx.test.ts::S7 / S8 options > S8 value + text become option pair`
- S9 — ✅ e2e `@spec S9 — Edit drag writes extract x/y` (**2.3s**). Overlay projected; Edit drag of `run` changed extract x/y (Δ≠0).
- S10 — ✅ e2e `@spec S10 — Interact pointer drag does not change node spatial` (**2.4s**). Overlay projected; Interact drag left run x/y at 300.
- S11 — ✅ e2e `@spec S11 — Interact pan does not change node spatial` (**2.3s**). Overlay projected; Interact pan left run x/y at 300.
- S12 — ✅ `packages/pt-design/src/agent/agent.test.ts::S12 Agent edits document.ptx like source > insert option in XML, apply full file, file and pt_ptx_get match`
- S13 — ✅ `packages/pt-design/src/core/headless-session.test.ts::headless PTX session > S13 applyPtx with a complete page succeeds; orphan snippet is invalid_ptx`; `packages/pt-design/src/protocol/ptx.test.ts::S13 orphan snippets`; `packages/pt-design/src/embed/live-board.test.ts::createLiveBoard applyPtx > S13 orphan option throws invalid_ptx and does not updateScene; freehand kept on full apply`
- S14 — ✅ `packages/pt-design/src/components/registry.test.ts::S14 palette vs Agent XML > defaultNode(button) serializes to the same tag, bbox, and events as xmlExample (ignore id)`
- S15 — ✅ `packages/pt-design/src/protocol/bundle.test.ts::S15 protocol bundle IO > writeBundle writes document.ptx and canvas.json; readBundle round-trips`
- S16 — ✅ `packages/pt-design/src/core/headless-session.test.ts::headless PTX session > S16 PTX without canvas.json still opens`
- S17 — ✅ bun `packages/pt-design/src/embed/live-board.test.ts::createLiveBoard applyDocument / extract > S17 extract matches spatial and value; Interact commit is NEVER and history does not grow`; `S17 Interact click fires host action payload and applyDocument NEVER does not clear history`; ✅ `live-board.test.ts::S17 PtDesignApp OverlayHost is passed onAction`. ✅ live Interact `run` via e2e S6 this pass.
- S18 — ✅ `packages/pt-design/src/agent/agent.test.ts::agent adapters > S18 old tool names are unknown_tool and do not mutate PTX`
- S19 — ✅ `packages/pt-design/src/protocol/scene.test.ts::S19 stable mapping > customData.pt.id stays run across project twice`
- S20 — ✅ `packages/pt-design/src/isolation.test.ts::S20 package isolation > core/cli/mcp do not import api-*/shared/ui/apps/* or browser Excalidraw`
- S21 — ✅ e2e `@spec S21 — Cmd+Z after Edit drag restores extract` (**2.6s**, re-run after S12 #20). Overlay projected; Edit drag then mac `Meta+z` restored extract x/y to 300.
- S22 — ✅ `packages/pt-design/src/isolation.test.ts::S20 package isolation > S22 headless graph has no @excalidraw/excalidraw`; `packages/pt-design/src/core/headless-session.test.ts::headless PTX session > S22 does not import @excalidraw/excalidraw`
- S23 — ✅ `apps/web/src/app-shell/__tests__/pt-design-host.test.ts::PT Design Atmos host wiring > S23 center tool tab registry accepts pt-design`; `S23 invoke still uses pt_design_bridge_* on the main /ws`; launchpad `/pt-design`
- S24 — ⏸ agent-browser **not_run** (re-checked 2026-09-02 after S5/S33 e2e): CLI 0.26.0, `http://127.0.0.1:3130/pt-design`, `atmos_onboarding_done=true`, title `Prototype Design – ATMOS`, wait `[data-testid=pt-design-center]` **>150s** no mount; eval `center=false` `bodyChildren=8` `bodyText=""` `key=no-ptx`. React DevTools logs only, no page errors. Playwright on the same origin **10/10** waits for `pt-design-center` / `pt-design-mode` (Edit/Interact) — Playwright, not S24. bun ModeToggle + host i18n sentence case still pass.
- S25 — ✅ `packages/pt-design/src/agent/agent.test.ts::S25 CLI / MCP / headless PTX parity > same create+update yields canonical PTX`
- S26 — ✅ `packages/pt-design/src/agent/agent.test.ts::S26 bad PTX CLI > missing .ptd is missing_file with non-zero exit` and `malformed XML is invalid_ptx with non-zero exit`
- S27 — ✅ source-level (dual-browser **skipped** / not cheap): `packages/pt-design/src/embed/chrome.test.ts::S27 collab remote apply NEVER > onScene applies remote elements with captureUpdate NEVER`; crypto round-trip `packages/pt-design/src/collab/names.test.ts::collab crypto > round-trips a scene payload`. Not two live clients.
- S28 — ✅ `packages/pt-design/src/host/adapters.test.ts::S28 old storage key ignored`; host `S23 / S28 standalone page uses the v2 scene key...`
- S29 — ✅ bun listbox: `form.test.ts::Interact markup > S29 / S5 select uses an in-tree listbox and not a native select element`. ✅ e2e `@spec S29 — Select list is in-page, not an OS popup` (**2.3s**): no native `<select>`, in-page Gemini option, trigger shows Gemini.
- S30 — ✅ e2e `@spec S30 — Cmd+Z after pt_ptx_apply in Edit Mode reverts XML` (**2.5s**). Overlay projected; Edit pressed; `pt_ptx_apply` wrote `deepseek` (poll true); overlay force-click + mac `Meta+z`; extract **no longer** includes `deepseek`. Live History dump: overlay click had been a visible `selectedElementIds.el_run` increment on top of the apply payload; Edit Cmd+Z now uses native `button-undo` and after paint pops a second time when extract is unchanged. Not skip-as-green.
- S31 — ✅ e2e `@spec S31 — Cmd+Z in Interact does not undo the board` (**2.8s**, re-run after S12 #20). Overlay projected; Edit drag changed x; Interact `Meta+z` left x.
- S33 — ✅ e2e `@spec S33 — Live capture returns image bytes` (**2.7s**): `POST /api/pt-design/agent/invoke` `pt_screenshot` `client_id=global` returned `ok===true` with `mime`/`mediaType` `image/png` and base64 PNG magic `89 50 4E 47`. bun live `screenshot.test.ts` still **skipped** (no real Excalidraw Image). ✅ headless `pt_screenshot` is `path_denied`.
- S35 — ✅ `packages/pt-design/src/protocol/ptx.test.ts::S35 pretty stable XML > serialize twice yields identical bytes and reserved attr order`
- S36 — ✅ `packages/pt-design/src/protocol/ptx.test.ts::S36 nested children`; `packages/pt-design/src/protocol/scene.test.ts::S36 project nested children > nested payload is one handle; extract keeps relative x/y`
- S37 — ✅ `packages/pt-design/src/protocol/ptx.test.ts::S37 dotted block XML tags > REQUIRED_BLOCKS parse and serialize dashed tags` and `unknown tag is invalid_ptx`

Regression checklist:

- Headless CI without Excalidraw — ✅ S22 isolation / headless-session (and package `bun test src` does not load `@excalidraw/excalidraw` in the headless graph).
- Invoke still uses `pt_design_bridge_*` — ✅ `pt-design-host.test.ts::S23 invoke still uses pt_design_bridge_* on the main /ws`
- Collab ciphertext; no PTX in API logs — ⏸ partial: `packages/pt-design/src/collab/names.test.ts::collab crypto > round-trips a scene payload`. Did not inspect live API logs.
- Sentence case Edit / Interact — ✅ bun ModeToggle + host i18n. ⏸ agent-browser UI not observed (S24). Playwright saw Edit/Interact on `/pt-design` after onboarding seed (official 10/10).
- Cmd+Z after drag / Agent apply in Edit; Interact does not pop board history — ✅ e2e S21 (Edit drag `Meta+z` restores x/y). ✅ e2e S30 (apply `deepseek` then `Meta+z` drops it). ✅ e2e S31 (Interact does not pop).
- Theme/ink `updateScene` still `NEVER` — ✅ source asserts in `packages/pt-design/src/isolation.test.ts` (embed `captureUpdate: "NEVER"`) and `chrome.test.ts` collab hook.
- APP-014 untouched — not_run (out of scope; no APP-014 suite executed).

Performance: ✅ `packages/pt-design/src/protocol/scene.test.ts::extract performance > extract of 200 nodes is under 50ms`. Overlay pan jank — agent-browser not_run (black page).

Exploratory agent-browser (TEST.md list): **not_run** — same empty/black hydrate as S24; no closed-loop PTX/Interact/Edit/Cmd+Z, no viewport clip check, no overlay-zoom console proof.

Live `/pt-design` this pass on worktree Next `:3130` + API `:31303`: S6 / S9 / S10 / S11 / S21 / S29 / S30 / S31 / **S33** / **S5** **proven** (official Playwright **10/10**). S24 agent-browser still not_run (blank hydrate). S27 source-level only (no dual-browser). bun S33 live still skip.
