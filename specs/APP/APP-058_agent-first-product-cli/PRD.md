# PRD · APP-058: Agent-First Product CLI

> Product Requirements · WHAT and WHY. Make every user-operable Atmos product capability available through a standard, agent-first `atmos` CLI — without requiring the UI.

## Context

- **Problem**: Agents and scripts can only touch a thin slice of Atmos (`runtime`, `review`, `canvas`, `desktop-use`, …). Core product actions (project, workspace, terminal, run, settings, git, …) live behind WebSocket UI flows. Agents cannot operate Atmos the way a user can click.
- **Why now**: Coding agents are first-class Atmos users; CLI is already the install/automation entrypoint (`docs/release.md`). Completing the product surface unlocks headless workflows and agent-driven setup without GUI automation.
- **Related specs**: Builds on APP-048/049 (action catalog / clients), APP-016 (computer), APP-023/055 (run/logs), APP-052 (desktop-use). **Supersedes** the obsolete plan in `docs/plans/2026-03-06-cli-design.md` (direct `core-service` embedding). **No backward compatibility** with prior CLI JSON shapes or dual human/`--json` product output — this is a clean contract.

## Goals

1. **Primary** — An agent can complete a full headless product loop: create/list projects and workspaces, create terminals, start/inspect runs, read/update settings, and perform common git/github reads — using only `atmos` against a running Atmos Server.
2. **Primary** — Every product CLI command returns a **single machine-parseable JSON envelope** with contextual **next actions** so agents need not reverse-engineer the surface.
3. **Secondary** — Long-tail / new `WsAction`s are reachable via an escape hatch without blocking on typed subcommands.
4. **Secondary** — Host/local tools (`runtime`, `computer`, `desktop-use`, `browser-use`, `update`) live under the same envelope conventions.
5. **Secondary** — Agents discover and use this surface via a packaged **`atmos-cli` system skill** (progressive disclosure), not by reverse-engineering wire actions.

### Non-goals (see Out of Scope)

- Replacing the Web/Desktop UI.
- Embedding business logic in the CLI binary.
- Making wire `WsAction` snake_case names the primary agent vocabulary.

## Users & Scenarios

- **Primary persona**: Coding agent (tool-using LLM) operating on a machine with Atmos Server available (local Desktop/runtime or remote Computer).
- **Secondary persona**: Power user / CI script automating Atmos setup or ops.

### Key scenarios

1. **Bootstrap project** — Agent validates a git path, creates a Project, creates a Workspace, lists both to confirm.
2. **Start work** — Agent creates a Terminal in a Workspace, starts a Run (or writes a command), follows logs until ready/failure.
3. **Configure** — Agent reads settings bootstrap, updates a function/settings field, re-reads to confirm.
4. **Recover** — Server down or auth missing: CLI returns structured error + fix guidance + next actions (e.g. `atmos runtime ensure`).
5. **Discover** — Agent runs bare `atmos` and gets command tree + health without reading external docs.

## User Stories

- As a **coding agent**, I want standard commands like `atmos project create` and `atmos workspace list`, so that I do not invent WebSocket clients or scrape the UI.
- As a **coding agent**, I want every response to include what I can do next (with IDs pre-filled), so that multi-step flows do not require memorizing the full API.
- As a **coding agent**, I want a safe escape hatch to invoke any remaining server action by name, so that untyped long-tail capabilities are still reachable.
- As a **power user**, I want `atmos --help` and resource help text to describe commands clearly, so that humans can drive the same surface as agents.
- As a **platform owner**, I want one business-logic plane on Atmos Server, so that UI and CLI never diverge on rules.

## Functional Requirements

### Must Have

#### Contract & discovery

- **M1 — JSON envelope (product + host)**: Every `atmos` subcommand that completes as a point-in-time operation prints **exactly one JSON object** to stdout on success or failure (no mixed prose tables as the primary result). Shape:
  - Success: `ok: true`, `command`, `result`, `next_actions[]`
  - Failure: `ok: false`, `command`, `error: { message, code }`, `fix`, `next_actions[]`
  - Exit code `0` iff `ok: true`.
- **M2 — Root discovery**: Invoking `atmos` with no subcommand returns JSON: product description, server health when resolvable, and a **command tree** (name, description, usage) for top-level resources. Agents must not need external docs for top-level discovery.
- **M3 — Contextual next_actions**: Create/list/get style commands include `next_actions` templates with POSIX placeholders (`<id>`, `[--flag <v>]`) and `params` pre-filled from the result when known (e.g. new project id).
- **M4 — Context-safe output**: Large lists/logs are truncated by default with `truncated`, `total`, and `full_output` path (or equivalent pointer) when truncated.
- **M5 — No backward-compat obligation**: Prior CLI output shapes (`--json` dual mode, ad-hoc review/canvas payloads as sole contract) may break. A single new envelope is the contract. Clap `--help` text remains human-readable (not the machine contract).

#### Transport & integrity

- **M6 — Thin client**: CLI does **not** embed `core-service` / DB business rules. Product mutations go through Atmos Server.
- **M7 — Headless product ops**: Project/workspace/group/settings/git list+mutate and terminal **metadata** create/list/close must work with **no open Web UI** (unlike canvas live bridge).
- **M8 — Server RPC plane**: Server exposes an authenticated HTTP RPC entry that executes the **same** product handlers as the corresponding `WsAction` (single logic plane). CLI typed commands and `call` both use this plane.

#### Agent-facing command surface (typed L1)

Commands use **resource nouns + verbs**. Global flags: `--api-url`, `--api-token`, timeout; optional `--project` / `--workspace` and env `ATMOS_PROJECT` / `ATMOS_WORKSPACE`.

- **M9 — status / context**
  - `atmos status` — server reachability, version/identity when available, auth hint.
  - `atmos context get|set|clear` — sticky defaults for project/workspace (file or env-backed as TECH decides).
- **M10 — project**
  - `list`, `create`, `get` (or list+filter), `update`, `delete` (destructive: `--yes`), `validate-path`, `check-can-delete` as available on server.
- **M11 — workspace**
  - `list`, `create`, `update` (name/branch/status/priority/labels as server supports), `delete` (`--yes`), `archive` / `unarchive`, `pin` / `unpin`, setup-related verbs exposed by server (`retry-setup`, etc. as needed for agent loops).
- **M12 — group**
  - `list`, `create`, `update`, `delete` (`--yes`), member set/remove/order as server supports.
- **M13 — terminal**
  - `list` / candidates, `create`, `close`/`delete`, `rename` (or update) for product terminal sessions; **not** full interactive PTY as M1.
- **M14 — run**
  - Start/resolve/status and **logs** for workspace runs (aligned with existing run-log capabilities). Point-in-time logs in envelope; streaming is N1/M optional phase.
- **M15 — settings**
  - `bootstrap` / `get` and `set`/`update` for function settings and other server-exposed settings groups needed for agent configuration.
- **M16 — git (core)**
  - At least: status, branches list, log (bounded), stage/unstage/commit/push/pull/fetch as server exposes — sufficient for agent commit loop.
- **M17 — Escape hatch**
  - `atmos call <action> [--data JSON | --file path]` maps to server action wire name.
  - `atmos actions list [--filter substr]` lists callable actions with short descriptions when available.

#### Host plane under same contract

- **M18**: `runtime`, `computer`, `update`, `desktop-use`, `browser-use` adopt the **same envelope** (M1). Behavior of those tools stays product-correct; only presentation/contract is unified.

#### Existing specialized product CLIs

- **M19**: `review` and `canvas` are re-homed under the same envelope and discovery tree. Canvas **live** ops may still require an opted-in UI bridge; that limitation must be explicit in `result` / `fix` / `error.code` when the bridge is missing.

#### Safety

- **M20 — Destructive confirmation**: L1 delete/archive-destroy style commands require `--yes` (or equivalent explicit flag). Without it: `ok: false`, code like `CONFIRMATION_REQUIRED`, fix text showing the flag.
- **M21 — Auth errors**: Missing/invalid token or unreachable server returns stable `error.code` values and `fix` pointing at `runtime ensure` / token env flags.

#### Agent skill packaging

- **M22 — `atmos-cli` system skill**: Ship a **system skill** named **`atmos-cli`** that teaches coding agents how to operate Atmos via the product CLI (not via UI automation). It is part of this feature’s agent delivery, not optional docs fluff.
  - **Purpose**: default entry for “create project / workspace / terminal / run / settings / operate Atmos headless”.
  - **Shape**: short `SKILL.md` (decision tree + envelope + golden path + anti-patterns) + **on-demand `references/`** for domain detail. Do **not** dump the full `WsAction` catalog into the skill body.
  - **Primary path in skill narrative**: typed L1 resource commands; **`atmos call` is secondary** (escape hatch only).
  - **Boundaries**: does **not** replace existing domain skills — `atmos-canvas-agent`, `atmos-desktop-use`, `atmos-browser-use`, review-related skills stay separate; `atmos-cli` links to them when intent is canvas / local GUI / page DOM.
  - **Distribution**: packaged and synced like other system skills (runtime `system-skills/` → `~/.atmos/skills/.system/atmos-cli/`). Single source of truth for skill text (no divergent copies).
  - **Lifecycle**: skill content tracks shipped CLI phases (P0 skeleton → P1/P2 real commands). Skill must not document unshipped verbs as if they exist.
  - Design details: TECH § Agent skill (`atmos-cli`).

### Nice to Have

- **N1 — NDJSON streaming**: `run logs --follow`, setup progress, automation watch — typed NDJSON lines ending with the standard envelope.
- **N2 — github / linear / automation / skills / agent / quota / local-model / disk** full typed L1 trees (callable via M17 until typed).
- **N3 — Interactive terminal attach** (`atmos terminal attach`) as a dedicated stream mode.
- **N4 — codegen**: generate clap stubs or schema docs from `actions.server.json`.
- **N5 — Optional `atmos skill-dir` (or root discovery field)** pointing at installed `atmos-cli` skill path (pattern: `atmos canvas skill-dir`).
- **N6 — Split domain skills** only if a reference grows large and is triggered independently (e.g. future `atmos-cli-github`); default is references under `atmos-cli`, not premature skill sprawl.

## Out of Scope

- **CLI-embedded business logic / direct SQLite** — Server is the product plane.
- **Primary UX = raw action catalog browsing** — `call` is secondary (including in the skill narrative).
- **One monolithic skill listing all ~260 wire actions** — live discovery is `atmos` / `actions list` / CLI help, not skill paste.
- **Merging canvas / desktop-use / browser-use into `atmos-cli`** — different triggers, deps, and failure modes.
- **Using `cli-design` skill as the Atmos product skill** — `cli-design` is for *authoring* CLIs; `atmos-cli` is for *operating* Atmos.
- **Pixel-perfect UI chrome** (canvas pan animation, drag-reorder polish) as CLI commands.
- **Requiring open Web UI for project/workspace/settings** — must work headless.
- **Mobile app CLI surface** — same `atmos` binary may run on host; mobile app is not the delivery vehicle.
- **Preserving old CLI JSON or human-table product output** — explicitly not required.
- **MCP server for product control** — CLI is the agent interface; MCP not required by this PRD.
- **Rewriting CLI in TypeScript/Effect** — stay on Rust/clap.

## Success Metrics

| Metric | Target |
|--------|--------|
| Headless loop | Agent completes project create → workspace create → terminal create without UI (manual or automated scenario) |
| Envelope | 100% of product L1 commands return valid envelope (`ok` + required fields) |
| Coverage | All M10–M16 verbs map to real server handlers; failures are structured, not panics |
| Discovery | Bare `atmos` lists at least all shipped top-level resources |
| Divergence | No product business rule implemented only in CLI |
| Agent skill | `atmos-cli` system skill present after install/sync; SKILL.md stays short; L1 is primary narrative |

Qualitative: agents stop using desktop-use/screenshots for basic Atmos CRUD; agents load `atmos-cli` for product ops.

## Risks & Open Questions

- **Risk**: Some WS handlers may assume a connected browser (notifications, canvas). Mitigate: headless path must not depend on UI; document special cases (canvas bridge).
- **Risk**: Dangerous RPC if fully open. Mitigate: same auth as API; destructive L1 flags; optional server allowlist for highest-risk actions in TECH.
- **Risk**: Command surface sprawl. Mitigate: phase L1; M17 covers remainder.
- **Open (TECH)**: Exact path `/api/cli/rpc` vs `/api/agent/rpc`; whether envelope is assembled in CLI only or also on server.
- **Open (TECH)**: Where context file lives (`~/.atmos/cli-context.json` vs session).

## Milestones

| Phase | Ships | PRD items |
|-------|-------|-----------|
| **P0 Foundation** | Envelope module; root tree; `status`; server RPC; `call` + `actions list`; migrate host plane to envelope; **`atmos-cli` skill skeleton** (envelope + auth + call as secondary + decision tree) | M1–M8, M9 (status), M17–M18, M21–M22 (skeleton) |
| **P1 Core resources** | `context`, `project`, `workspace`, `group`, `settings`; skill references for those domains + golden path | M9–M12, M15, M20, M22 update |
| **P2 Terminal + Run** | `terminal`, `run` (+ logs point-in-time); skill terminal-run reference | M13–M14, M22 update |
| **P3 Git + re-home review/canvas** | `git` core; envelope for review/canvas; skill git + links to canvas/review skills | M16, M19, M22 update |
| **P4 Expansion** | Typed trees for N2 domains; streaming N1; skill references as needed | N1–N2, M22 update |

P0+P1 is the first **agent-valuable** ship. P2 completes the “click parity” loop for daily agent work. **Skill text ships in the same phases as the commands it documents.**
