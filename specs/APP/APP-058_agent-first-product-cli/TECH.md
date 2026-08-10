# TECH · APP-058: Agent-First Product CLI

> Technical Design · HOW. Implements PRD APP-058. Addresses **M1–M22**. Nice-to-haves N1–N6 noted where relevant. **No backward compatibility** with prior CLI JSON or dual human/`--json` product output.

## Scope summary

Build an **agent-first product control plane** for the `atmos` CLI:

1. **Server**: authenticated HTTP server invoke that dispatches to the **same** `WsAction` handlers as `/ws`.
2. **CLI**: unified JSON envelope (cli-design principles), root discovery, typed L1 resource commands, L0 `call` escape hatch.
3. **Agent skill**: system skill **`atmos-cli`** (short `SKILL.md` + `references/`) so agents operate product state without UI.
4. **Constraint**: CLI remains a thin client (`apps/cli/AGENTS.md`); no `core-service` embed.

Does **not** redesign WebSocket protocol for browsers, mobile clients, or terminal PTY frames.

## Architecture overview

```text
┌──────────────────────────────────────────────────────────────┐
│  Agent / script / human                                        │
└────────────────────────────┬─────────────────────────────────┘
                             │ stdout: CliEnvelope JSON
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  apps/cli (atmos)  · clap · envelope · next_actions            │
│  L1: project workspace terminal run settings git …             │
│  L0: call / actions list                                       │
│  Host: runtime computer update desktop-use browser-use         │
└────────────┬───────────────────────────────┬─────────────────┘
             │ Host plane                    │ Product plane
             ▼                               ▼
   runtime-manager / OS              POST /api/cli/invoke
   desktop-use / browser-use                  │
                                              ▼
                                    apps/api  CliRpcHandler
                                              │
                                              ▼
                                    WsMessageService.dispatch
                                    (apps/api/src/api/ws/router/*)
                                              │
                                              ▼
                                    crates/core-service / core-engine
```

**Layers touched**

| Layer | Role |
|-------|------|
| `apps/api` | New `/api/cli/*` routes; shared dispatch into existing WS handlers |
| `apps/cli` | Envelope, commands, RPC client; rewrite output path |
| `packages/api-types` | Optional: document CLI envelope types for TS consumers later |
| `crates/*` | Prefer **no** new business rules; only fix headless assumptions if handlers require a WS subscriber |

**External**: none required beyond existing Atmos Server auth (bearer / local token).

## Design decisions (locked)

| Decision | Choice | Why |
|----------|--------|-----|
| Product transport | **HTTP RPC**, not CLI-as-WS-client | One-shot agent tool calls; no reconnect tax |
| Handler reuse | Map `action` string → existing `WsAction` + `handle_*` | Single logic plane |
| Agent UX | **Typed L1** resource verbs | Wire names are not agent vocabulary |
| Escape hatch | `atmos call` | Full coverage without waiting for clap stubs |
| Envelope assembly | **CLI always wraps** server data into `CliEnvelope` | One place for `command` string + `next_actions` policy; server returns raw result or structured error |
| Framework | Rust + clap | Existing binary, release, native crates |
| Compat | **None** | Drop product dual human output; host plane also envelope-only |
| Dangerous ops | L1 requires `--yes`; RPC may accept deletes (agent passes flag at L1) | Prevent accidents from incomplete agent prompts |

### Why REST/RPC is justified (WebSocket-first exception)

Atmos is WebSocket-first for **interactive multi-client UI**. CLI agents are **short-lived processes** issuing discrete tool calls. A dedicated HTTP RPC:

- Reuses the same handlers (not a second business API).
- Matches existing agent patterns (`/api/canvas/agent/invoke`, `/api/review/*`).
- Avoids per-invocation WS lifecycle in the CLI.

Browser/mobile continue on `/ws` unchanged.

## Module-by-module design

### apps/api — server invoke surface

**Paths** (nest under existing router in `apps/api/src/api/mod.rs`):

```text
POST /api/cli/invoke              # primary
GET  /api/cli/actions          # list wire actions (from same catalog as WsAction)
GET  /api/cli/health           # optional thin health for atmos status
```

**Auth**: same middleware/token rules as other `/api/*` that require bearer when not loopback — reuse patterns from review/canvas/system. Local Desktop typically uses `ATMOS_LOCAL_TOKEN` / client-session / manifest resolution already used by CLI.

#### `POST /api/cli/invoke`

Request body:

```json
{
  "action": "project_create",
  "data": { "name": "foo", "main_file_path": "/path/to/repo" },
  "request_id": "optional-ulid"
}
```

Server behavior:

1. Parse `action` as `WsAction` (same serde rename / wire names as WS — snake_case in `packages/api-types/fixtures/actions.server.json`).
2. Reject unknown action with HTTP 400 + structured error body.
3. Call the **same** internal dispatch path used by WS request handling (`WsMessageService` methods / shared `dispatch(action, data) -> Result<Value>`).
4. On success: HTTP 200 + body:

```json
{
  "success": true,
  "data": { /* handler Value */ },
  "action": "project_create",
  "request_id": "…"
}
```

5. On domain error: HTTP 4xx/5xx or 200 with `success: false` — **pick one and stick to it**. Prefer:

```json
{
  "success": false,
  "error": { "message": "…", "code": "INVALID_PATH" },
  "action": "project_create"
}
```

Map `ServiceError` to stable string codes where possible.

**Headless invariant**: dispatch must not require an active browser WebSocket subscriber. Side-effect notifications to UI clients remain best-effort if a `WsManager` is present; absence of subscribers is not a failure.

**UI-only actions** (e.g. pure canvas bridge registration): either return `error.code = "REQUIRES_UI"` or keep them callable only via existing canvas routes. Document in actions metadata later (N4).

#### `GET /api/cli/actions`

Returns sorted list of wire action names (from `WsAction` enum / fixture). Optional query `?filter=project`. Used by `atmos actions list`.

#### Implementation sketch

```text
apps/api/src/api/cli/
  mod.rs          # routes()
  server_invoke.rs / invoke.rs          # POST invoke
  actions.rs      # GET actions
  health.rs       # optional
```

Refactor if needed: extract `dispatch_ws_action(service, action, data) -> Result<Value>` from `apps/api/src/api/ws/router/mod.rs` so WS handler and server invoke share one function. Avoid copy-paste of the giant match.

### apps/cli — structure

```text
apps/cli/src/
  main.rs                 # clap root; root no-subcommand → discovery
  envelope.rs             # CliEnvelope, NextAction, emit, exit codes
  api_client.rs           # existing HTTP helpers + rpc()
  context.rs              # ~/.atmos/cli-context.json read/write
  next_actions/           # per-resource next_actions builders
    mod.rs
    project.rs
    workspace.rs
    …
  commands/
    mod.rs
    status.rs
    context_cmd.rs
    call.rs               # L0
    actions.rs
    project.rs
    workspace.rs
    group.rs
    terminal.rs
    run_cmd.rs
    settings.rs
    git.rs
    review.rs             # re-envelope existing
    canvas.rs             # re-envelope existing
    runtime.rs
    computer.rs
    desktop_use/
    browser_use.rs
    update.rs
  output.rs               # DELETE product human rendering; optional keep only for --help
```

#### Envelope (`envelope.rs`)

```rust
struct CliEnvelope {
    ok: bool,
    command: String,           // reconstructed argv-ish string
    result: Option<Value>,     // present if ok
    error: Option<CliError>,   // present if !ok
    fix: Option<String>,       // present if !ok (and sometimes ok warnings — avoid)
    next_actions: Vec<NextAction>,
}

struct CliError {
    message: String,
    code: String,
}

struct NextAction {
    command: String,           // template or literal
    description: String,
    params: Option<BTreeMap<String, ParamMeta>>,
}

struct ParamMeta {
    description: Option<String>,
    value: Option<Value>,
    default: Option<Value>,
    #[serde(rename = "enum")]
    enum_values: Option<Vec<String>>,
    required: Option<bool>,
}
```

Rules:

- **Always** print envelope JSON pretty or compact (default pretty for readability; `ATMOS_CLI_COMPACT=1` optional).
- **Never** print non-JSON to stdout on command completion (progress may use stderr only if needed; prefer pure JSON).
- stderr: only for unexpected panics or update hints if kept — prefer fold update hints into `next_actions` or `result.hints`.

#### Global clap

```text
atmos [--api-url] [--api-token] [--timeout-ms]
      [--project] [--workspace]
      <COMMAND>
```

Remove global `--json` flag (**compat break**). JSON is the only result format.

#### Root command

When no subcommand: build discovery payload without requiring server if possible; if server resolvable, merge health from `/api/cli/health` or rpc-free status probe.

```json
{
  "ok": true,
  "command": "atmos",
  "result": {
    "description": "Atmos CLI — agent-first product and host control",
    "version": "…",
    "health": { "server": "up|down|unknown", "api_url": "…" },
    "commands": [
      { "name": "project", "description": "…", "usage": "atmos project <list|create|…>" }
    ]
  },
  "next_actions": [ … ]
}
```

#### L0 — `call` / `actions`

```bash
atmos call project_create --data '{"name":"x","main_file_path":"/repo"}'
atmos call project_create --file ./payload.json
atmos actions list --filter project
```

`call` validates JSON, POSTs rpc, wraps `data` in envelope. `next_actions` for generic call can be thin: `atmos actions list`, `atmos status`.

#### L1 mapping (selected)

| CLI | WsAction (wire) | Notes |
|-----|-----------------|-------|
| `project list` | `project_list` | |
| `project create --name --path` | `project_create` | Map `--path` → `main_file_path` |
| `project update …` | `project_update` | |
| `project delete --id --yes` | `project_delete` | |
| `project validate-path --path` | `project_validate_path` | |
| `workspace list [--project]` | `workspace_list` | |
| `workspace create …` | `workspace_create` | |
| `workspace delete --id --yes` | `workspace_delete` | |
| `group *` | `group_*` | |
| `settings bootstrap` | `settings_bootstrap_get` | |
| `settings get --scope function` | `function_settings_get` | TECH may split subcommands |
| `settings set …` | `function_settings_update` etc. | |
| `terminal create …` | terminal-related create path | Align with actual terminal create API (may be WS terminal channel **or** a service method exposed via action — see Terminal section) |
| `run logs …` | `run_log_resolve_latest` / start | APP-023/055 |
| `git status` | `git_get_status` | |
| `git commit` | `git_commit` | |

Full matrix lives in implementation as a table in `commands/*.rs`; keep wire names 1:1 with `actions.server.json`.

#### Context store

File: `~/.atmos/cli-context.json`

```json
{
  "project_id": "…",
  "workspace_id": "…"
}
```

Resolution order for a flag like workspace: CLI flag → env `ATMOS_WORKSPACE` → context file → error with `fix` to set context.

#### Terminal / Run special cases

Today interactive PTY uses a **separate** WS protocol (`apps/api/src/api/ws/terminal_handler.rs`), not only `WsAction` CRUD.

**P2 approach**:

1. Prefer any **request/response** service methods already exposed via `WsAction` or system routes (`terminal-overview`, candidates, side chat, run logs).
2. For **create terminal**, if create only exists on the terminal WS channel, add a **server-side RPC-friendly API** that calls `TerminalService` create without requiring a client PTY attachment — e.g. new handler `terminal_session_create` as `WsAction` **or** REST under `/api/cli/terminals` that wraps the same service. Prefer adding a `WsAction` so RPC remains uniform.
3. **Do not** require the CLI to open a PTY stream for create/list/close.

Interactive attach (N3) is a later NDJSON/binary stream design; out of P0–P2 must-have.

#### Streaming (N1)

```text
POST /api/cli/invoke/stream   # or GET with SSE
```

Or CLI opens WS only for stream verbs. Prefer **NDJSON over HTTP** with last line = envelope. Not required for P0–P2.

### packages/api-types

Optional follow-up: export `CliEnvelope` TS types for docs/skills. Not blocking.

### crates

Only if headless dispatch needs it:

- Ensure notifications are optional.
- Terminal create via service without UI session — may touch `core-service` `TerminalService` + new thin action.

## Data model

No new DB tables. Context file is client-local only.

### Wire reuse

Existing request DTOs in `apps/api/src/api/ws/message.rs`, e.g.:

```rust
pub struct ProjectCreateRequest {
    pub name: String,
    pub main_file_path: String,
    pub sidebar_order: i32,
    pub border_color: Option<String>,
}
```

CLI clap args map into these JSON shapes for `data`.

## Transport

### CLI → Server (product)

| Verb | Endpoint |
|------|----------|
| RPC | `POST /api/cli/invoke` |
| List actions | `GET /api/cli/actions` |
| Health | `GET /api/cli/health` (optional) |

### Browser (unchanged)

`/ws` + existing frames (`@atmos/api-types`).

### Auth resolution (CLI, existing)

1. `--api-url` / `ATMOS_API_URL`
2. `~/.atmos/client-session.json` (relay mode)
3. `~/.atmos/state/runtime_manifest.json` (local)

Token: `--api-token` → `ATMOS_API_TOKEN` → `ATMOS_LOCAL_TOKEN` → client-session `gateway_token`.

## Security & permissions

- **Auth**: bearer required for non-loopback; loopback may allow local token rules as today.
- **Authorization**: same as WS (local single-tenant server model).
- **Destructive L1**: `--yes` required in CLI before sending delete RPCs.
- **High-risk actions** (`fs_delete_path`, `disk_analyzer_delete`, mass deletes): L1 either omits them or requires `--yes`; document in help. Optional server-side deny list for server invoke in a later hardening PR — not blocking P0 if auth is already local-trust.
- **Logging**: never log full bearer tokens; redact in debug logs.
- **Secrets in settings/quota**: treat like UI paths; avoid printing secrets in `next_actions`.

## Command tree (shipped surface by phase)

### P0

```text
atmos
atmos status
atmos call <action> [--data|--file]
atmos actions list [--filter]
atmos runtime …
atmos computer …
atmos update …
atmos desktop-use …
atmos browser-use …
```

### P1

```text
atmos context get|set|clear
atmos project list|create|update|delete|validate-path|check-can-delete
atmos workspace list|create|update|delete|archive|unarchive|pin|unpin|…
atmos group list|create|update|delete|member …
atmos settings bootstrap|get|set …
```

### P2

```text
atmos terminal list|create|close|rename|candidates …
atmos run start|status|logs|resolve-latest …
```

### P3

```text
atmos git status|branches|log|stage|unstage|commit|push|pull|fetch|…
atmos review …   # re-envelope
atmos canvas …   # re-envelope
```

### P4 (N2)

```text
atmos github …  atmos linear …  atmos agent …  atmos automation …
atmos skills …  atmos quota …  atmos local-model …  atmos disk …
```

## next_actions policy (CLI)

After successful `project create`:

```json
"next_actions": [
  {
    "command": "atmos workspace create --project <project-id> --name <name>",
    "description": "Create a workspace in this project",
    "params": {
      "project-id": { "value": "<guid>", "required": true },
      "name": { "required": true, "description": "Workspace name" }
    }
  },
  {
    "command": "atmos project list",
    "description": "List projects"
  }
]
```

Centralize builders so mapping stays consistent.

## Error codes (stable strings)

| Code | Meaning |
|------|---------|
| `SERVER_UNREACHABLE` | Cannot connect / resolve API URL |
| `UNAUTHORIZED` | 401 |
| `CONFIRMATION_REQUIRED` | Missing `--yes` |
| `INVALID_ARGUMENT` | clap/JSON parse |
| `UNKNOWN_ACTION` | `call` with bad action |
| `ACTION_FAILED` | generic domain failure (prefer more specific when mapped) |
| `REQUIRES_UI` | canvas bridge / UI-only |
| `CONTEXT_REQUIRED` | missing project/workspace context |

`fix` is plain language, e.g. `"Start the server: atmos runtime ensure"`.

## Rollout plan

1. **P0a — Server RPC**: extract shared dispatch; add `/api/cli/invoke` + `/api/cli/actions`; unit tests with in-process router.
2. **P0b — CLI envelope + root + status + call + actions list**; remove product `--json` dual path; convert host commands to envelope.
3. **P1 — context + project + workspace + group + settings** L1 commands + next_actions builders + destructive `--yes`.
4. **P2 — terminal create path** (add `WsAction` if missing) + `terminal` / `run` L1.
5. **P3 — git L1**; re-envelope `review` / `canvas`.
6. **P4 — remaining resources + streaming (N1)**.
7. Update `apps/cli/AGENTS.md`, deprecate `docs/plans/2026-03-06-cli-design.md` with pointer to this spec.
8. **`atmos-cli` system skill** (M22): skeleton at P0; domain references updated each phase (see § Agent skill).

Each phase is independently shippable.

## Agent skill (`atmos-cli`) — M22

Agent delivery is not only the binary: coding agents need a **system skill** that teaches *how to operate Atmos via CLI*. Design follows existing product skills (`atmos-canvas-agent`, `atmos-desktop-use`): short entry + progressive disclosure.

### Goals

| Goal | Design |
|------|--------|
| Agents find the right tool | One skill id **`atmos-cli`** with a sharp `description` (project/workspace/terminal/run/settings/headless Atmos) |
| Context stays small | Fat details live in `references/`; load on demand via decision table |
| Align with product UX | Narrative prefers **L1** resource commands; **`call` is escape hatch** |
| No second API surface | Skill documents shipped CLI only; live catalogs stay `atmos` / `actions list` / `--help` |
| Clear boundaries | Point to canvas / desktop-use / browser-use skills; do not merge them |

### Non-goals for the skill

- Not a dump of all `WsAction` wire names.
- Not a replacement for APP-058 TECH (no server/RPC internals for agents).
- Not the `cli-design` skill (that is for *building* CLIs).
- Not UI automation instructions (that is desktop-use).

### Layout (source of truth)

Prefer one canonical tree under the same packaging path as other system skills (match repo convention used for canvas / desktop-use), e.g.:

```text
…/system-skills/atmos-cli/
├── SKILL.md
└── references/
    ├── envelope.md              # ok / error / next_actions contract
    ├── auth-and-runtime.md      # api-url, token, runtime ensure, computer
    ├── project-workspace.md     # project, workspace, group, context (P1+)
    ├── terminal-run.md          # terminal, run, logs (P2+)
    ├── settings.md              # settings bootstrap/get/set (P1+)
    ├── git.md                   # git core (P3+)
    ├── call-escape-hatch.md     # atmos call / actions list (secondary)
    ├── errors.md                # error.code → recovery
    └── command-index.md         # optional compact verb index (shipped L1 only)
```

**Single source of truth**: skill text lives once in the monorepo packaging path; sync installs to `~/.atmos/skills/.system/atmos-cli/` (same mechanism as other system skills). Do not maintain a divergent long-form copy under `.agents/skills` unless it is a thin pointer to the system skill.

Optional (N5): `atmos skill-dir` or root discovery field exposing the installed path (mirror `atmos canvas skill-dir`).

### `SKILL.md` contents (keep short)

Frontmatter:

```yaml
name: atmos-cli
version: "<semver aligned with skill content, not necessarily CLI package version>"
description: >
  Operate Atmos product state via the `atmos` CLI (projects, workspaces, terminals,
  runs, settings, git, headless control). Use when the agent must create or manage
  Atmos resources without the UI. Do not use for desktop GUI capture/click
  (atmos-desktop-use), in-page browser DOM (atmos-browser-use), or canvas drawing
  (atmos-canvas-agent).
```

Body sections (order):

1. **Prerequisites** — `atmos` on PATH; Server up; auth; fresh shell per tool call.
2. **Envelope (one screen)** — always JSON; branch on `ok`; use `error.fix` and `next_actions`.
3. **Decision tree** — intent → commands → which reference to load (table).
4. **Golden path** — headless loop: `status` → `project create` → `workspace create` → (`terminal create` when shipped) with example commands for the **current** phase only.
5. **Critical rules** — prefer L1; follow `next_actions`; destructive needs `--yes`; set context; do not invent wire action names when L1 exists.
6. **Anti-patterns** — UI-only for CRUD; desktop-use for project create; primary reliance on `call` + full action list; pasting huge action catalogs into context.
7. **Errors (short table)** — common codes + recovery; full list in `references/errors.md`.
8. **References table** — on-demand load rules.
9. **Related skills** — links/names for canvas, desktop-use, browser-use, review if any.

### Decision tree (skill contract)

| User / agent intent | Do | Load reference |
|---------------------|----|----------------|
| Is Server ready? | `atmos status` | `auth-and-runtime.md` |
| Auth / token / runtime | `runtime ensure`, token flags | `auth-and-runtime.md` |
| Project / workspace / group | L1 `project` / `workspace` / `group` | `project-workspace.md` |
| Terminal / run / logs | L1 `terminal` / `run` | `terminal-run.md` |
| Settings | L1 `settings` | `settings.md` |
| Git | L1 `git` | `git.md` |
| No typed command yet | `atmos call` / `actions list` | `call-escape-hatch.md` |
| Canvas diagram | **other skill** | `atmos-canvas-agent` |
| Screenshot / click OS UI | **other skill** | `atmos-desktop-use` |
| Page DOM / CDP | **other skill** | `atmos-browser-use` |

### Progressive disclosure rules

1. Agent loads **`SKILL.md` first** for any product-control task.
2. Open **at most one** domain reference needed for the current step.
3. Prefer **CLI self-description** over skill for flag completeness when unsure: `atmos <resource> --help` or root `atmos` tree (after P0).
4. **`call-escape-hatch.md`** must state: use only when L1 missing; do not start every task with `actions list`.
5. Do **not** embed full `actions.server.json` in the skill.

### Phase sync (skill vs CLI)

| Phase | Skill must document |
|-------|---------------------|
| P0 | Envelope; `status`; `call` + `actions list` as secondary; host plane pointer; decision tree; anti-patterns; related skills |
| P1 | Real `context` / `project` / `workspace` / `group` / `settings` examples in golden path + references |
| P2 | `terminal` / `run` reference + golden path extension |
| P3 | `git`; note re-enveloped review/canvas and link domain skills |
| P4 | Extra domain references only as L1 lands |

If a verb is not shipped, skill must not list it as available (or mark **not shipped** explicitly). Prefer omitting.

### Relationship to other skills

```text
                    ┌─────────────────┐
                    │   atmos-cli     │  product state (this skill)
                    └────────┬────────┘
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
   atmos-canvas-agent  atmos-desktop-use  atmos-browser-use
   (live canvas)       (OS GUI)           (page CDP)
```

Optional later (N6): split a huge reference into its own skill only if it has distinct triggers and agents load it alone often (e.g. github). Default remains `references/` under `atmos-cli`.

### Maintenance

- Same PR that adds/changes an L1 command updates the matching skill reference (or golden path).
- Version bump in skill frontmatter when behavior/docs change meaningfully.
- `apps/cli/AGENTS.md` may link to the skill path for human developers; skill remains agent-facing source of truth for *usage*.

## Risks & tradeoffs

| Risk | Mitigation |
|------|------------|
| Handlers assume WS connection | Shared dispatch tests without `WsManager` subscribers; fix handlers that require it |
| Terminal create not on WsAction | Add service-backed action in P2; do not fake via UI |
| RPC becomes a second API | Forbid new business logic in CLI; forbid parallel REST resource trees |
| Envelope bloat | Truncate lists; keep `next_actions` ≤ ~8 entries |
| Agents use only `call` | Ship L1 early (P1); root tree highlights resource commands; skill narrative marks `call` secondary |
| Skill drifts from CLI | Same-phase skill updates; omit unshipped verbs |
| Skill context bloat | Short SKILL.md + references; no full action catalog |

**Tradeoff**: HTTP RPC vs pure WS — chosen for agent ergonomics; browsers stay WS.

**Rollback**: remove `/api/cli` routes and new clap commands; old specialized behavior can be recovered from git history (no compat layer maintained).

## Dependencies & compatibility

- **Depends on**: running Atmos Server; existing `WsAction` catalog (APP-048).
- **Blocks**: external agent workflows that depend on `atmos-cli` skill text; optional N5 skill-dir.
- **Breaks**: any consumer of previous CLI stdout shapes for review/canvas/runtime human text — intentional.
- **CLI min version**: next published CLI after implementation; Desktop feature gates that pin CLI version (cli-feature-versions) may need bumps when Desktop relies on new verbs.

## Open questions (resolved defaults)

| Question | Default |
|----------|---------|
| Envelope on server too? | **CLI-only** wrap; server keeps `success`/`data` |
| Compact JSON? | Pretty default; env opt-in compact |
| `get` for project by id | `list` + filter or `call project_*` until dedicated get exists |
| Allowlist RPC actions | All authenticated actions in P0; harden later if needed |

## File touch list (implementation checklist)

- `apps/api/src/api/mod.rs` — nest cli routes
- `apps/api/src/api/cli/*` — new
- `apps/api/src/api/ws/router/mod.rs` — extract dispatch
- `apps/cli/src/main.rs` — new command tree, no `--json`
- `apps/cli/src/envelope.rs` — new
- `apps/cli/src/api_client.rs` — `rpc()`
- `apps/cli/src/commands/*` — L1 modules
- `apps/cli/AGENTS.md` — document product plane + link to `atmos-cli` skill
- `…/system-skills/atmos-cli/SKILL.md` + `references/*` — agent skill (M22)
- `docs/plans/2026-03-06-cli-design.md` — supersession note
- Tests: `apps/api` rpc dispatch; `apps/cli` envelope unit tests; skill structure smoke; integration with `just dev-api` optional
