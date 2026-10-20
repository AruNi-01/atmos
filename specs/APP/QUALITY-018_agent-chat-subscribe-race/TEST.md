# TEST · QUALITY-018: Agent Chat Subscribe Race

> Test Plan · how we verify `agent_chat_subscribe` cannot drop a live event between replay and registration. References TECH QUALITY-018.

## Test strategy

The bug is a server ordering race. One Rust test on `WsMessageService` pauses after `events_after` and emits a queue event before the handler continues. An already-subscribed observer proves fan-out has taken its subscriber snapshot. The joining connection must already be in that snapshot, must receive the event, and must be told a `last_event_seq` that includes it.

- Unit: `cargo test -p api` tests in `apps/api/src/api/ws/router/agent_chat.rs`.
- No Bun test, Playwright, or agent-browser. No UI, copy, or wire-shape change. EventGate dedupe stays covered by QUALITY-013.
- Lint cap: `package.json` `lint` stays `oxlint --max-warnings=455`.

## Coverage map

| Requirement                                                                | Scenario IDs                                                                           |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| M1. Register before the replay list is consumed                            | S1                                                                                     |
| M1. Event emitted in the old gap is delivered                              | S1                                                                                     |
| M1. `last_event_seq` is sampled after registration and includes that event | S1                                                                                     |
| M1. Server does not drop the overlap                                       | S1 (the test accepts either live delivery or replay; it does not assert a single copy) |
| M2. Failed subscribe does not leave `conn_id` registered                   | S2                                                                                     |
| M2. Failed repeat subscribe keeps a conn that was already registered       | S5                                                                                     |
| M2. Rollback removes the chat key when the set becomes empty               | S6                                                                                     |
| Unsubscribe and disconnect leave no empty set in `agent_chat_subs`         | S7, S8                                                                                 |
| Lint cap unchanged                                                         | S3                                                                                     |
| Pre-fix handler still fails S1                                             | S4                                                                                     |

## Execution map

| Scenario | Level          | Expected tool       | Target command / method                                    | Fixture / data                                                   | Signals                                                                          | Status |
| -------- | -------------- | ------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| S1       | Rust unit      | `cargo test -p api` | `subscribe_delivers_event_emitted_in_the_pre_register_gap` | temp agent-data dir, two WS conns, `queue_add` seed then gap     | registered while paused; gap marker on the joining conn; `last_event_seq >= gap` | pass   |
| S2       | Rust unit      | `cargo test -p api` | `subscribe_rolls_back_registration_when_chat_is_missing`   | temp dir, random UUID, no row                                    | `Err`; `agent_chat_subs` does not contain the conn                               | pass   |
| S5       | Rust unit      | `cargo test -p api` | `subscribe_failure_keeps_conn_that_was_already_registered` | temp dir, one successful subscribe, then the chat dir is removed | `Err` on the second subscribe; the same `conn_id` is still in the set            | pass   |
| S6       | Rust unit      | `cargo test -p api` | `subscribe_rollback_removes_empty_chat_key`                | temp dir, random UUID, no row                                    | `Err`; `agent_chat_subs` has no key for that chat                                | pass   |
| S7       | Rust unit      | `cargo test -p api` | `unsubscribe_drops_empty_chat_set`                         | temp dir, two chats, two conns                                   | after unsubscribe, no empty set; last-subscriber key is gone                     | pass   |
| S8       | Rust unit      | `cargo test -p api` | `disconnect_drops_empty_chat_sets`                         | temp dir, two chats, two conns                                   | after `on_disconnect`, no empty set; shared chat keeps the other conn            | pass   |
| S3       | Toolchain      | shell               | `package.json` script text                                 | repo root                                                        | `oxlint --max-warnings=455`                                                      | pass   |
| S4       | Manual reorder | `cargo test -p api` | same test as S1 after restoring the old handler order      | same fixture                                                     | assertion fails with `registered_while_paused=false`                             | pass   |

## Scenarios

### S1 — Event emitted after the replay list is captured still arrives

- **Level**: Rust unit
- **Given**: a chat with one `queue_add` seed, fan-out running, observer connection subscribed, joining connection's channel empty, and `after_sequence` equal to the seed revision so the replay list is empty. The test arms `subscribe_race_pause` for the joining `conn_id`.
- **When**: subscribe runs until the pause (after `events_after`, and after registration in the fixed handler). The test `queue_add`s a gap prompt, waits until the observer receives that prompt (fan-out has snapshotted `agent_chat_subs`), then releases the pause.
- **Then**: while paused, the joining `conn_id` is already in `agent_chat_subs`. The joining channel contains the gap prompt. The response `last_event_seq` is greater than or equal to the meta revision after the gap `queue_add`.
- **Signals**: `registered_while_paused`, gap marker on the joining `mpsc`, `last_event_seq` compared with `get_meta`.

### S2 — Unknown chat rolls the registration back

- **Level**: Rust unit
- **Given**: a service and a UUID that was never created.
- **When**: `handle_agent_chat_subscribe` runs for that id.
- **Then**: the call returns `Err`, and `agent_chat_subs` does not contain the connection.
- **Signals**: `Result::Err` and the subscription map.

### S5 — A failed repeat subscribe keeps the earlier registration

- **Level**: Rust unit
- **Given**: a chat and a connection that already subscribed successfully.
- **When**: the chat directory is removed and the same `conn_id` subscribes again.
- **Then**: the second call returns `Err`, and `agent_chat_subs` still contains that `conn_id` for the chat. `HashSet::insert` returned false, so rollback does not run.
- **Signals**: `Result::Err` and set membership of the original `conn_id`.

### S6 — Rollback drops an empty chat key

- **Level**: Rust unit
- **Given**: a service and a UUID that was never created. No other connection is registered for that id.
- **When**: `handle_agent_chat_subscribe` runs and `get` fails.
- **Then**: the call returns `Err`, and `agent_chat_subs` does not contain a key for that chat. The set is not left empty under the key.
- **Signals**: `Result::Err` and `HashMap::contains_key`.

### S7 — Unsubscribe does not leave an empty set

- **Level**: Rust unit
- **Given**: one chat whose only subscriber is `conn-a`, and a second chat subscribed by both `conn-a` and `conn-b`.
- **When**: `conn-a` unsubscribes from both chats.
- **Then**: `agent_chat_subs` contains no empty set. The first chat key is gone. The second chat still contains only `conn-b`.
- **Signals**: `unsubscribe_drops_empty_chat_set`.

### S8 — Disconnect does not leave an empty set

- **Level**: Rust unit
- **Given**: one chat whose only subscriber is `conn-leaving`, and a second chat subscribed by both `conn-leaving` and `conn-staying`.
- **When**: `on_disconnect("conn-leaving")` runs.
- **Then**: `agent_chat_subs` contains no empty set. The first chat key is gone. The second chat still contains only `conn-staying`.
- **Signals**: `disconnect_drops_empty_chat_sets`.

### S3 — oxlint cap stays 455

- **Level**: Toolchain
- **Given**: `package.json`.
- **When**: the `lint` script is read.
- **Then**: it is `oxlint --max-warnings=455`.
- **Signals**: script string. No lint-config edit.

### S4 — The same test fails on the pre-fix order

- **Level**: Manual reorder (not a second test binary)
- **Given**: S1's test and pause stay in place. `handle_agent_chat_subscribe` is temporarily restored to: `get`, `events_after`, pause, replay send, then `insert`, and `Ok(snapshot.meta.last_event_seq)` from that first `get`.
- **When**: `cargo test -p api subscribe_delivers_event_emitted_in_the_pre_register_gap -- --nocapture`.
- **Then**: the assertion fails. `registered_while_paused` is false, the joining channel does not contain the gap marker, and `last_event_seq` is the seed revision rather than the gap revision.
- **Signals**: the panic message `pre-register gap leaked:`.

Restore the register-first handler after S4. Do not commit the restored old order.

## Performance & load budgets

None. Subscribe does one extra `get_meta` after replay. It does not take the subscriber write lock across that read.

## Regression checklist

- [x] Replay still sends every `events_after` item. The handler does not skip events that fan-out might also send.
- [x] `agent_chat_unsubscribe` and disconnect still remove `conn_id`, and neither leaves an empty set in `agent_chat_subs`.
- [x] `package.json` lint script is still `--max-warnings=455`.
- [x] The race test uses a temp agent-data directory, not `~/.atmos/data/agent/chats`.

## Exploratory agent-browser checks

Omitted. No screen, copy, or route change. The lost event is a server ordering bug; a browser pass cannot force the pause between `events_after` and fan-out.

## Acceptance criteria

- [x] S1 passes on the register-first handler.
- [x] S2 passes.
- [x] S5 passes.
- [x] S6 passes.
- [x] S7 and S8 pass: after unsubscribe and after disconnect, `agent_chat_subs` has no empty set.
- [x] S4 was run once on the old order and failed as specified, and that failure is written up in the PR.
- [x] `cargo test -p api` and `cargo clippy -p api --all-targets --all-features -- -D warnings` pass.
- [x] No new REST route and no EventGate change.
- [x] oxlint max warnings stays 455.

## Manual verification steps

S4 is the only manual step, and it is a code reorder plus `cargo test`, not a UI pass. The PR describes the exact revert and the command.

## Non-coverage

- Broadcast lag recovery inside `spawn_agent_chat_fanout`. The pause test covers the subscribe window, not a full ring overflow.
- Client dedupe of the overlap. QUALITY-013 owns `agentChatEventDuplicateKey`.
- Multi-connection stress beyond the observer plus the joining connection.

## Coverage Status

- S1 — pass. `cargo test -p api subscribe_delivers_event_emitted_in_the_pre_register_gap -- --test-threads=1`.
- S2 — pass. `cargo test -p api subscribe_rolls_back_registration_when_chat_is_missing -- --test-threads=1`. Missing chat returns `Err` (`Processing` / os error 2 from the store, not only `NotFound`); the connection is not left in `agent_chat_subs`.
- S5 — pass. `cargo test -p api subscribe_failure_keeps_conn_that_was_already_registered`. A second subscribe after the chat directory is removed returns `Err`, and the `conn_id` from the first subscribe stays in the set.
- S6 — pass. `cargo test -p api subscribe_rollback_removes_empty_chat_key`. After rollback, `agent_chat_subs` has no key for that chat.
- S7 — pass. `cargo test -p api unsubscribe_drops_empty_chat_set`. After unsubscribe, `agent_chat_subs` has no empty set.
- S8 — pass. `cargo test -p api disconnect_drops_empty_chat_sets`. After `on_disconnect`, `agent_chat_subs` has no empty set.
- 2026-10-20 follow-up: `cargo test -p api -- --test-threads=8` passed (121 unit tests and `tests/workflow_shell_env.rs`). `cargo clippy -p api --all-targets --all-features -- -D warnings` passed. `cargo fmt --all -- --check` passed. `bun lint` stayed at `oxlint --max-warnings=455`.
- S3 — pass. `package.json` `lint` is `oxlint --max-warnings=455`. No lint config edit.
- S4 — pass (expected failure on the old order). With snapshot-then-register and `Ok(snapshot.meta.last_event_seq)` restored, the same test panicked: `pre-register gap leaked: registered_while_paused=false delivered=false last_event_seq=1 gap_seq=2`. The register-first handler was restored after that run. Log: local `pre-fix-subscribe-race.log`.
- `cargo clippy -p api --all-targets --all-features -- -D warnings` passed after the register-first handler and the `options_probe_dir` argument on `assemble`.
- `cargo test -p api -- --test-threads=8` passed: 117 bin tests and `tests/workflow_shell_env.rs`.
- Agent-browser: not run. No UI surface.
- No TypeScript files changed, so no Bun unit test or `just typecheck` target is affected. CI still runs `bun lint` (`oxlint --max-warnings=455`) and `bun run fmt:check`.
