# TEST · QUALITY-035: `ensure_chat` leftover close short-circuit / tail scan

> Test Plan · verify leftover close does not full-scan `transcript.jsonl` when live is empty, while detached settle still writes `PartFinished`. References TECH QUALITY-035. There is no PRD; M1–M4 are the Musts in TECH.

## Test strategy

Server cost + settle correctness. Proof is Rust tests on `ensure_chat` / `close_leftover_open_parts` / subscribe, with leftover envelope counters (sibling to QUALITY-033’s `fold_chat_dir_calls`). No Bun, Playwright, or agent-browser.

- Unit: `cargo test -p core-service` short-circuit + settle.
- Unit: `cargo test -p api` subscribe handler.
- Lint cap: `package.json` `lint` stays `oxlint --max-warnings=455`.

## Coverage map

| TECH item                                        | Scenario IDs |
| ------------------------------------------------ | ------------ |
| M1. Empty live → no transcript scan              | S1, S2       |
| M2. Settle scans live + transcript tail, not all | S3, S4       |
| M3. QUALITY-033/018 leftover + skip-while-alive  | S5, S6, S7   |
| M4. Subscribe still does not fold; oxlint / wire | S8, S9       |

## Execution map

This table is the hand-off from plan to implementation/testing.

| Scenario | Level     | Expected tool                | Target command / method                                     | Fixture / data                                          | Signals                                                                              | Status  |
| -------- | --------- | ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------- |
| S1       | Rust unit | `cargo test -p core-service` | `ensure_chat_empty_live_does_not_scan_transcript`           | 200 user turns, empty `live.jsonl`                      | `leftover_transcript_envelopes_read` unchanged (0); fold count unchanged             | planned |
| S2       | Rust unit | `cargo test -p api`          | `subscribe_empty_live_does_not_scan_transcript`             | same through subscribe                                  | transcript leftover counter 0; `{ last_event_seq }`; conn registered                 | planned |
| S3       | Rust unit | `cargo test -p core-service` | `ensure_chat_closes_leftover_without_full_transcript_scan`  | 200 user turns + open live `TextChunk`                  | `PartFinished`; live truncated; transcript leftover reads ≤ 64; fold count unchanged | planned |
| S4       | Rust unit | `cargo test -p core-service` | `ensure_chat_skips_already_finished_via_transcript_tail`    | live chunk + trailing `PartFinished` for same `part_id` | no second `PartFinished`; live truncated; transcript reads ≤ 64                      | planned |
| S5       | Rust unit | `cargo test -p core-service` | `ensure_chat_closes_leftover_open_parts_without_folding`    | existing QUALITY-033 leftover fixture                   | `PartFinished`; live empty; second call idempotent; fold count unchanged             | planned |
| S6       | Rust unit | `cargo test -p core-service` | `ensure_chat_unknown_is_not_found`                          | random UUID                                             | `NotFound`; no chat dir                                                              | planned |
| S7       | Rust unit | `cargo test -p core-service` | `lifecycle_load_without_runtime_closes_leftover_open_parts` | existing get() leftover test                            | `get()` still settles when detached                                                  | planned |
| S8       | Rust unit | `cargo test -p api`          | QUALITY-033 subscribe names                                 | existing fixtures                                       | no fold; leftover subscribe still settles                                            | planned |
| S9       | Toolchain | shell                        | `package.json` script text                                  | repo root                                               | `oxlint --max-warnings=455`                                                          | planned |

## Scenarios

### S1 — Empty live does not scan transcript

- **Level**: Rust unit
- **Given**: a chat with 200 user turns on `transcript.jsonl` and empty `live.jsonl`. Leftover transcript counter is 0.
- **When**: `ensure_chat` runs (no alive runtime).
- **Then**: `leftover_transcript_envelopes_read` stays 0. `fold_chat_dir_calls` stays unchanged. Chat remains readable.
- **Signals**: counters.

### S2 — Subscribe with empty live does not scan transcript

- **Level**: Rust unit (API)
- **Given**: S1 disk fixture.
- **When**: `handle_agent_chat_subscribe`.
- **Then**: same counter signals as S1; response has `last_event_seq`; `conn_id` registered.
- **Signals**: counters; JSON; subscription map.

### S3 — Detached leftover settles without a full transcript scan

- **Level**: Rust unit
- **Given**: 200 historical user turns, plus an open `TextChunk` on `live.jsonl` (no matching `PartFinished`).
- **When**: `ensure_chat` runs.
- **Then**: transcript contains `PartFinished` for that part. `live.jsonl` is empty. `fold_chat_dir_calls` unchanged. `leftover_transcript_envelopes_read` ≤ `LEFTOVER_TRANSCRIPT_TAIL_MAX` (64) and less than the historical envelope count. A second `ensure_chat` does not append another `PartFinished` (empty live short-circuits).
- **Signals**: jsonl; counters.

### S4 — Already-finished live chunks do not duplicate `PartFinished`

- **Level**: Rust unit
- **Given**: live still has a `TextChunk` for `p1`, and transcript **ends** with `PartFinished` for `p1` (crash between materialize and truncate). Hundreds of older turns exist.
- **When**: `ensure_chat` runs.
- **Then**: still exactly one `PartFinished` for `p1`. Live truncated. Transcript leftover reads ≤ 64.
- **Signals**: jsonl counts; counters.

### S5 — QUALITY-033 leftover fixture still settles without folding

- **Level**: Rust unit
- **Given**: existing `ensure_chat_closes_leftover_open_parts_without_folding`.
- **When**: that test runs.
- **Then**: `PartFinished`, live truncated, fold count unchanged, second call idempotent.
- **Signals**: existing assertions.

### S6 — Unknown chat is NotFound without creating files

- **Level**: Rust unit
- **Given**: existing `ensure_chat_unknown_is_not_found`.
- **When**: that test runs.
- **Then**: `NotFound`; no `live.jsonl` created.
- **Signals**: existing assertions.

### S7 — Detached `get()` still closes leftovers

- **Level**: Rust unit
- **Given**: existing `lifecycle_load_without_runtime_closes_leftover_open_parts`.
- **When**: that test runs.
- **Then**: leftover still materializes on `get()` (inherits the cheap scan).
- **Signals**: existing assertions.

### S8 — Subscribe QUALITY-033 tests still pass

- **Level**: Rust unit (API)
- **Given**: `subscribe_does_not_fold_transcript_for_existence`, `subscribe_closes_leftover_open_parts_without_folding`, QUALITY-018 rollback/race names, QUALITY-031 lean opts.
- **When**: `cargo test -p api` those names.
- **Then**: they pass.
- **Signals**: existing tests.

### S9 — oxlint cap stays 455

- **Level**: Toolchain
- **Given**: `package.json`.
- **When**: the `lint` script is read.
- **Then**: it is `oxlint --max-warnings=455`.
- **Signals**: script string.

## Performance & load budgets

- Empty live: `leftover_transcript_envelopes_read == 0`.
- Non-empty live: leftover transcript reads ≤ 64 envelopes even when history has ≥ 200 turns.
- Subscribe must not increment `fold_chat_dir_calls`.
- Do not raise the mobile 30s WS timeout.

## Regression checklist

- [ ] QUALITY-033 subscribe does not fold.
- [ ] QUALITY-018 register-first / missing-chat rollback.
- [ ] Alive runtime still skips leftover close (`get()` / `ensure_chat` same branch).
- [ ] `package.json` lint script is still `--max-warnings=455`.
- [ ] No client timeout constant change.

## Exploratory agent-browser checks

Omitted. No screen, copy, or route change.

## Acceptance criteria

- [ ] S1–S6 pass at the declared level.
- [ ] S7–S8 existing leftover / subscribe tests pass.
- [ ] S9 oxlint cap is 455.
- [ ] `cargo test -p core-service` leftover/`ensure_chat` names and `cargo test -p api --bin api -- agent_chat` pass.
- [ ] `cargo clippy -p api -p core-service --tests -- -D warnings` pass, or scoped clippy is recorded.
- [ ] No new REST route. No timeout constant change.

## Manual verification steps

None. Automated server tests cover short-circuit and settle.

## Non-coverage

- Spawning a live runtime in the API harness to assert leftover skip (same gap as QUALITY-033).
- Emitting `PartFinished` as a live `AgentChatEvent`.
- QUALITY-034 windowed get (same PR, other spec).

## Coverage Status

> Filled after implementation by `atmos-specs-test-run`.
