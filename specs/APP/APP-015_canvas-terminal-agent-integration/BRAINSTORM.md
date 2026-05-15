# Brainstorm · APP-015: Canvas Terminal Agent Integration

> Problem space and exploration. **Explicitly not** the ACP chat path (`/ws/agent`): this spec is about **code agents the user runs inside normal Atmos terminals** (tmux-backed panes), reusing their existing CLI auth — no new provider API keys for Atmos.
>
> Settled product intent graduates to `PRD.md`; settled architecture graduates to `TECH.md`.

## Context

- **Canvas today** (`APP-014`): tldraw-backed full-screen overlay in `apps/web`; board JSON persisted server-side; terminal cards are a custom shape with `tmuxWindowName`, optional `paneAgent`, and attach via existing `/ws/terminal/:sessionId` flow. The live `Editor` instance is browser-owned (`editorRef` in `CanvasView`).
- **Terminal agents today**: panes carry `TerminalPaneAgent` metadata; `TerminalGrid` can spawn panes with a launch command; titles can infer agent binding. This is the same “terminal code agent” UX the user wants to reuse — not a separate agent runtime.
- **tldraw 5.0**: ships `@tldraw/driver` — framework-agnostic imperative control (pointer-like events, transforms, clipboard, queries) intended for scripting and agent workflows. It is a **host-side** API: it should run where a real `Editor` exists, not inside an arbitrary shell process.
- **Constraint from discussion**: integrate so the **terminal Agent** can orchestrate the canvas **without** configuring additional Atmos-side API keys; the LLM / provider credentials stay inside whatever the user already uses in the terminal.

## Resolved decisions (brainstorm → carry into PRD/TECH)

- **Agent discoverability**: use a **bundled Skill** (Cursor/Claude plugin skill or repo-local `SKILL.md` / agent instructions) **plus** the **`atmos canvas` CLI** as the contract surface. Terminal agents learn *when* and *how* to operate Canvas from the Skill; they *execute* via stable CLI verbs and flags (and optional `--json` I/O). **MCP** is explicitly **out of scope for M1** as the primary path (optional later thin-wrapper for MCP-native hosts only).
- **Skill distribution (product)** — canonical path matches other Atmos system skills: source in **`skills/<skill-id>/`**, synced on API startup to **`~/.atmos/skills/.system/<skill-id>/`** via **`system_skill_sync`** + **`skills/system-skills-manifest.json`** (see `crates/infra/src/utils/system_skill_sync.rs`). **`npx skills add` / skills.sh** is **not** required for Atmos users in M1; optional marketplace mirror tracked as PRD **N6**.
- **Skill discoverability (product)** — disk sync ≠ agent context. **PRD M19**: Canvas **must** expose a control (e.g. “Copy agent instructions”) that copies a **short prompt + skill install directory**; CLI **must** expose **`atmos canvas skill-dir`** or equivalent (**`skill-path`** may alias the same output). Agents read **`SKILL.md` inside that directory** on their own; clipboard does **not** embed the full skill. Does **not** require auto-injection into Codex/etc. (**out of scope** for M1).
- **`@tldraw/driver` role**: it is an **implementation detail inside the web layer** (`CanvasView` / adapter), **not** a 1:1 “every driver primitive → shell subcommand” surface. The CLI exposes **intent-level** commands only; mapping to `editor.*` vs `@tldraw/driver` is decided per verb in TECH to avoid brittle, version-leaky APIs.
- **Agent presence / Follow Agent (product)** — tldraw user following is powered by **presence records** (`TLInstancePresence`) plus APIs like `editor.startFollowingUser(userId)`, not by `@tldraw/driver`. **PRD M20 / TECH §9**: accepted agent commands should update a virtual **Agent** presence in the receiving Canvas tab so the human user can follow or jump to the Agent’s latest work area. Cross-tab/multi-user Agent presence sync is **out of scope** because Atmos Canvas is a local personal developer tool, not multiplayer collaboration.

### Why agents don't need (and shouldn't get) driver-exposed CLI

Terminal agents **do not** learn `@tldraw/driver` or tldraw store internals. Their **only** stable, discoverable surface is:

1. **Skill** — *what* Canvas can do in product terms (create note, frame, terminal card, layout, query state), *when* to use it (e.g. Canvas open), example invocations, and “not supported” guidance.
2. **`atmos canvas --help`** (and documented subcommands / optional `--json`) — the **intent-level contract**: a deliberately small vocabulary of verbs and flags.

Inside `CanvasView`, the **Canvas Command Bus** maps each intent to `editor.*` APIs and optionally `@tldraw/driver`. That mapping is **invisible to agents** — same separation as agents using `git merge` without knowing libgit2.

**Why not expose every driver primitive as CLI**

- Larger, more brittle surface; model errors and version coupling rise sharply.
- The Skill stays short; unsupported operations are simply “not a subcommand yet,” not undocumented sharp edges.

**If an agent wants a capability the CLI doesn't list**

- **Product-approved**: add or extend an **intent** subcommand (or document a composition of existing subcommands).
- **Not approved**: explicitly out of scope — agents should **not** be pointed at patches, raw snapshots, or “escape hatches” to driver.

## Goals (draft)

- **Primary**: a user’s **terminal-resident** code agent can perform a **bounded set** of canvas mutations and queries (create notes/frames, arrange, focus selection, spawn or reference terminal cards, etc.) against the **currently open** Canvas session.
- **Secondary**: preserve tldraw/editor semantics (selection, pages, undo coherence, viewport, presence/follow behavior) by executing changes in the **frontend** against the live store, then reusing existing save paths.
- **Non-goals (initial)**:
  - Replacing or duplicating the ACP integration spec (`APP-004`); this is an orthogonal “terminal agent orchestration” lane.
  - Exposing raw tldraw store patch JSON to agents as the primary protocol (too brittle, too version-coupled).
  - Headless canvas editing with no UI open (optional future; not assumed in M1 brainstorm).

## Approach options

### Option A — Skill + **`atmos canvas`** + frontend “Canvas Command Bus” (**chosen**)

**Shape**: ship a **Skill** documenting workflows, prerequisites (e.g. Canvas overlay open), example commands, and failure modes. Implement a small stable **intent command** vocabulary (e.g. `atmos canvas get-state`, `atmos canvas create-note`, …). The CLI authenticates like other `atmos` commands and forwards commands through the transport below. The **`CanvasView`** side validates and applies them using **`@tldraw/driver` only where it beats plain `editor` APIs**, then reuses existing `canvasWsApi` / persistence.

**Pros**

- Terminal agents already “think in shell”; `atmos canvas …` fits muscle memory and scripts.
- Executes in the **trusted UI layer** that already owns `editorRef` and autosave.
- Keeps provider keys out of Atmos; agents keep using their existing environment.
- Aligns with incremental permissioning (see Open questions).

**Cons**

- Requires a **reliable transport** from CLI → browser **tab that holds `Editor`** (see next section — this is the main engineering fork, not “whether to use CLI”).
- Needs clear behavior when **no eligible Canvas client is connected** (fail-fast with actionable error vs optional future queue).

### CLI → running frontend transport (**recommended optimal for Atmos**)

The editor lives **only in the browser**; the CLI cannot call `@tldraw/driver` directly. We need one leg: **CLI → something → `CanvasView` command bus**.

**Preferred approach: authenticated relay via existing `apps/api` (WebSocket-first, single security story)**

Rationale: the repo already centers on WS for interactive control; introducing a **second ad-hoc localhost daemon** duplicates auth, discovery, and firewall story. Instead:

1. **Registration**: when Canvas is open (or when user toggles “allow terminal/CLI control”), the web client sends a **bridge registration** on the **main app WebSocket** (same session the UI already uses), advertising that this connection accepts canvas commands (optional: `client_id`, “last active” heartbeat).
2. **Dispatch (locked in TECH)**: `atmos canvas …` uses **existing CLI auth** to call **`apps/api` over HTTP** (**`POST` JSON**); the server then uses **`WsManager`** to notify the bridge-registered browser tab (`canvas_agent_dispatch` / `canvas_agent_dispatch_result`).
3. **Routing**: the server resolves the target **browser connection** — **default: refuse ambiguous routing** unless **`--client-id`** (optional future: single elected primary tab).
4. **Execution**: the web client receives **`canvas_agent_dispatch`** (`request_id`-correlated), runs the command bus on `editorRef`, returns **`WsRequest` `canvas_agent_dispatch_result`**; the **HTTP handler** completes the **pending waiter** and returns JSON to the CLI.
5. **No bridge client connected**: CLI exits non-zero with e.g. “Open Canvas (or enable control) first” — **fail-fast for M1** (queueing deferred).

Optional **server → CLI** live push (**not M1**) would require **SSE / WS / polling** — HTTP invoke alone is **request–response**.

**Secondary / optimizations (TECH may add later)**

- **Desktop (Tauri)**: optional **native IPC shortcut** CLI → shell when both are local *if* measurable win; same semantic contract as relay path.
- **Dev-only loopback**: only if relay adds painful iteration — must not become the only production path.

**Explicit non-choice for primary**

- Full **offline JSON file drop** or **stdout scraping** from the agent as the main protocol (Skill + CLI stays the contract).
- **Second standalone localhost-only bridge binary** as the *only* path (acceptable only as embedded in `apps/api` / shared crate, not a separate moving part users must install).

### Option B — Parse structured output from the terminal stream

Agents emit fenced JSON or OSC-style control records; the terminal component or a sidecar listener turns them into canvas actions.

**Pros**

- No separate CLI process; potentially fastest prototype.

**Cons**

- Fragile mixing of user-visible stdout and control protocol.
- Harder to debug, easier to spoof accidentally, painful for multi-pane sessions.

**Verdict**: useful for a **spike**, not the long-term contract.

### Option C — Backend patches `document_json` directly

Agent (or helper) calls API to overwrite the stored board without a live editor.

**Pros**

- Works with UI closed (batch / migration stories).

**Cons**

- Bypasses live editor undo/selection/session; high risk of divergence and corruption.
- Makes semantic operations (focus, arrange, page-local edits) awkward.

**Verdict**: optional **secondary** path for batch tools only, not interactive agent control.

## Recommended direction (summary)

1. **Skill + CLI** for agent UX; **MCP optional** later, not M1.
2. **Intent-level commands** in the CLI (`atmos canvas …`), **not** exposing every `@tldraw/driver` primitive and **not** raw store patches as the primary contract.
3. **Transport**: **API-mediated relay** to a **WS-registered** Canvas-capable browser session as the default; map driver/editor internally in `CanvasView`.
4. **Follow Agent**: represent terminal-agent activity with tldraw **presence** (`TLInstancePresence`) inside the target browser tab, so users can use tldraw-style following instead of manually searching for agent-created shapes.
5. Record message names, auth, routing, correlation, autosave, and presence TTL **exactly** in `TECH.md` (including multi-tab policy and autosave interaction).

## Tie-in to existing code (implementation hints, not decisions)

The following are observation anchors for later `TECH.md`; they are **not** final API contracts.

- `apps/web/src/components/canvas/CanvasView.tsx` — `editorRef`, snapshot/save, terminal card creation helpers.
- `apps/web/src/components/canvas/canvas-terminal-shape.ts` — shape props include `paneAgent`, `isNewTerminal`, `tmuxWindowName` for parity with pinned terminals.
- `apps/web/src/components/terminal/types.ts` — `TerminalPaneAgent` model.
- `apps/web/src/components/terminal/TerminalGrid.tsx` — patterns for spawn / `sendText` / pending commands on session ready.
- `apps/web/src/api/ws-api.ts` — `canvasWsApi` for board persistence from the client.

## Reference: tldraw official Agent starter kit

The **[Agent starter kit](https://tldraw.dev/starter-kits/agent)** (`npm create tldraw@latest -- --template agent`) is the right mental model for **how smart an AI “could” manipulate tldraw** — but its **architecture is not the same** as ours.

| Aspect | Official starter kit | Atmos APP-015 (terminal agent + CLI) |
|--------|---------------------|--------------------------------------|
| Where the model runs | In-app chat; **same JS context as `editor`** ([`prompt()`](https://tldraw.dev/starter-kits/agent), streamed actions) | User’s terminal code agent (**no** embedding); calls `atmos canvas …` |
| What the model emits | Structured **`AgentAction` objects** (`_type`, Zod schemas) → **`AgentActionUtil.applyAction`** → `editor.*` ([docs](https://tldraw.dev/starter-kits/agent)) | **Intent CLI** (+ Skill); relay to **`CanvasView` command bus** → same style of `editor` work |
| Coverage | Defaults include **create / update / delete shapes**, pen strokes, **align / distribute / stack / reorder**, viewport moves, todos, screenshots + simplified viewport shapes ([capabilities list](https://tldraw.dev/starter-kits/agent)) | We converge by **matching capability classes**, not by copying npm template |
| Driver | Not the primary contract; starter kit stresses **schema + utils** applying to **`editor`** | Same: **`@tldraw/driver`** is optional inside the bus |

**Takeaway**: the screenshot you shared (titles, stickers, emoji, styled fills, grids) aligns with **rich create + update-shape props + layout helpers** — starter kit achieves that via **many small action schemas**, not `@tldraw/driver` verbatim. Our CLI can expose the **same verbs** either as named subcommands **or** as a documented JSON batch (`apply`) whose payload follows an **internal action registry** designed to mirror starter-kit semantics where possible (TECH decision).

Implementation hint for parity: skim template files mentioned in docs — `AgentActionSchemas.ts`, `client/actions/*`, mode `parts` / `actions` in `AgentModeDefinitions.ts` — when defining Atmos-side validation and sanitization (`sanitizeAction` pattern for stale ids).

## MVP command set (brainstorm only)

Agents need enough surface to **author a simple diagram**, not only metadata cards. Commands stay **intent-level**: each maps inside `CanvasView` to tldraw’s built-in shape types (`geo`, `draw`, `arrow`, `text`, `note`, `frame`, …) and styling props — **not** to `@tldraw/driver` pointer streams or generic store patches.

### Diagnostics & read model

| CLI (illustrative) | Intent |
|--------------------|--------|
| `canvas status` | Bridge connected / eligible client / ambiguity errors. |
| `canvas get-state` | Current page, viewport summary, selection, simplified inventory of shapes (type, id, bounds, terminal-card fields where relevant). |

### Content: notes, frames, text

| CLI (illustrative) | Intent |
|--------------------|--------|
| `canvas create-note` | Sticky/note with text (position optional or viewport-relative). |
| `canvas create-frame` | Bounding frame with optional title/size. |
| `canvas create-text` | Plain text shape (distinct from sticky when product needs minimal body styling). |

*TECH may collapse `create-text` into `create-note` if sticky is the single text primitive in v1.*

### Content: geometric shapes (“图形”)

| CLI (illustrative) | Intent |
|--------------------|--------|
| `canvas create-geo` | `--kind rectangle|ellipse|triangle|diamond|...` (enumeration tracks **supported** default geo kinds in lockstep with tldraw). Size, fill/stroke/size props as optional flags. |

Keeps one command instead of ten sub-subcommands while remaining discoverable via `--help` and Skill tables.

### Content: arrows / connectors

| CLI (illustrative) | Intent |
|--------------------|--------|
| `canvas create-arrow` | Start/end in **page coordinates** (or attach to shape ids later). |

### Content: pen & freehand (“笔 / 手绘”)

| CLI (illustrative) | Intent |
|--------------------|--------|
| `canvas create-draw` | Stroke from a **compact point list or path payload** (e.g. JSON file or stdin) + optional `--color`/`--size`. Equivalent to dropping a finished `draw` shape, **not** live pointer replay. |

**Pen** is modeled as styling on `draw` (or default draw props), not “switch tool and synthesize gestures.”

### Layout (narrow helpers, not generic animation)

| CLI (illustrative) | Intent |
|--------------------|--------|
| `canvas layout-row` | Selected shapes (or `--ids`) in a horizontal row with optional gap. |
| `canvas layout-column` | Vertical stack. |
| `canvas layout-grid` | Rows × cols with optional spacing (strict bounds on counts to avoid abuse). |

Optional later: alignment helpers (`align-left`, `distribute-horizontal`) — only if UX research shows Agent demand.

**Parity with starter-kit capabilities** (consider for M1 or early M2 — matches “介绍 tldraw” style canvases):

| CLI / mechanism (illustrative) | Intent |
|-------------------------------|--------|
| `canvas update-shape` | Patch props for existing ids (`color`, fill, stroke, size, font, emoji/text body, geo kind, bounds) — the missing piece when agents “style” badges like your screenshot’s 2×2 grid. |
| `canvas viewport` | Pan/zoom/`centerOnBounds` analogue so agents **frame their work** without pointer replay (starter kit exposes viewport moves explicitly). |
| `canvas align` / `canvas distribute` / `canvas stack` | Same high-level bundles as starter kit’s multi-shape ops; implement by delegating to tldraw layout helpers inside the bus. |
| `canvas apply --file|-` (**optional**) | Submit a **single JSON payload** carrying one or more **typed actions** (same spirit as streamed `AgentAction`), for batch diagrams from agents that generate JSON scripts; validates against shared schema. Keeps ergonomics closer to upstream template **without** abandoning `_type` sanitization rules. |

### Structural edits (already required)

| CLI (illustrative) | Intent |
|--------------------|--------|
| `canvas select` / `canvas clear-selection` | Selection model for chaining layout/delete. |
| `canvas move` | Move shapes by id(s) to coords or delta. |
| `canvas delete` | Delete by id(s); gated with **`--confirm` or Skill-only destructive flows**. |

### Terminal bridge (product-specific, can trail diagram commands)

| CLI (illustrative) | Intent |
|--------------------|--------|
| `canvas add-terminal` | Add/ref `canvas-terminal` shape — `TerminalPaneAgent` / cwd / scope as in existing pin flow (`APP-014` open questions). |

### Explicit defer (unchanged principle)

- **Live** pointer/tool replay, global hotkeys, unconstrained clipboard automation, and arbitrary **opaque** snapshot patches remain out of scope; **structured** stroke/geo/arrow intents are **in** scope for diagramming.

## Security & permissions (draft)

Even though the agent is local and user-launched, canvas mutation is **high impact** (layout loss, accidental deletes). Brainstorm-level guidance:

- Separate **read** vs **mutate** capability; consider a **session-scoped allowlist** or one-time “Allow terminal control of Canvas for this session?” gate stored only in client memory.
- Log commands in the existing debug-log infrastructure (`agents/references/debug-logging.md`) behind a flag for supportability.
- Never send provider secrets through this channel; commands should be **non-credential-bearing**.

## Open questions (to resolve in PRD/TECH)

1. ~~**Transport**~~ → **Resolved in TECH**: **CLI → HTTP `POST` to `apps/api`**; **browser ↔ API** unchanged on **`/ws`** for **`canvas_agent_dispatch`** / **`canvas_agent_dispatch_result`** / bridge registration.
2. ~~**Multi-client**~~ → **Resolved in TECH/PRD**: refuse ambiguous routing unless `--client-id`; `status` lists candidate ids.
3. ~~**Conflict with autosave**~~ → **Resolved in TECH**: client-side command bus serializes mutations and coalesces/pauses autosave during dispatch.
4. **Desktop vs web parity**: same relay by default; optional Tauri IPC later — does product require feature parity in v1?
5. ~~**`@tldraw/driver` boundaries**~~ → **Resolved in TECH**: `@tldraw/driver` remains optional implementation detail; agents use intent-level CLI verbs only.
6. ~~**Agent discoverability**~~ → **Skill** ships with examples + link to `atmos canvas --help`; optional marketing/docs page.
7. ~~**Follow Agent / presence**~~ → **Resolved in PRD M20 + TECH §9**: M1 creates target-tab virtual Agent presence for tldraw follow APIs; cross-tab / multi-user presence sync is out of scope.
8. **Relation to pin-to-canvas**: when a command “adds terminal”, is it always `isNewTerminal: true` creation, or can it reference an existing `tmuxWindowName` like pin flow?

## Risks

- **Fragile transport** if underspecified — users see flaky “command did nothing”.
- **Snapshot races** if backend save and in-flight editor mutations overlap.
- **Over-broad command surface** inviting accidental data loss — mitigate with narrow MVP + confirmations for destructive ops.

## Next steps

1. Review this brainstorm for product scope → draft `PRD.md` (personas, Must Have / Nice to Have, permission UX, multi-tab policy).
2. Specify **API relay + bridge registration** and CLI I/O → draft `TECH.md` (sequence diagrams, auth, failure modes, autosave mutex, explicit non-goals).
3. Author **Skill** content (workflows + examples) in parallel with first CLI verbs — same release train as M1.
4. Derive acceptance scenarios → `TEST.md`.
