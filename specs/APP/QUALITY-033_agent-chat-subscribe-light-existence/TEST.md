# TEST · QUALITY-033: Agent chat subscribe light existence

> Test Plan · verify `agent_chat_subscribe` no longer folds the transcript for existence, while leftover-part close and QUALITY-018 rollback stay. References TECH QUALITY-033. There is no PRD; M1–M4 are the Musts in TECH.

## Test strategy

This is a server cost bug. Proof is Rust tests on `AgentChatService::ensure_chat` and `WsMessageService::handle_agent_chat_subscribe`. No Bun test, Playwright, or agent-browser: no UI, copy, hydrate-order, or timeout-constant change.

- Unit: `cargo test -p core-service` leftover/`ensure_chat` tests.
- Unit: `cargo test -p api` subscribe handler tests in `apps/api/src/api/ws/router/agent_chat.rs`.
- Lint cap: `package.json` `lint` stays `oxlint --max-warnings=455`.

## Coverage map

| TECH item                                        | Scenario IDs        |
| ------------------------------------------------ | ------------------- |
| M1. Existence is `get_meta`; no `fold_chat_dir`  | S1, S2              |
| M2. Leftover-part close still runs when detached | S3, S4              |
| M3. QUALITY-018 register / rollback / watermark  | S5 (existing tests) |
| M4. Lean opts / timeouts / oxlint cap unchanged  | S6, S7              |

## Execution map

This table is the hand-off from plan to implementation/testing. Keep `Status` as `planned` until Coverage Status after implementation.

| Scenario | Level     | Expected tool                | Target command / method                                  | Fixture / data                                                       | Signals                                                                | Status  |
| -------- | --------- | ---------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------- |
| S1       | Rust unit | `cargo test -p api`          | `subscribe_does_not_fold_transcript_for_existence`       | temp agent-data dir, chat with many jsonl turns, leftover live chunk | `fold_chat_dir_calls` unchanged across subscribe; `{ last_event_seq }` | planned |
| S2       | Rust unit | `cargo test -p core-service` | `ensure_chat_unknown_is_not_found`                       | random UUID, empty store                                             | `Err`; no `live.jsonl` created for that id                             | planned |
| S3       | Rust unit | `cargo test -p core-service` | `ensure_chat_closes_leftover_open_parts_without_folding` | detached chat, open `TextChunk` in `live.jsonl`                      | `PartFinished` in transcript; live truncated; fold count unchanged     | planned |
| S4       | Rust unit | `cargo test -p api`          | `subscribe_closes_leftover_open_parts_without_folding`   | same leftover fixture through the handler                            | same disk signals; fold count unchanged; conn registered               | planned |
| S5       | Rust unit | `cargo test -p api`          | existing QUALITY-018 names                               | temp dir, race pause, missing chat                                   | race + rollback still pass                                             | planned |
| S6       | Rust unit | `cargo test -p api`          | `subscribe_stores_lean_and_full_opts`                    | two conns, lean vs default                                           | `include_tool_detail` map unchanged                                    | planned |
| S7       | Toolchain | shell                        | `package.json` script text                               | repo root                                                            | `oxlint --max-warnings=455`                                            | planned |

## Scenarios

### S1 — Subscribe does not fold for existence

- **Level**: Rust unit
- **Given**: a created chat whose `transcript.jsonl` has many turns (enough that a discarded fold would be the QUALITY-031 leftover cost), and `fold_chat_dir_calls` recorded.
- **When**: `handle_agent_chat_subscribe` runs with `after_sequence: 0`.
- **Then**: the call returns `{ last_event_seq }`. `fold_chat_dir_calls` is the same as before the call.
- **Signals**: fold counter; subscribe `Ok` JSON.

### S2 — Unknown chat is NotFound without creating files

- **Level**: Rust unit
- **Given**: `AgentChatService` and a UUID that was never created.
- **When**: `ensure_chat` runs.
- **Then**: `Err` (NotFound). The chats root has no directory / `live.jsonl` for that id.
- **Signals**: `ServiceError::NotFound`; directory absence.

### S3 — `ensure_chat` closes leftover open parts without folding

- **Level**: Rust unit
- **Given**: a chat with no live runtime, `TurnStarted` + `UserMessage` on transcript, and an open `TextChunk` on `live.jsonl`.
- **When**: `ensure_chat` runs.
- **Then**: transcript contains `PartFinished` for that part with the leftover text. `live.jsonl` is empty. Fold count is unchanged. A second `ensure_chat` does not append another `PartFinished`.
- **Signals**: jsonl events; fold counter.

### S4 — Subscribe leftover close still works

- **Level**: Rust unit
- **Given**: S3's disk fixture, reached through `handle_agent_chat_subscribe`.
- **When**: subscribe runs.
- **Then**: same disk settle as S3, fold count unchanged, `conn_id` is in `agent_chat_subs`.
- **Signals**: jsonl; fold counter; subscription map.

### S5 — QUALITY-018 races and rollback still pass

- **Level**: Rust unit
- **Given**: the existing QUALITY-018 tests.
- **When**: `cargo test -p api` those names.
- **Then**: register-before-replay, missing-chat rollback, repeat-subscribe keeps the earlier conn, empty-key rollback, unsubscribe/disconnect empty-set tests still pass.
- **Signals**: existing test names in `apps/api/src/api/ws/router/agent_chat.rs`.

### S6 — Lean subscribe opts unchanged

- **Level**: Rust unit
- **Given**: QUALITY-031 `subscribe_stores_lean_and_full_opts`.
- **When**: that test runs.
- **Then**: default / `include_tool_detail: false` are still stored per `conn_id`.
- **Signals**: `agent_chat_subs` opts.

### S7 — oxlint cap stays 455

- **Level**: Toolchain
- **Given**: `package.json`.
- **When**: the `lint` script is read.
- **Then**: it is `oxlint --max-warnings=455`.
- **Signals**: script string. No lint-config edit.

## Performance & load budgets

Subscribe must not fold the transcript for existence. Do not raise the mobile 30s WS timeout. Leftover close may still scan jsonl; that is cheaper than `fold_chat_dir` and is not solved by a longer timeout.

## Regression checklist

- [ ] `get()` still folds and still closes leftovers when detached (`lifecycle_load_without_runtime_closes_leftover_open_parts`).
- [ ] Subscribe does not call `get_snapshot` / `fold_chat_dir`.
- [ ] Live-runtime leftover skip: `ensure_chat` must not truncate `live.jsonl` while `runtimes[id].alive` (same branch as `get()`).
- [ ] QUALITY-018 race test still uses a temp agent-data directory.
- [ ] `package.json` lint script is still `--max-warnings=455`.
- [ ] No client timeout constant change.

## Exploratory agent-browser checks

Omitted. No screen, copy, or route change. The bug is a discarded server fold.

## Acceptance criteria

- [ ] S1–S4 pass at the declared level.
- [ ] S5 existing QUALITY-018 tests pass.
- [ ] S6 QUALITY-031 lean opts test passes.
- [ ] S7 oxlint cap is 455.
- [ ] `cargo test -p api` and `cargo test -p core-service ensure_chat` (plus the leftover get test) pass.
- [ ] `cargo clippy -p api --all-targets --all-features -- -D warnings` and `cargo clippy -p core-service --all-targets --all-features -- -D warnings` pass, or scoped clippy on touched packages is recorded.
- [ ] No new REST route. No timeout constant change.

## Manual verification steps

None. Automated server tests cover the fold and leftover paths.

## Non-coverage

- Store-level windowed `agent_chat_get` (QUALITY-031 follow-up if get fold dominates).
- Client 30s timeout value.
- Emitting `PartFinished` as a live `AgentChatEvent` from leftover close (today it is disk-only; out of scope).
- Spawning a live runtime in the API harness to assert leftover skip; S3/S4 cover the detached path that subscribe hits after a crash.

## Coverage Status

> Filled after implementation by `atmos-specs-test-run`. Include exact automated tests, commands, and remaining gaps.
