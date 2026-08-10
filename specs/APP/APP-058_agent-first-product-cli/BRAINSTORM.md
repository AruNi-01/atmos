# Brainstorm · APP-058: Agent-First Product CLI

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos product capabilities (Project, Workspace, Terminal, Run, Settings, Git, GitHub, Agent, Automation, …) are exercised primarily through the UI over main-app `/ws` (~260 `WsAction`s). The standalone `atmos` CLI today covers only:

- **Host plane**: `runtime`, `computer`, `update`
- **Specialized agent tools**: `review`, `canvas`, `desktop-use`, `browser-use`

Agents cannot complete the same flows a human does in the app (add project, create workspace, create terminal, start run, change settings) without reverse-engineering WebSocket wire names or driving the GUI. That blocks headless / agent-native operation of Atmos.

**Trigger**: product goal to make **every user-operable product capability** available through CLI so Agents can drive Atmos end-to-end.

**Current workarounds**: open UI; hand-craft WS clients; scrape canvas/review HTTP only for those slices.

**Who feels it**: coding agents (Claude, Codex, Cursor, …), power users scripting Atmos, automation authors.

## Goals (draft)

1. **Primary**: Agent can perform full product lifecycle via `atmos` without UI: project → workspace → terminal → run → settings/git/etc.
2. **Secondary**: Single JSON response contract that is self-describing (discoverability + next steps).
3. **Secondary**: No second business-logic plane — CLI stays a thin client of Atmos Server.
4. **Non-goal**: Interactive full-screen TTY product UI; pure chrome (drag-drop layout polish) is not a CLI target.

## Options

### Option A — Embed `core-service` in CLI (old plan 2026-03-06)

CLI links core-service/DB and runs product logic in-process.

**Pros**: No server required; low latency.
**Cons**: Violates current `apps/cli/AGENTS.md`; dual ownership of rules; Desktop/Web/CLI drift; security/token/DB path mess.
**Unknown**: Data dir conflicts with running Desktop Server.
**Decision**: **Reject**.

### Option B — Hand-write REST for every resource

New REST routes mirroring every product mutation/read.

**Pros**: Familiar HTTP; easy `curl`.
**Cons**: ~260 actions → massive dual surface; every WS change needs a REST twin; slow to full coverage.
**Decision**: **Reject as primary strategy**.

### Option C — CLI speaks WebSocket only (same as web client)

CLI opens `/ws`, sends `WsAction` frames.

**Pros**: Reuses existing protocol; no new server surface.
**Cons**: Short-lived agent processes pay connect/handshake cost; reconnect state machine for every tool call; awkward for one-shot scripts; hard for “just run one command”.
**Decision**: **Reject as primary transport** (keep WS only for true long-lived streams: PTY attach, live agent).

### Option D — Server CLI RPC reusing WsAction handlers + typed resource CLI (chosen)

1. **Internal**: `POST /api/cli/rpc` maps `action` + `data` onto the **same** handler dispatch as `/ws` (no business duplication).
2. **External (agent-facing)**: standard resource CLI — `atmos project create`, `atmos workspace list`, … — clap-typed, JSON envelope, HATEOAS `next_actions`.
3. **Escape hatch**: `atmos call <action> --data …` for long-tail / not-yet-typed actions (not the primary agent path).
4. **Temporal ops**: NDJSON stream (`--follow`, `watch`) ending in the same envelope.

**Pros**: Full coverage path (L0) + friendly path (L1); one logic plane; agent-first output; matches canvas/review “HTTP for agents” pattern; headless without open UI.
**Cons**: Need careful auth / dangerous-action policy; some handlers may assume a subscribed UI (must be fixed for headless).
**Decision**: **Accept**.

### Option E — Agent only uses `atmos call` + action list

No typed subcommands; agent lists wire actions and calls them.

**Pros**: Minimal CLI code.
**Cons**: Unfriendly discovery; wire names unstable UX; agents waste tokens on catalogs; contradicts “standard CLI” expectation.
**Decision**: **Reject as primary UX** (keep as L0 only).

## Key forks in the road

| Fork | Choices | Resolution |
|------|---------|------------|
| **F1 Transport for CRUD** | REST-per-resource vs CLI RPC vs WS | **CLI RPC over HTTP** reusing handlers; typed CLI on top |
| **F2 Agent primary UX** | `call` only vs resource verbs | **Resource verbs (L1)**; `call` is escape hatch |
| **F3 Output format** | Dual human/`--json` vs JSON-always | **JSON-always agent-first envelope** for product plane; **no backward compat** with prior ad-hoc CLI JSON shapes |
| **F4 Framework** | Effect/Bun (cli-design skill) vs Rust/clap | **Rust + clap** (existing release, native tools) |
| **F5 Business logic location** | CLI embed vs Server | **Server only** |
| **F6 Interactive PTY in v1** | Full attach vs create/write/logs only | **Create + write + logs first**; interactive attach later / optional |
| **F7 Canvas** | Must work headless | Canvas **live bridge** still needs UI; document as special; product CRUD must not require UI |

## Open questions (settled for PRD/TECH)

- [x] Backward compatibility of existing `review`/`canvas` JSON shapes? → **No** — re-envelope under one contract.
- [x] Should root `atmos` print human help? → **JSON command tree by default**; `--help` remains clap text for humans.
- [x] Dangerous deletes? → Require explicit `--yes` on destructive L1 verbs; RPC may enforce the same.
- [x] Context (current project/workspace)? → `atmos context` + env `ATMOS_PROJECT` / `ATMOS_WORKSPACE` + flags.

## Agent skill packaging (settled direction)

Agents need more than a binary: a **system skill** that teaches product CLI usage.

| Option | Notes | Decision |
|--------|-------|----------|
| Monolithic skill with full action catalog | Burns context; duplicates live CLI discovery | Reject |
| **`atmos-cli` entry + `references/`** | Same pattern as canvas / desktop-use | **Accept** |
| Many domain skills from day one | Sprawl; unclear entry | Reject until a domain is huge + independently triggered |
| Rely only on `cli-design` | Wrong audience (authors vs operators) | Reject |

**Boundaries**: `atmos-cli` = product state; keep `atmos-canvas-agent`, `atmos-desktop-use`, `atmos-browser-use` separate. Skill narrative: L1 first, `call` secondary. Ship skill text in lockstep with CLI phases.

## References

- Skill principles: `.agents/skills/cli-design/SKILL.md` (envelope / HATEOAS — design principles only, not the product skill)
- Existing agent skill shape: system skills `atmos-canvas-agent`, `atmos-desktop-use` (`SKILL.md` + `references/`)
- CLI: `apps/cli/` + `apps/cli/AGENTS.md`
- WS actions: `apps/api/src/api/ws/message.rs`, `packages/api-types/fixtures/actions.server.json` (~260)
- Handlers: `apps/api/src/api/ws/router/*`
- Existing agent HTTP: `/api/canvas/agent/invoke`, `/api/review/*`
- Supersedes outdated: `docs/plans/2026-03-06-cli-design.md` (core-service embedding)
- Related: APP-016 computer, APP-023 run server, APP-048/049 api-types/client, APP-052 desktop-use

## Ready to promote

- Promote to PRD: Option D; L1 resource tree; phases; personas; out-of-scope; no backward compat; **`atmos-cli` skill (M22)**.
- Promote to TECH: CLI RPC design, envelope module, command map to WsAction, streaming, auth, rollout phases, risk for headless handlers; **skill layout, decision tree, phase sync**.
