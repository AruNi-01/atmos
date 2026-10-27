# TEST · APP-084: Agent Bridge

> Test Plan · how we verify the agent directory/bus. References PRD APP-084 and TECH APP-084.

## Test strategy

Protocol lives in a pure crate — unit tests there are the source of truth for addressing, busy plan, mailbox, and pull-vs-push bags. Orchestration (catalog, inject, cross-machine, drain) is Rust service-level. CLI is clap + invoke wiring tests without embedding business rules. Slash is bun structural tests (no Playwright panel — there is no Bridge UI). No agent-browser requirement for a panel that does not exist.

## Coverage map

| PRD item | Scenario IDs |
| -------- | ------------ |
| M1       | S1, S2       |
| M2       | S3, S4, S5   |
| M3       | S6, S7, S8   |
| M4       | S9           |
| M5       | S10, S11     |
| M6       | S12          |
| M7       | S13, S14     |
| M8       | S15          |
| M9       | S16          |
| M10      | S17, S18     |

## Execution map

| Scenario | Level               | Expected tool                                 | Target command / method       | Fixture / data               | Signals                                                                                                                                  | Status |
| -------- | ------------------- | --------------------------------------------- | ----------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S1       | Rust unit           | `cargo test -p agent-bridge`                  | catalog merge / address match | synthetic entries            | `provider_id` not `claude_code`; client `local` wildcard; identity `local` is not a foreign wildcard                                     | passed |
| S2       | Service             | `cargo test -p core-service`                  | `AgentBridgeService::list`    | MockHost chat catalog        | chat rows only (no install kinds); real title; provider/workspace filter; limit/cursor page; occupancy on page only; list does not drain | passed |
| S3       | Service             | `cargo test -p core-service`                  | send idle inject              | MockHost one idle chat       | ack `delivered`; inject called                                                                                                           | passed |
| S4       | Service             | `cargo test -p core-service`                  | send no live chat             | catalog provider, zero chats | ack `offline`; mailbox depth 1                                                                                                           | passed |
| S5       | Service             | `cargo test -p core-service`                  | send two chats same provider  | two index rows               | `AMBIGUOUS_TARGET`                                                                                                                       | passed |
| S6       | Rust unit           | `cargo test -p agent-bridge`                  | `plan_delivery` queue default | busy occupancy               | `Queue`                                                                                                                                  | passed |
| S7       | Rust unit + service | `cargo test -p agent-bridge` / `core-service` | fail_fast busy                | BusyPolicy::FailFast         | crate `FailFast`; service ack `rejected` + `BUSY`                                                                                        | passed |
| S8       | Service             | `cargo test -p core-service`                  | wait ttl 0 busy               | busy host + ttl_ms 0         | ack `timeout`                                                                                                                            | passed |
| S9       | Service             | `cargo test -p core-service`                  | status drains, list does not  | queued then idle             | status injects; list leaves queue                                                                                                        | passed |
| S10      | Rust unit           | `cargo test -p agent-bridge`                  | ContextStore get              | local bag                    | Some(bag)                                                                                                                                | passed |
| S11      | Rust unit + service | `cargo test -p agent-bridge` / `core-service` | two BridgeState; remote ref   | bag on A, lookup on B        | None locally; `CONTEXT_REF_REMOTE`                                                                                                       | passed |
| S12      | Rust unit + service | `cargo test -p agent-bridge` / `core-service` | explicit target list          | two tos                      | two plans / two delivered acks; no implicit mesh                                                                                         | passed |
| S13      | Rust unit           | `cargo test -p atmos`                         | clap parse                    | argv                         | subcommands kebab; no crate dep                                                                                                          | passed |
| S14      | Rust unit           | `cargo test -p atmos`                         | skill-dir local               | home mock if any             | path under `.system/atmos-agent-bridge`                                                                                                  | passed |
| S15      | Rust unit           | `cargo test -p infra`                         | skill names                   | constants                    | name in `ALL_SYSTEM_SKILL_NAMES` + `repo_skill_root`                                                                                     | passed |
| S16      | Bun                 | `bun test` slash files                        | structural                    | source + i18n                | id `agent-bridge`; skill insert; en+zh                                                                                                   | passed |
| S17      | Service             | `cargo test -p core-service`                  | foreign server_id             | to.server_id other           | `CROSS_MACHINE_CONNECT`; mailbox empty                                                                                                   | passed |
| S18      | Rust unit           | `cargo test -p agent-bridge`                  | isolated states               | two BridgeState              | A's mail not in B                                                                                                                        | passed |

## Scenarios

### S1 — Address + catalog ids

- **Level**: Unit (`agent-bridge`)
- **Given**: addresses `"local"` vs a real `server_id`; a terminal install id `claude_code`.
- **When**: `server_ids_match` / catalog helpers run.
- **Then**: client-filled `"local"` / empty matches this Computer's id; Server identity `"local"` does **not** match an explicit foreign `to.server_id`; catalog `provider_id` uses Chat ids, not `claude_code`.
- **Signals**: assertions on match and field names.

### S2 — List is a paginated Chat session directory

- **Level**: Service
- **Given**: live Chat index rows (and AgentService installs that would previously appear as Native/Registry/Custom/Terminal).
- **When**: `list` with no filter; with `provider_id`/`agent`; with `workspace_id`; with `limit` + `cursor`.
- **Then**: entries are `kind=chat` only, each with `chat_id`, real `title`/`display_name` (never `chat {id}`), occupancy, and activity timestamps; `--provider` and `--workspace` filter; page 2 via `next_cursor` works; occupancy is computed only for the page; no drain.
- **Signals**: `list_returns_connected_computer_chats`, `list_omits_provider_install_directory_rows`, `list_filters_by_provider_and_workspace`, `list_pages_and_occupancy_only_the_page`; clap `list --provider/--limit/--cursor`.

### S3 — Idle send delivers

- **Level**: Service
- **Given**: one live Chat for `provider_id`, idle.
- **When**: `send` with that `chat_id` or unique provider.
- **Then**: ack `delivered`; host inject called once with formatted envelope.
- **Signals**: ack status + inject spy/counter.

### S4 — No live Chat parks offline

- **Level**: Service
- **Given**: known provider, zero live Chats.
- **When**: `send`.
- **Then**: ack `offline`; mailbox has the message.
- **Signals**: mailbox depth; ack.

### S5 — Ambiguous target

- **Level**: Service
- **Given**: two live Chats with the same `provider_id` and no `chat_id` on `to`.
- **When**: `send`.
- **Then**: error `AMBIGUOUS_TARGET`; nothing injected.
- **Signals**: error code.

### S6 — Default busy queues

- **Level**: Unit
- **Given**: occupancy busy; policy default.
- **When**: `plan_delivery`.
- **Then**: `Queue`.
- **Signals**: enum variant.

### S7 — fail_fast busy

- **Level**: Unit
- **Given**: busy + `FailFast`.
- **When**: `plan_delivery`.
- **Then**: `FailFast`.
- **Signals**: enum variant.

### S8 — wait timeout

- **Level**: Service
- **Given**: busy host, `busy=wait`, `ttl_ms=0` (or very small).
- **When**: `send`.
- **Then**: ack `timeout`; not delivered.
- **Signals**: ack status.

### S9 — Status drains, list does not

- **Level**: Service
- **Given**: queued message, then target becomes idle.
- **When**: `list` then `status`.
- **Then**: list leaves the queue; status injects and clears it.
- **Signals**: mailbox depth before/after.

### S10 — Local context bag pull

- **Level**: Unit
- **Given**: bag stored on state A.
- **When**: `get` with that ref.
- **Then**: bag returned. Store has no `push_to` API.
- **Signals**: `get` Some; source has no push-peer function.

### S11 — Remote context_ref is pull, not push

- **Level**: Unit + service
- **Given**: bag on BridgeState A; BridgeState B empty; ref `{A.server_id}/bag:{id}`.
- **When**: B `get` / service `status --context-ref`.
- **Then**: B does not receive a pushed copy; service returns `CONTEXT_REF_REMOTE`.
- **Signals**: isolated stores; error code.

### S12 — Broadcast is an explicit list

- **Level**: Unit
- **Given**: two `to` addresses on the same Computer.
- **When**: plan each.
- **Then**: two independent plans. No topic expansion.
- **Signals**: plan count.

### S13 — CLI kebab parse

- **Level**: Unit (`atmos`)
- **Given**: `agent-bridge list|send|request|reply|status|skill-dir` argv.
- **When**: clap parse.
- **Then**: matching subcommand. `Cargo.toml` has no `agent-bridge` / `core-service` dep.
- **Signals**: parse test + source/dep assertion.

### S14 — skill-dir is local FS

- **Level**: Unit
- **Given**: `atmos agent-bridge skill-dir`.
- **When**: execute (no Server).
- **Then**: path `~/.atmos/skills/.system/atmos-agent-bridge`.
- **Signals**: JSON `skill_dir`.

### S15 — Skill registration

- **Level**: Unit / structural
- **Given**: sync constants and manifest.
- **When**: inspect.
- **Then**: `atmos-agent-bridge` in manifest files, `ALL_SYSTEM_SKILL_NAMES`, and `repo_skill_root`.
- **Signals**: string contains.

### S16 — Slash `/agent-bridge`

- **Level**: Bun
- **Given**: web slash modules and i18n.
- **When**: tests run.
- **Then**: id `agent-bridge`; Welcome / agent composer / terminal overlay insert the system skill; en+zh copy present; popover glyph wired.
- **Signals**: structural contains + JSON keys.

### S17 — Cross-machine write refused without connect

- **Level**: Service
- **Given**: local server_id `aaa`; `to.server_id = bbb`.
- **When**: `send`.
- **Then**: `CROSS_MACHINE_CONNECT`; local mailbox unchanged.
- **Signals**: error code.

### S18 — Two Servers do not share a mailbox

- **Level**: Unit
- **Given**: two `BridgeState`s.
- **When**: enqueue on A.
- **Then**: B's mailbox empty. Models V1 “each Server owns crate + mailbox”.
- **Signals**: depths.

## Performance & load budgets

- `list` is in-process chat-index + paged occupancy; default page 20, max 100. No extra network.
- `wait` polls at 200ms and is bounded by `ttl_ms` (default 30s).

## Regression checklist

- [ ] Do not add MCP server, tools, or copy that tells agents to “use MCP for Bridge”.
- [ ] Do not add a Settings Bridge page or `/bridge` web route.
- [ ] Do not put mailbox logic in `packages/relay` or `crates/agent`.
- [ ] CLI stays invoke-only (except `skill-dir`).
- [ ] Canvas/PT Design bridge CLIs unchanged.
- [ ] English slash/CLI labels are not ALL CAPS.

## Exploratory agent-browser checks

Omitted on purpose: this ship has **no Bridge Web UI**. Slash wiring is covered by bun structural tests. If a reviewer still wants a glance: open Welcome composer, type `/agent`, confirm **Agent Bridge** appears and inserts the skill chip — record as optional, not merge-blocking.

## Acceptance criteria

- [ ] All Must Have PRD items have at least one passing scenario at the declared level.
- [ ] No V2 surfaces (task/claim, topic broadcast, MCP, panel) in the diff.
- [ ] No new unconditional REST endpoints besides existing `/api/cli/invoke`.
- [ ] `cargo test -p agent-bridge` and targeted `core-service` / `atmos` / `infra` tests pass.
- [ ] Slash bun tests pass; oxlint/oxfmt on touched JS/TS.
- [ ] `atmos-specs-test-run` updates Coverage Status with exact commands.

## Manual verification steps

1. `just dev-api` then `atmos agent-bridge list` against the local Server (needs `atmos` on PATH / `just use-local-cli`).
2. Two Agent Chats: from a terminal, `atmos agent-bridge send --to-provider <idle> --body ping` and confirm the idle Chat receives an injected turn.
3. Point CLI at another Computer via existing session (`--api-url` / `client-session.json`) and run `list` — directory is that Computer’s. Sending to a third `server_id` returns `CROSS_MACHINE_CONNECT`.

## Non-coverage

- Real Relay round-trip between two physical machines (session reuse is proven by targeting whatever Server invoke already hits + S17/S18 isolation).
- Mailbox survival across process restart (N1 Future).
- Task/claim, Flows, MCP, Bridge panel (Out of scope).
- Playwright E2E (no dedicated UI journey).

## Coverage Status

Session-directory list run 2026-10-27 on `aarynlu/app-084-agent-bridge-e388` (PR #372, 【不可合】). Only commands executed in this run are listed. Live Server `atmos agent-bridge list` against real chats, two-Computer Relay, and agent-browser remain non-coverage. No merge.

| Check                                                                                          | Result                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cargo test -p agent-bridge --offline`                                                         | 22 passed. New: `chat_entry_uses_real_title_not_chat_id_literal`, `untitled_chat_falls_back_to_provider_id`, `normalize_list_limit_defaults_and_caps`, `page_live_sessions_second_page_uses_cursor`, `list_request_agent_alias_filters_provider`. |
| `cargo test -p core-service --offline agent_bridge`                                            | 22 passed. New: `list_omits_provider_install_directory_rows`, `list_filters_by_provider_and_workspace`, `list_pages_and_occupancy_only_the_page`; `list_returns_connected_computer_chats` asserts no `chat {id}` prefix.                          |
| `cargo test -p atmos --offline agent_bridge`                                                   | 5 passed. Clap: `list --provider/--agent/--workspace/--limit/--cursor`.                                                                                                                                                                           |
| `bun test packages/api-types/src/ws/dto/agent-bridge.test.ts`                                  | 1 passed.                                                                                                                                                                                                                                         |
| `cargo clippy -p agent-bridge -p core-service -p atmos --all-targets --offline -- -D warnings` | clean                                                                                                                                                                                                                                             |
| `cargo run -p atmos --offline --quiet -- agent-bridge list --help`                             | help text: Chat sessions, not provider installs; `--provider` alias `--agent`; default 20 max 100.                                                                                                                                                |
| Live `atmos agent-bridge list` vs a running Server                                             | `not_run` — no seeded Chat index in this agent VM                                                                                                                                                                                                 |
| Agent-browser / mobile Session UI                                                              | `not_run` — out of scope                                                                                                                                                                                                                          |
| S1–S18 blanket pass                                                                            | not claimed; see the commands above                                                                                                                                                                                                               |

Previous rework run 2026-10-26 on `aarynlu/app-084-agent-bridge-e388` after PR review 【不可合】. Only commands executed in that rework are listed. Live two-Computer Relay round-trip and agent-browser remain non-coverage. CLI / infra / api-types / slash bun tests were not re-run (no files in those trees changed).

| Check                                                                                          | Result                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cargo test -p agent-bridge --offline`                                                         | 17 passed. Review-fix names: `local_identity_does_not_wildcard_a_foreign_to`, `remote_ref_stays_remote_when_local_identity_is_local`, `foreign_to_is_rejected_when_local_identity_is_local`, `pop_matching_leaves_later_mail_and_insert_restores_order`, `query_local_matches_stored_real_id_but_not_foreign_identity`.             |
| `cargo test -p core-service --offline agent_bridge`                                            | 19 passed. Review-fix names: `drain_delivers_one_and_leaves_the_rest_queued`, `drain_requeues_all_matching_when_mid_inject_fails`, `inject_rejected_requeues_first_delivery`, `list_emits_permission_request_occupancy`, `occupancy_maps_permission_request_not_running`, `local_identity_treats_explicit_other_server_as_foreign`. |
| `cargo clippy -p atmos --all-targets --offline -- -D warnings`                                 | clean                                                                                                                                                                                                                                                                                                                               |
| `cargo clippy -p agent-bridge -p core-service -p atmos --all-targets --offline -- -D warnings` | clean. `BridgeChatHost` keeps `#[allow(clippy::double_must_use)]` (same pattern as `agent_status/catalog.rs`).                                                                                                                                                                                                                      |
| `bunx oxfmt --check` on this-rework paths                                                      | clean (`address.rs`, `mailbox.rs`, `context.rs`, `delivery.rs`, `agent_bridge.rs`, `TEST.md`, `TECH.md`)                                                                                                                                                                                                                            |
| `cargo test -p atmos` / infra / api / bun slash / api-types                                    | `not_run` this rework                                                                                                                                                                                                                                                                                                               |
| Agent-browser / live two-Chat inject                                                           | `not_run` — no Bridge Web UI                                                                                                                                                                                                                                                                                                        |
| S1–S18 blanket pass                                                                            | not claimed; see the commands above                                                                                                                                                                                                                                                                                                 |
