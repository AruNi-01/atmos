# PRD · APP-015: Canvas Terminal Agent Integration

> Product Requirements · WHAT and WHY. Terminal-resident **code agents** manipulate the persisted **Canvas** via **`atmos canvas`** and a bundled **Skill**, without configuring **new Atmos provider API keys**. Distinct from **[APP-004](../APP-004_local-agent-integration-acp/TECH.md)** (ACP chat).

## Context

- **Problem**: Canvas ([APP-014](../APP-014_canvas/PRD.md)) is rich for humans in the browser, but **terminal-based agents** (Codex CLI, Gemini CLI, Claude Code, custom agent CLIs launched from Atmos terminals) cannot drive it programmatically. Users who already authenticate those agents in the terminal gain nothing if Atmos adds a parallel “canvas API key” story.
- **Why now**: tldraw ships an **[official Agent starter kit](https://tldraw.dev/starter-kits/agent)** demonstrating structured **canvas actions → `editor`**, multi-shape layout, viewport control, and non–driver-level APIs. That pattern validates product expectations (diagrams, styled notes, grids). Atmos needs the **same capability class** delivered through **Skill + CLI + in-app command bus**, because our agents run in **shell context**, not inside a hosted tldraw chat panel.
- **Relation to APP-014**: This spec **adds an external control plane** for the same default board and tldraw document. It does **not** replace manual canvas use or change the core “terminal card + built-in shapes” product.
- **Relation to APP-004**: **Out of scope** — no requirement to route canvas control through `/ws/agent` or ACP tool handlers for M1.
- **Design reference**: Behaviors and **breadth of operations** should align with the [tldraw Agent starter kit capabilities](https://tldraw.dev/starter-kits/agent) (create/update/delete shapes, strokes, layout bundles, viewport) where product-relevant; **transport** differs (CLI → API relay → browser). See `BRAINSTORM.md` for the comparison table.
- **Presence reference**: tldraw’s [collaboration](https://tldraw.dev/docs/collaboration) and [user following](https://tldraw.dev/sdk-features/user-following) features are built around **presence records** (`TLInstancePresence`) and `editor.startFollowingUser(userId)`. APP-015 should use that presence layer for “Follow Agent”; `@tldraw/driver` remains only an optional editor-control helper, not the source of collaborator identity.
- **Skill delivery (product decision)**: The Canvas agent Skill is an **Atmos system skill** — same distribution as `git-commit` and `project-wiki`: source lives under repo **`skills/<skill-id>/`**, and **`crates/infra/src/utils/system_skill_sync.rs`** (plus **`skills/system-skills-manifest.json`**) syncs it to **`~/.atmos/skills/.system/<skill-id>/`** on API startup (bundled desktop, dev tree, or raw GitHub fallback). **M1 does not** depend on users running `npx skills add` or manual downloads; [skills.sh](https://skills.sh) / marketplace install remains **optional** for discoverability only if we choose to publish a duplicate later (Nice to Have).
- **Discoverability caveat**: Writing `SKILL.md` under `~/.atmos/skills/.system/` does **not** auto-load context into terminal agents—users historically had to `@` path or paste manually. **M19** mandates Canvas + CLI affordances that copy/output a **brief prompt plus the skill directory** so agents can resolve and read **`SKILL.md`** themselves—**without tribal knowledge**.

## Goals

1. **Primary**: A user (or their **terminal code agent**) can **read** canvas state and **apply** a **documented set** of drawing and layout operations on the **live** Canvas while the app is open, using **`atmos canvas`** and the bundled **Skill**, reusing **existing CLI authentication** — no new Atmos-managed LLM API keys for this workflow.
2. **Secondary**: Operations preserve **interactive canvas semantics** (current page, selection, undo/redo coherence, persisted board) consistent with APP-014, rather than overwriting opaque JSON from the CLI alone.
3. **Secondary**: The **Skill** teaches agents **when** to use Canvas, **how** to call CLI verbs, prerequisites (bridge / Canvas visibility), and **safe destructive** flows.
4. **Secondary**: Users can **point terminal agents at the synced skill directory plus a minimal prompt**, via Canvas UI and/or CLI—not only by memorizing `~/.atmos/skills/.system/`; agents load **`SKILL.md` locally** for full detail.
5. **Secondary**: Canvas exposes terminal-agent activity as a visible **Agent presence** so users can **follow Agent work** instead of wondering where automated changes happened.

## Users & Scenarios

- **Primary persona**: **Agentic Builder** running a code agent inside an Atmos terminal who wants slides, diagrams, labeled regions, styled notes, terminal cards, or layout grids on the Canvas without leaving terminal-driven workflows.
- **Secondary persona**: **Power user** scripting `atmos canvas` from shell or CI-local scripts when the Canvas is connected (advanced; not blocked if product-safe).

### Key scenarios

1. Agent creates a simple **diagram** on Canvas (frames, geo shapes, arrows, sticky notes, optional freehand stroke payload) after user asks in natural language in the terminal.
2. Agent **reads** `get-state` / `status`, then **updates** existing shapes (colors, text, bounds) to match a “starter kit–style” layout (e.g. titled grid of feature cards).
3. Agent **arranges** multiple shapes in a row, column, or bounded grid.
4. User has **two browser windows**; CLI fails with a **clear, actionable** message unless they pass a disambiguator (routing policy in TECH; `status` surfaces ambiguity per M5).
5. User has **not** opened Canvas or **not** enabled terminal/CLI control; CLI **fails fast** with instructions (no silent no-op).
6. User **opts in** once per session (or explicit toggle) before **mutating** commands run (see M18).
7. User opens Canvas and taps **“Use with terminal agent”** (name TBD); the app copies a **short prompt blurb + the skill install directory** (`~/.atmos/skills/.system/<skill-id>/`); the agent is expected to **open and read `SKILL.md` inside that directory** for full `atmos canvas` semantics.
8. User starts **Follow Agent** while a terminal agent is editing the canvas; the viewport follows the Agent’s latest command area using tldraw presence semantics, then stops when the user manually interacts with the canvas.

## User Stories

- As a terminal agent user, I want my agent to **call documented `atmos canvas` commands**, so it can manipulate the canvas the same way I would with tools—but without exposing low-level tldraw driver APIs to me.
- As a terminal agent user, I want agents to reuse **their existing CLI/auth setup**, so I never add a separate API key inside Atmos for “canvas reasoning.”
- As a Canvas user, I want external commands to run **against the live editor**, so undo, viewport, selection, and save behavior stay consistent with the UI.
- As a Canvas user, I want **destructive operations** guarded, so accidental mass-delete from scripts is unlikely.
- As a multi-window user, I want predictable **routing** of commands to the intended Canvas session.
- As a Canvas user running a terminal agent, I want a **single action in Canvas** that copies a **minimal prompt + skill directory path** so I can paste once and the agent reads `SKILL.md` there for details, without hunting hidden paths myself.
- As a Canvas user watching agent-generated diagrams, I want the Agent to appear as a **followable actor**, so I can keep my viewport on the area the Agent is currently changing.

## Functional Requirements

### Must Have

- **M1 — Skill artifact & distribution**: Ship the Skill as a **system skill** integrated with Atmos’s existing sync pipeline:
  - **Authoring location**: `skills/<skill-id>/` in this repository (e.g. `skills/atmos-canvas-agent/` — exact id in TECH).
  - **User-visible install path**: **`~/.atmos/skills/.system/<skill-id>/SKILL.md`** after sync (same mechanism as `project-wiki`, `git-commit`: `ALL_SYSTEM_SKILL_NAMES` + manifest entries in `system_skill_sync.rs` / `skills/system-skills-manifest.json`).
  - **Content**: prerequisites, **`atmos canvas` verb table**, coordinate conventions, destructive-command policy, troubleshooting (bridge disconnected, ambiguous client), **short examples**. Skill is the canonical “how agents learn”; `atmos canvas --help` is the canonical command reference.
  - **Out of scope for M1 requirement**: **Mandatory** user flow via **`npx skills add`** or other marketplace-only install; those may be documented later as **optional** mirrors for non-Atmos environments.
- **M2 — CLI surface**: Implement **`atmos canvas`** with stable subcommands (exact names in TECH; align with `BRAINSTORM.md` tables). **MCP is not** the M1 delivery mechanism for discoverability.
- **M3 — Bridge / control enablement**: User can **enable terminal/CLI control** of Canvas from the product (toggle or session-scoped opt-in). When disabled, **mutating** CLI commands are rejected with a clear error. **`status` is explicitly exempt** because it is a server-side diagnostic that helps users discover whether a bridge exists or routing is ambiguous. `get-state` still requires an enabled bridge and live editor.
- **M4 — Live execution**: All accepted commands execute in the **browser** against the **live** tldraw `Editor` for the default board (APP-014), reusing normal persistence paths; **not** by replacing `document_json` blindly from the CLI without an active editor path.
- **M5 — `status`**: Reports whether a **bridge-eligible** client is connected, and whether routing is **ambiguous** (multi-client), with machine- and human-readable output (for scripts and Skill).
- **M6 — `get-state`**: Returns structured **page, viewport summary, selection, and simplified shape inventory** (types, ids, bounds; **terminal card** shapes include fields needed for Agent reasoning, aligned with APP-014 model).
- **M7 — Create content**: Support creating **sticky/note**, **frame**, **geo** (`--kind` bounded to supported tldraw geo kinds), **arrow** (page-space endpoints), and **draw** (structured stroke / path payload—not live pointer replay).
- **M8 — Text shape**: Ship **either** dedicated `create-text` **or** document that **`create-note` covers plain text diagrams** — exactly one documented story for agents (TECH chooses).
- **M9 — Selection & transform**: **`select`** / **`clear-selection`**, **`move`** shapes by id(s).
- **M10 — Delete safety**: **`delete`** requires explicit confirmation flag or equivalent **documented destructive contract** so agents/scripts cannot silently wipe by default (exact UX in TECH).
- **M11 — Layout helpers**: **`layout-row`**, **`layout-column`**, **`layout-grid`** with **strict bounds** on grid dimensions to prevent abuse (limits in TECH).
- **M12 — `update-shape`**: Bounded **patch** of props for existing shape ids supporting **diagram styling** parity with common agent demos (color, fill, stroke, sizing, geo kind where applicable, note/text body including emoji)—without exposing arbitrary store records.
- **M13 — `viewport`**: Agent can **adjust view** (pan / zoom / center-on-bounds or equivalent)—no keyboard/pointer synthesis.
- **M14 — Correlation**: Every dispatched command has a **request/response correlation** so CLI can emit structured success/failure (types in TECH).
- **M15 — Auth**: **`atmos canvas`** uses **the same CLI authentication model** as existing `atmos` commands toward the API; no new “canvas API key” product surface.
- **M16 — Transport (product-level)**: `atmos canvas` uses **authenticated HTTP (`POST` JSON)** to **`apps/api`**; the handler forwards **`canvas_agent_dispatch`** over the **existing browser WebSocket**, collects **`canvas_agent_dispatch_result`**, and returns the outcome in the **HTTP response**. The **web app** keeps using **`/ws`** for bridge registration and dispatch—**no Canvas-specific WebSocket client in the CLI** for M1. Users still must not rely on an ad hoc "bridge daemon" product beyond this channel.
- **M17 — Sanitization story (product)**: Invalid ids, stale state, or out-of-range args produce **explicit errors** resumable after `get-state`—documented as **agent-recoverable failures** (pattern inspired by upstream `sanitizeAction` guidance).
- **M18 — Permission tier**: Distinguish **diagnostic** (`status`), **read from live editor** (`get-state`), and **mutate** (create/update/layout/viewport/delete) for UI copy and Skill. **`status` may run without bridge enabled**; `get-state` and all mutating commands require bridge + user opt-in (M3).
- **M19 — Terminal-agent Skill discoverability**: System sync alone is insufficient; ship **explicit affordances** so users do not need to memorize paths:
  - **Canvas UI (Must)**: Entry in Canvas chrome (toolbar, overflow menu, or share panel consistent with APP-014) for **terminal / CLI agents**, e.g. “Copy agent instructions” / “Use with terminal agent”. **Clipboard content (Must)**: only (**1**) a **brief prompt** telling the agent to read the Atmos Canvas skill for `atmos canvas` usage and (**2**) the **skill install directory** path—prefer **resolved absolute directory** (expand `~`/`$HOME` via API when possible). **Do not** paste the full Skill body; **do not** require spelling out `SKILL.md` in product copy if the prompt says to read the skill in that directory (agents discover `SKILL.md` as standard). Fallback: template directory path with `$HOME` / `~` note if expansion is unavailable—exact template in TECH.
  - **Skill authoring (Must)**: **`SKILL.md`** remains the canonical document under `~/.atmos/skills/.system/<skill-id>/SKILL.md`; open with a line giving the **directory** and stating that **all CLI verbs and workflows** live in this file. **Exact clipboard prompt string** in TECH (keep short).
  - **CLI helper (Must)**: A discoverable command (e.g. **`atmos canvas skill-dir`** or **`skill-path`** as alias) prints the same **directory** + **one-line prompt hint** as the Canvas copy action, for terminals without the UI.
  - **Out of scope for M1**: Automatically registering the Skill inside every agent product (Codex/Roo/etc.) — no universal injection; optional future hooks documented separately.
- **M20 — Agent presence & Follow Agent**: Accepted agent commands create/update a **virtual Agent presence** in the receiving Canvas tab using tldraw presence semantics:
  - **Visible actor (Must)**: Canvas shows a named, colored **Agent** actor/activity affordance for recent terminal-agent commands (e.g. “Codex Agent” / “Terminal Agent”), distinct from the human user.
  - **Follow Agent (Must)**: Users can follow or jump to the Agent using tldraw-style presence (`editor.startFollowingUser(agentUserId)` / `zoomToUser` equivalent). Following tracks the Agent’s latest command area/page and stops with normal tldraw follow behavior when the user manually interacts.
  - **Implementation boundary (Must)**: Agent identity is modeled as **presence**, not as `@tldraw/driver`; driver may still help execute editor operations but must not be treated as the collaboration layer.
  - **M1 scope**: Presence is guaranteed in the **target browser tab** that receives the command. If the same local user has multiple Canvas tabs, only the routed target tab shows/follows that Agent presence; other tabs are intentionally not synchronized.

### Nice to Have

- **N1 — Multi-shape layout parity**: **`align`**, **`distribute`**, **`stack`** (or bundled equivalents matching [starter kit wording](https://tldraw.dev/starter-kits/agent)).
- **N2 — `apply`**: Single **JSON batch** entrypoint (stdin/file) validating a **typed action list** (starter-kit-style `_type` discipline) for large diagrams generated by scripts.
- **N3 — `add-terminal`**: Add or reference **`canvas-terminal`** shapes with `TerminalPaneAgent` / scope fields; unresolved pin-flow forks from `BRAINSTORM.md` closed in TECH.
- **N4 — Desktop shortcut**: Native **Tauri IPC** shortcut for local CLI when measurable latency win; **feature parity** with web relay not required for M1.
- **N5 — Optional MCP**: Thin MCP tool mapping to the **same** verb semantics—**post-M1**, not prerequisite for Skill/CLI agents.
- **N6 — Marketplace mirror (optional)**: Publish or list a **skills.sh**-compatible package so users who prefer `npx skills add` can install in addition to the system sync path — **not** a substitute for M1 system delivery.

### Out of Scope (M1)

- **ACP / `/ws/agent`** as the primary path for this feature.
- **MCP as the primary** agent discoverability mechanism.
- **`@tldraw/driver`** (or equivalent) exported **conceptually** to agents or as one shell subcommand per driver primitive.
- **Raw arbitrary tldraw store / snapshot patches** as the agent-facing primary protocol.
- **Headless** canvas editing **with UI fully closed** (no eligible browser client)—batch repair may be a **future** track only if TECH adds a guarded server path later.
- **Live pointer/tool replay**, **global hotkeys**, **unrestricted clipboard automation** as agent-facing primitives.
- **Multi-user / cross-browser Agent presence sync**. APP-015 is for a local personal developer workflow, not multiplayer collaboration; M1 only needs enough presence to make the terminal Agent visible/followable in the targeted Canvas tab.

## Success Metrics

- **Leading**: Documented **`atmos canvas`** commands cover the **diagram scenarios** validated by internal dogfooding (“intro board”, labeled grid of notes, simple architecture sketch).
- **Leading**: “Copy agent instructions” (or equivalent) **used** during internal dogfood when pairing Canvas + terminal agents (qualitative expectation for M1).
- **Leading**: Dogfood users can locate Agent-authored changes by using **Follow Agent** / Agent activity UI rather than manually panning around the board.
- **Leading**: Failure clarity: ambiguous client / disconnected bridge incidents have **stderr + docs** remediation (reduce “silent failure” reports).
- **Lagging**: Users report Canvas useful for **agent-assisted diagrams** alongside terminal-centric work—not blocked by duplicated API-key setup.

## Risks & Open Questions

- **Risk**: **Transport or routing flake** destroys trust—“agent said it drew nothing.” Mitigation: M5–M6, clear errors, debug logging (see TECH / `agents/references/debug-logging.md`).
- **Risk**: **Agents never read the Skill** because users don’t know the path. Mitigation: **M19** (Canvas copy + CLI `skill-dir` / equivalent + short prompt pointing at the directory).
- **Risk**: **Autosave / command interleaving** causes odd undo or corrupted saves. Mitigation: TECH specifies client-side sequencing or mutex policy.
- **Risk**: **`update-shape` prop surface** drifts across tldraw versions. Mitigation: version-gated supported patch keys in TECH; Skill lists stable subsets.
- **Risk**: **Agent presence becomes stale** and users follow an old location. Mitigation: TECH defines TTL/cleanup and updates presence from `changed_shape_ids` / `changed_bounds` on each command.
- **Resolved (TECH)**: M1 uses authenticated **HTTP POST** for CLI ingress, browser `/ws` for relay dispatch, and refuses ambiguous multi-tab routing unless **`--client-id`** is supplied.
- **Remaining implementation detail**: Final Rust/TypeScript DTO names and `create-draw` payload field names should follow TECH §10; product semantics are no longer open.
- **Closed (product)**: **`add-terminal`** is **Nice to Have** for M1; diagram + layout parity is **Must**.

## Dependencies

- **APP-014 Canvas** — default board persistence, overlay, terminal card shape.
- **`apps/cli`** — `atmos canvas` subtree (including M19 `skill-dir` or equivalent).
- **Bundled Skill** — `skills/<skill-id>/` + system sync to `~/.atmos/skills/.system/` (M1).
- **`apps/web` Canvas overlay** — M19 clipboard affordance in Canvas chrome / `CanvasView` (or SharePanel); may resolve home-expanded **skill directory** via API if needed.

## Milestones

- **M1**: Skill + CLI + bridge UX + **M19 discoverability** + relay + command bus verbs through **M20** + **Nice** items deferred except as time allows (N1–N3 prioritized by implementation cost).
- **M2**: N1–N6, hardened multi-tab and desktop shortcuts, optional MCP layer.
