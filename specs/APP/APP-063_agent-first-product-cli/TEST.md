# TEST · APP-063: Agent-First Product CLI

> Test Plan · verify agent-first product CLI envelope, server RPC, L1 resource commands, and `atmos-cli` agent skill packaging. References PRD APP-063 and TECH APP-063.

## Test strategy

- **Unit**: envelope serialization; clap arg → RPC `data` mapping; next_actions builders; context file resolution.
- **Service / API**: `POST /api/cli/invoke` dispatches same handlers as WS for representative actions; unknown action; auth failure; headless (no WS subscriber).
- **CLI integration**: `cargo test -p atmos` + process tests invoking `atmos` binary with mocked or local server where feasible.
- **Skill packaging**: filesystem / bundle checks that `atmos-cli` skill exists with required structure; content smoke (description, decision tree, no full action dump).
- **E2E / Playwright**: not primary — feature is CLI/API. Optional smoke that Desktop still works after shared dispatch extract.
- **Manual**: full headless loop against `just dev-api` / Desktop runtime; agent loads skill and completes golden path when CLI phase allows.
- **agent-browser**: N/A for pure CLI (no new web UI). Skip exploratory browser checks unless a Settings/docs page is added later.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 envelope | S1, S2, S3 |
| M2 root discovery | S4 |
| M3 next_actions | S10, S11 |
| M4 truncation | S5 |
| M5 no dual --json | S6 |
| M6 thin client | S7 (arch/regression) |
| M7 headless | S8, S10 |
| M8 RPC plane | S8, S9 |
| M9 status/context | S12, S13 |
| M10 project | S10, S14 |
| M11 workspace | S11, S15 |
| M12 group | S16 |
| M13 terminal | S17 |
| M14 run | S18 |
| M15 settings | S19 |
| M16 git | S20 |
| M17 call/actions | S9, S21 |
| M18 host envelope | S22 |
| M19 review/canvas envelope | S23 |
| M20 destructive --yes | S14, S15 |
| M21 auth/unreachable | S2, S3 |
| M22 atmos-cli skill | S25, S26, S27 |
| N1 streaming | S24 (deferred) |
| N5 skill-dir | S28 (deferred / optional) |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Unit | `cargo test -p atmos` | envelope success shape | sample Value | keys `ok,command,result,next_actions` | planned |
| S2 | Unit | `cargo test -p atmos` | envelope error + exit | fake unreachable | `ok:false`, `error.code`, `fix` | planned |
| S3 | API | `cargo test -p api` | rpc unauthorized | no token / wrong token | 401 or structured UNAUTHORIZED | planned |
| S4 | CLI | `cargo test -p atmos` or manual | `atmos` no args | none | command tree JSON | planned |
| S5 | Unit | `cargo test -p atmos` | truncate helper | 500-item list | `truncated:true`, `full_output` or total | planned |
| S6 | CLI | `cargo test -p atmos` | parse CLI | `--json` absent | clap rejects unknown global `--json` or flag gone | planned |
| S7 | Manual/review | code review | Cargo.toml deps | apps/cli | no core-service dep | planned |
| S8 | API | `cargo test -p api` | rpc project_list without WS clients | test AppState | success data array/object | planned |
| S9 | API | `cargo test -p api` | rpc unknown action | `action: no_such` | UNKNOWN_ACTION / 400 | planned |
| S10 | Integration | `cargo test` / manual | project create via CLI or rpc | temp git repo path | project guid in result | planned |
| S11 | Integration | same | workspace create | project from S10 | workspace id; next_actions | planned |
| S12 | CLI | `cargo test -p atmos` | status | mock or real server | health fields | planned |
| S13 | Unit | `cargo test -p atmos` | context resolve order | temp HOME | flag > env > file | planned |
| S14 | CLI/API | integration | project delete without/with `--yes` | fixture project | CONFIRMATION_REQUIRED then deleted | planned |
| S15 | CLI/API | integration | workspace delete | fixture | same as S14 pattern | planned |
| S16 | API | `cargo test -p api` | group_list rpc | empty db | success | planned |
| S17 | Integration | manual/api | terminal create | workspace | session id without UI | planned |
| S18 | Integration | manual/api | run logs resolve | workspace with run | log pointer or lines | planned |
| S19 | API | `cargo test -p api` | settings_bootstrap_get | AppState | bootstrap object | planned |
| S20 | API | `cargo test -p api` | git_get_status | workspace path fixture | status payload | planned |
| S21 | CLI | `cargo test -p atmos` | actions list filter | mock actions endpoint | filtered names | planned |
| S22 | CLI | `cargo test -p atmos` | runtime status envelope | fake status Value | `ok:true` envelope | planned |
| S23 | CLI | unit | review/canvas wrap | sample API data | envelope not raw-only | planned |
| S24 | deferred | — | NDJSON follow | — | — | deferred |
| S25 | Static / unit | path exists check or script | skill root | packaged `atmos-cli` tree | `SKILL.md` + `references/` present | planned |
| S26 | Review / static | grep / checklist | SKILL.md body | skill source | decision tree; L1 primary; call secondary; no full actions dump | planned |
| S27 | Manual / packaging | install or runtime sync | system-skills sync | clean user skill dir | `~/.atmos/skills/.system/atmos-cli/SKILL.md` exists after sync | planned |
| S28 | CLI optional | N5 | `atmos skill-dir` or discovery | skill installed | path points at skill | deferred |

## Scenarios

### S1 — Success envelope shape

- **Level**: Unit
- **Given**: a successful command result Value and command string.
- **When**: `emit_success` builds the envelope.
- **Then**: JSON has `ok: true`, `command`, `result`, `next_actions` (array, maybe empty).
- **Signals**: serde round-trip; schema keys present.

### S2 — Unreachable server

- **Level**: Unit / CLI
- **Given**: invalid `--api-url` or no server.
- **When**: `atmos status` or `atmos project list`.
- **Then**: stdout is failure envelope with `error.code = SERVER_UNREACHABLE` (or equivalent), non-empty `fix`, exit ≠ 0.
- **Signals**: parse stdout as JSON; exit code.

### S3 — Unauthorized RPC

- **Level**: API
- **Given**: server requiring token; request without valid bearer.
- **When**: `POST /api/cli/invoke` with `project_list`.
- **Then**: rejected; CLI maps to `UNAUTHORIZED` + fix mentioning token flags.
- **Signals**: status code / envelope code.

### S4 — Root discovery

- **Level**: CLI
- **Given**: built `atmos` binary.
- **When**: run `atmos` with no subcommand.
- **Then**: `ok: true`, `result.commands` includes at least `project` (once P1 shipped) or `call`/`status` (P0), each with description/usage.
- **Signals**: JSON parse; commands length ≥ 1.

### S5 — Truncation

- **Level**: Unit
- **Given**: list longer than default limit.
- **When**: render list result through truncation helper.
- **Then**: `truncated: true`, `total` set, items length ≤ limit, pointer field present when designed.
- **Signals**: unit asserts.

### S6 — No global `--json`

- **Level**: CLI
- **Given**: P0+ CLI.
- **When**: `atmos --json status` (or similar).
- **Then**: unknown argument error **or** flag does not exist; product path never switches human vs json modes.
- **Signals**: clap error or envelope-only stdout.

### S7 — Thin client regression

- **Level**: Review / static
- **Given**: `apps/cli/Cargo.toml`.
- **When**: inspect dependencies.
- **Then**: no `core-service` / `infra` product DB deps; product path uses HTTP client.
- **Signals**: cargo metadata / grep.

### S8 — Headless RPC dispatch

- **Level**: API integration
- **Given**: AppState with services; **zero** connected WS UI clients.
- **When**: `POST /api/cli/invoke` `{ "action": "project_list", "data": {} }`.
- **Then**: `success: true` and data matches what WS would return for same action.
- **Signals**: HTTP 200; body shape.

### S9 — Unknown action

- **Level**: API
- **Given**: running server invoke.
- **When**: action `definitely_not_an_action`.
- **Then**: structured failure, not 500 panic.
- **Signals**: error code UNKNOWN_ACTION.

### S10 — Project create (happy path)

- **Level**: Integration
- **Given**: valid git repo path on disk; server up; auth ok.
- **When**: `atmos project create --name t --path <repo>` (or rpc equivalent).
- **Then**: `ok: true`, result includes project id/guid; `next_actions` mentions workspace create with pre-filled project id.
- **Signals**: JSON fields; optional DB/list follow-up.

### S11 — Workspace create (happy path)

- **Level**: Integration
- **Given**: project from S10.
- **When**: `atmos workspace create --project <id> --name w`.
- **Then**: workspace id returned; list shows it under project.
- **Signals**: envelope result; `workspace list`.

### S12 — Status

- **Level**: CLI
- **Given**: server up or down cases.
- **When**: `atmos status`.
- **Then**: envelope with health; down case is `ok: false` or `ok: true` with degraded health — pick one in impl and assert consistently (prefer `ok: true` with `health.server=down` **or** fail; document). TECH default: reachable probe failure → `ok: false` SERVER_UNREACHABLE.
- **Signals**: codes.

### S13 — Context resolution

- **Level**: Unit
- **Given**: context file, env, and flag values differ.
- **When**: resolve workspace id.
- **Then**: flag wins over env over file.
- **Signals**: unit table tests.

### S14 — Destructive confirmation (project delete)

- **Level**: CLI
- **Given**: existing project.
- **When**: `atmos project delete --id X` without `--yes`.
- **Then**: `ok: false`, `CONFIRMATION_REQUIRED`, project still exists.
- **When**: same with `--yes`.
- **Then**: deleted; list no longer contains X.
- **Signals**: two-step assert.

### S15 — Workspace delete confirmation

- **Level**: CLI
- **Given**: workspace.
- **When**: delete without/with `--yes`.
- **Then**: same pattern as S14.

### S16 — Group list via RPC

- **Level**: API
- **Given**: empty or seeded groups.
- **When**: rpc `group_list`.
- **Then**: success payload.
- **Signals**: HTTP success.

### S17 — Terminal create without UI

- **Level**: Integration (P2)
- **Given**: workspace; terminal create API available.
- **When**: `atmos terminal create --workspace <id>`.
- **Then**: terminal/session identifier returned; no browser required.
- **Signals**: envelope result id.

### S18 — Run logs point-in-time

- **Level**: Integration (P2)
- **Given**: workspace with run log capability.
- **When**: `atmos run logs` / resolve-latest.
- **Then**: bounded log payload or structured empty state; not unbounded dump.
- **Signals**: truncation fields if large.

### S19 — Settings bootstrap

- **Level**: API
- **Given**: AppState.
- **When**: rpc `settings_bootstrap_get`.
- **Then**: success object.
- **Signals**: keys non-empty or valid empty schema.

### S20 — Git status

- **Level**: API
- **Given**: workspace with git path.
- **When**: rpc `git_get_status` with required data.
- **Then**: status structure without panic.
- **Signals**: success body.

### S21 — actions list filter

- **Level**: CLI / API
- **Given**: actions endpoint.
- **When**: `atmos actions list --filter project`.
- **Then**: all returned names contain `project` (case rules documented).
- **Signals**: list length ≥ 1 including `project_list`.

### S22 — Host plane envelope

- **Level**: CLI unit
- **Given**: runtime status Value.
- **When**: render via envelope path.
- **Then**: stdout is CliEnvelope, not legacy human multi-line only.
- **Signals**: `ok` field present.

### S23 — Review/canvas re-envelope

- **Level**: Unit (P3)
- **Given**: mock HTTP responses for review/canvas.
- **When**: execute CLI subcommand.
- **Then**: outer envelope wraps payload; failure uses `error`/`fix`.
- **Signals**: parse ok.

### S24 — NDJSON follow (N1 deferred)

- **Level**: deferred
- **Then**: each line JSON; terminal line is envelope.

### S25 — Skill tree present (M22)

- **Level**: Static / packaging test
- **Given**: monorepo source (or built runtime bundle) for system skills.
- **When**: inspect `atmos-cli` skill directory.
- **Then**: `SKILL.md` exists; `references/` exists with at least envelope + auth-and-runtime + call-escape-hatch (P0); additional refs appear when phases ship.
- **Signals**: path checks in CI or documented checklist.

### S26 — Skill design constraints (M22)

- **Level**: Review / static checklist
- **Given**: `atmos-cli` `SKILL.md`.
- **When**: reviewed against TECH skill section.
- **Then**:
  - Frontmatter `name: atmos-cli` and description covers product ops + excludes desktop-use/canvas/browser primary use.
  - Decision tree table present.
  - Narrative prefers L1; `call` marked secondary / escape hatch.
  - Does **not** embed full ~260 action catalog.
  - Links or names related skills (canvas, desktop-use, browser-use).
  - Does not document unshipped L1 verbs as available (phase-accurate).
- **Signals**: checklist on PR; optional script forbidding huge action-list dumps.

### S27 — System skill install path (M22)

- **Level**: Manual / packaging integration
- **Given**: Desktop runtime or skill sync used for other system skills.
- **When**: install/sync runs.
- **Then**: skill available under `~/.atmos/skills/.system/atmos-cli/` (or equivalent documented path).
- **Signals**: file exists after sync.

### S28 — skill-dir (N5 deferred)

- **Level**: CLI (optional)
- **When**: `atmos skill-dir` or root discovery field.
- **Then**: path resolves to installed skill.

## Performance & load budgets

- Point-in-time RPC (project list) p95 &lt; 2s on local loopback under normal DB size.
- CLI process startup should stay suitable for agent tool calls (no multi-second hard dependency beyond server RTT). Soft goal: cold CLI help/discovery &lt; 500ms local.

## Regression checklist

- [ ] Shared dispatch extract does not break `/ws` project_list / workspace_list for web.
- [ ] CLI never prints secrets (tokens) in envelope or next_actions.
- [ ] `desktop-use` / `browser-use` still function after envelope migration.
- [ ] Canvas `REQUIRES_UI` when bridge missing — not a silent hang.
- [ ] Delete without `--yes` never mutates.
- [ ] No `core-service` dependency reintroduced in CLI.
- [ ] Skill PR ships with matching CLI phase (no “phantom” commands in golden path).
- [ ] Skill does not reintroduce full wire-action dump as primary docs.

## Exploratory agent-browser checks

Not applicable for CLI-only delivery. If docs site pages are added for this feature later, add browser checks then.

## Acceptance criteria

- [ ] All Must Have items for the **shipped phase** have passing scenarios (P0: S1–S9, S12, S21–S22, **S25–S26** at minimum).
- [ ] P1 ship: S10–S16, S19 + M20 scenarios green; skill project-workspace/settings references updated.
- [ ] P2 ship: S17–S18 green; skill terminal-run reference updated.
- [ ] Envelope schema stable enough for agents (documented in TECH).
- [ ] No product business logic only in CLI.
- [ ] `atmos-cli` skill structure matches TECH (M22); L1 primary narrative; no full action catalog dump.
- [ ] `cargo test -p atmos` and API cli rpc tests pass.
- [ ] `just lint` / scoped typecheck as required by repo gates on touched packages.
- [ ] Coverage Status filled by `atmos-specs-test-run` after implementation.

## Manual verification steps

1. `just dev-api` or Desktop runtime ensure; export token if needed.
2. `atmos` → inspect command tree JSON.
3. `atmos project validate-path --path <git-repo>` then `create` → `workspace create` → `project list` / `workspace list`.
4. `atmos call project_list --data '{}'` matches typed list result data (modulo envelope).
5. Stop server; `atmos project list` → structured fix to `runtime ensure`.
6. (P2) Create terminal; resolve run logs if runs configured.
7. Open packaged `atmos-cli` `SKILL.md`; confirm decision tree + golden path match installed CLI phase; open one reference only for a domain task.

## Non-coverage

- Full 260-action individually typed L1 commands.
- Interactive PTY attach correctness (N3).
- Multi-tenant cloud auth productization.
- Mobile invoking CLI.
- Load testing thousands of concurrent RPC clients.
- LLM-as-judge that every agent always loads the skill (packaging + structure only).

## Coverage Status

> Filled after implementation by `atmos-specs-test-run`. Include exact automated tests, commands, and remaining gaps.
