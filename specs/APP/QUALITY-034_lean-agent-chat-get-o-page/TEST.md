# TEST · QUALITY-034: Lean `agent_chat_get` O(page)

> Test Plan · verify lean get / paged messages fold only a window, with QUALITY-031 wire unchanged. References TECH QUALITY-034. There is no PRD; M1–M4 are the Musts in TECH.

## Test strategy

This is a server cost bug. Proof is Rust tests on `get_snapshot_page` / `get_page` / WS handlers, using the QUALITY-033-style fold counter plus envelope counters. No Bun, Playwright, or agent-browser: no UI, hydrate-order, or timeout-constant change.

- Unit: `cargo test -p core-service` window fold vs full fold, counters.
- Unit: `cargo test -p api` lean get / messages handlers.
- Lint cap: `package.json` `lint` stays `oxlint --max-warnings=455`.

## Coverage map

| TECH item                                        | Scenario IDs |
| ------------------------------------------------ | ------------ |
| M1. Lean get is O(page), not `fold_chat_dir`     | S1, S2       |
| M2. Last N / `has_more_messages` / Web full get  | S3, S4, S8   |
| M3. Older pages do not re-fold the whole history | S5, S6       |
| M4. tool_get / subscribe / oxlint / timeouts     | S7, S9, S10  |

## Execution map

This table is the hand-off from plan to implementation/testing.

| Scenario | Level     | Expected tool                | Target command / method                            | Fixture / data                             | Signals                                                                                | Status  |
| -------- | --------- | ---------------------------- | -------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- | ------- |
| S1       | Rust unit | `cargo test -p core-service` | `get_page_does_not_full_fold_a_long_transcript`    | 200 user turns, `limit` 20                 | `fold_chat_dir_calls` unchanged; `paged_fold_envelopes` ≪ total envelopes; last 20 ids | planned |
| S2       | Rust unit | `cargo test -p api`          | `get_pages_last_twenty_without_full_fold`          | 200 user turns + tool turn, lean get 20    | same counters; 20 messages; `has_more_messages`; `detail_omitted`                      | planned |
| S3       | Rust unit | `cargo test -p core-service` | `get_page_matches_full_fold_tail`                  | 40 user+assistant turns                    | paged ids == `page_messages(full, 20, None)`                                           | planned |
| S4       | Rust unit | `cargo test -p api`          | `get_without_flags_keeps_full_snapshot`            | existing QUALITY-031 fixture               | no `has_more_messages`; full diff body; `fold_chat_dir_calls` increments               | planned |
| S5       | Rust unit | `cargo test -p core-service` | `get_page_before_id_does_not_full_fold`            | 200 user turns, cursor = oldest of last 20 | `fold_chat_dir_calls` unchanged; `paged_fold_envelopes` ≪ total; previous 20 ids       | planned |
| S6       | Rust unit | `cargo test -p api`          | `messages_before_id_loads_older_page`              | existing 25-turn fixture                   | ids `m1`…`m5`; unknown cursor empty + `has_more: false`                                | planned |
| S7       | Rust unit | `cargo test -p api`          | `tool_get_returns_full_diff`                       | existing tool fixture                      | full `diff`; no `detail_omitted`                                                       | planned |
| S8       | Rust unit | `cargo test -p api`          | `get_pages_last_twenty_and_strips_tools`           | 24 user + tool                             | 20 messages; strip (QUALITY-031 S1/S2)                                                 | planned |
| S9       | Rust unit | `cargo test -p api`          | `subscribe_does_not_fold_transcript_for_existence` | QUALITY-033 fixture                        | fold count unchanged                                                                   | planned |
| S10      | Toolchain | shell                        | `package.json` script text                         | repo root                                  | `oxlint --max-warnings=455`                                                            | planned |

## Scenarios

### S1 — Lean page does not full-fold a long transcript

- **Level**: Rust unit
- **Given**: a chat whose `transcript.jsonl` has 200 user turns (600 envelopes). `fold_chat_dir_calls` recorded.
- **When**: `get_page(id, 20, None)`.
- **Then**: messages are the last 20 user ids. `has_more` is true. `fold_chat_dir_calls` is unchanged. `paged_fold_envelopes` is well below 600 (O(page): a few dozen envelopes, not hundreds).
- **Signals**: ids; counters.

### S2 — Handler lean get uses the page path

- **Level**: Rust unit (API)
- **Given**: S1-scale transcript plus one tool turn.
- **When**: `handle_agent_chat_get` with `message_limit: 20`, `include_tool_detail: false`.
- **Then**: 20 messages, `has_more_messages: true`, tool `detail_omitted`, no `old_content`. `fold_chat_dir_calls` unchanged.
- **Signals**: JSON; fold counter.

### S3 — Page ids match a full-fold slice

- **Level**: Rust unit
- **Given**: turns that produce user + assistant messages (merge-sensitive).
- **When**: full `get()` vs `get_page(..., 20, None)`.
- **Then**: paged ids and order equal `page_messages(&full.messages, 20, None)`.
- **Signals**: id lists.

### S4 — Web full get still folds

- **Level**: Rust unit (API)
- **Given**: QUALITY-031 `get_without_flags_keeps_full_snapshot`.
- **When**: get with no `message_limit`.
- **Then**: all messages, full tool body, no `has_more_messages`. This path may increment `fold_chat_dir_calls`.
- **Signals**: JSON; optional fold increment.

### S5 — Older page does not full-fold

- **Level**: Rust unit
- **Given**: 200 user turns; cursor = first id of the last-20 page.
- **When**: `get_page(id, 20, Some(cursor))`.
- **Then**: previous 20 ids. `fold_chat_dir_calls` unchanged. `paged_fold_envelopes` ≪ total transcript envelopes (fold the window, do not fold skipped newer turns).
- **Signals**: ids; counters.

### S6 — QUALITY-031 older page + unknown cursor

- **Level**: Rust unit (API)
- **Given**: existing `messages_before_id_loads_older_page`.
- **When**: that test runs.
- **Then**: `m1`…`m5`, `has_more: false`; missing cursor → empty + `has_more: false`.
- **Signals**: existing assertions.

### S7 — `tool_get` still returns a full part

- **Level**: Rust unit (API)
- **Given**: QUALITY-031 `tool_get_returns_full_diff`.
- **When**: that test runs.
- **Then**: full diff body (this path may full-fold).
- **Signals**: JSON part.

### S8 — Lean strip still applies on the 24+tool fixture

- **Level**: Rust unit (API)
- **Given**: QUALITY-031 `get_pages_last_twenty_and_strips_tools`.
- **When**: that test runs.
- **Then**: 20 messages, `has_more_messages`, `detail_omitted`.
- **Signals**: existing assertions.

### S9 — Subscribe still does not fold

- **Level**: Rust unit (API)
- **Given**: QUALITY-033 subscribe tests.
- **When**: they run.
- **Then**: `fold_chat_dir_calls` unchanged; leftover close still works (QUALITY-035).
- **Signals**: existing test names.

### S10 — oxlint cap stays 455

- **Level**: Toolchain
- **Given**: `package.json`.
- **When**: the `lint` script is read.
- **Then**: it is `oxlint --max-warnings=455`.
- **Signals**: script string.

## Performance & load budgets

- Lean get with `message_limit: 20` on a ≥200-turn transcript must not increment `fold_chat_dir_calls`.
- `paged_fold_envelopes` for that call must be O(page): strictly less than half the transcript envelope count, typically tens of envelopes not hundreds.
- Do not raise the mobile 30s WS timeout.

## Regression checklist

- [ ] QUALITY-031 lean strip / `has_more_messages` / unknown cursor / Web `{ chat_id }` only.
- [ ] QUALITY-018 subscribe register-before-replay + rollback.
- [ ] QUALITY-033 `ensure_chat` does not fold.
- [ ] `get()` leftover close when detached still runs (via QUALITY-035).
- [ ] `package.json` lint script is still `--max-warnings=455`.
- [ ] No client timeout constant change.

## Exploratory agent-browser checks

Omitted. No screen, copy, or route change. The bug is a discarded full fold on lean get.

## Acceptance criteria

- [ ] S1–S6 pass at the declared level.
- [ ] S7–S9 existing QUALITY-031/033 tests pass.
- [ ] S10 oxlint cap is 455.
- [ ] `cargo test -p core-service` page/leftover names and `cargo test -p api --bin api -- agent_chat` pass.
- [ ] `cargo clippy -p api -p core-service --tests -- -D warnings` pass, or scoped clippy on touched packages is recorded.
- [ ] No new REST route. No timeout constant change. No page-size change.

## Manual verification steps

None. Automated server tests cover the fold counters and wire.

## Non-coverage

- On-disk fold cache.
- `tool_get` O(page) lookup (still allowed to full-fold).
- Client 30s timeout value.
- Deepest-history older page is O(distance from EOF) to **read** jsonl; fold stays windowed.

## Coverage Status

> Filled after implementation by `atmos-specs-test-run`.
