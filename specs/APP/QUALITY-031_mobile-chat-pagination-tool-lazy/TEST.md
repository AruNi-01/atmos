# TEST · QUALITY-031: Mobile Chat message pagination + lazy tool events

> Test Plan · verify a 20-message lean first paint, older pages, and expand-to-load tools. References TECH QUALITY-031.

## Test strategy

Deterministic coverage lives in Rust (page/strip/handlers) and Bun (contract, fold merge, Mobile hydrate/UI helpers). There is no Mobile Playwright harness in this repo; QUALITY-009 is a local iOS simulator harness, not CI. Agent-browser does not exercise Expo.

- Unit / integration: `page_messages`, tool strip, `mergeToolCallState` lean vs full, prepend merge.
- WebSocket/API-level: get/messages/subscribe/tool_get request shapes, defaults, lean fan-out opts, clamp.
- Bun: api-types catalog, Mobile source-scan + helper tests for first-page flags, load-older, tool Loading.
- End-to-end (Playwright): none — Mobile-only UI. Web must keep calling `agent_chat_get` with `{ chat_id }` only.
- Exploratory agent-browser: omitted (no web UI change).
- Manual-only: iOS/Android scroll-to-top + expand on a long chat with a large diff tool (needs a Computer).

## Coverage map

| Item                             | Scenario IDs |
| -------------------------------- | ------------ |
| M1 first paint ≤20 lean messages | S1, S2, S8   |
| M2 older page on top             | S3, S4, S5   |
| M3 tool expand fetch + Loading   | S6, S7, S9   |
| M4 live insert + EventGate       | S8, S10      |
| N1 Web not forced to page        | S11          |
| Failure / retry                  | S5, S7, S12  |

## Execution map

| Scenario | Level      | Expected tool       | Target command / method         | Fixture / data                | Signals                                 | Status |
| -------- | ---------- | ------------------- | ------------------------------- | ----------------------------- | --------------------------------------- | ------ |
| S1       | Rust unit  | `cargo test`        | `page_messages`                 | 25 synthetic messages         | last 20; `has_more` true                | pass   |
| S2       | Rust unit  | `cargo test`        | `strip_message_tool_details`    | Diff + Execute + FileContent  | no full contents; JSON `detail_omitted` | pass   |
| S3       | Rust unit  | `cargo test`        | `page_messages` before id       | cursor at message 6           | previous 5; `has_more` false            | pass   |
| S4       | Bun        | `bun test`          | fold prepend / resync merge     | local older + snapshot window | prefix kept; ids unique                 | pass   |
| S5       | Bun        | `bun test`          | load-older retry helper         | failed then ok                | three retries then header error         | pass   |
| S6       | Rust / API | `cargo test -p api` | `agent_chat_tool_get`           | snapshot with one tool        | full part returned                      | pass   |
| S7       | Bun        | `bun test`          | tool-detail helper              | `detail_omitted` open         | loading → ready / error                 | pass   |
| S8       | Bun        | `bun test`          | `use-agent-chat-thread.ts` scan | source                        | lean get+subscribe; no unbounded get    | pass   |
| S9       | Bun        | `bun test`          | ToolCallRow / tool-body         | omitted vs full               | spinner vs body                         | pass   |
| S10      | Rust       | `cargo test -p api` | subscribe lean opt              | HashMap opts                  | lean conn stored; full default          | pass   |
| S11      | Bun        | `bun test`          | web `agent-chat-api.ts`         | source                        | `{ chat_id }` only                      | pass   |
| S12      | Rust unit  | `cargo test`        | unknown before id               | missing cursor                | empty + `has_more` false                | pass   |

## Scenarios

### S1 — Happy path: first page is the last 20 messages

- **Level**: Rust unit
- **Given**: a folded transcript with 25 messages.
- **When**: `page_messages(..., 20, None)`.
- **Then**: the page is messages 6..25; `has_more` is true.
- **Signals**: ids and length.

### S2 — Happy path: lean tools drop heavy bodies

- **Level**: Rust unit
- **Given**: a tool part with `Diff` contents and `Execute.output`.
- **When**: strip + serialize.
- **Then**: result is `diff_stats` / empty execute output; wire JSON has `detail_omitted: true`.
- **Signals**: serde value assertions.

### S3 — Happy path: `before_message_id` loads the previous page

- **Level**: Rust unit
- **Given**: 25 messages; cursor = id of message 6.
- **When**: `page_messages(..., 20, Some(id6))`.
- **Then**: messages 1..5; `has_more` false.
- **Signals**: ids.

### S4 — Edge: resync last 20 does not drop already-loaded older rows

- **Level**: Bun
- **Given**: local messages m1..m40; snapshot last 20 (m21..m40 plus a new m41).
- **When**: merge snapshot window.
- **Then**: m1..m20 stay; window replaces overlap; m41 appends; no duplicate ids.
- **Signals**: merged id list.

### S5 — Failure: older-page request fails

- **Level**: Bun
- **Given**: `has_more` true; messages request rejects.
- **When**: load older with retry helper.
- **Then**: existing messages stay; after retries the header error is set; Retry calls the same cursor.
- **Signals**: message length unchanged; error string.

### S6 — Happy path: expand fetches full tool parts

- **Level**: API / service
- **Given**: a snapshot tool with full diff; lean list omitted the body.
- **When**: `agent_chat_tool_get` with that `tool_call_id`.
- **Then**: response `parts` contains the full `tool_call` (diff contents present, no `detail_omitted`).
- **Signals**: JSON part.

### S7 — Failure: tool_get fails while expanded

- **Level**: Bun
- **Given**: `detail_omitted` part; fetch rejects.
- **When**: expand.
- **Then**: status `error`; collapsed header still visible; Retry reissues the same ids.
- **Signals**: helper state machine.

### S8 — Mobile hydrate uses lean get + lean subscribe

- **Level**: Bun (source + helper)
- **Given**: `use-agent-chat-thread.ts`.
- **When**: scan / unit the payload builders.
- **Then**: first get includes `message_limit: 20` and `include_tool_detail: false`; subscribe includes `include_tool_detail: false`; get still happens before subscribe.
- **Signals**: source contains those fields; get index < subscribe index.

### S9 — Expand shows Loading then body

- **Level**: Bun
- **Given**: a lean tool part.
- **When**: `open && detail_omitted && !ready`.
- **Then**: Loading model; after fetch, body model uses full params/result.
- **Signals**: helper / shallow render flags.

### S10 — Subscribe default stays full for Web

- **Level**: Rust
- **Given**: subscribe without `include_tool_detail`.
- **When**: register.
- **Then**: stored opts `include_tool_detail == true`. Explicit `false` stores lean.
- **Signals**: `agent_chat_subs` map.

### S11 — Web get is still `{ chat_id }`

- **Level**: Bun
- **Given**: `apps/web/src/api/ws/agent-chat-api.ts`.
- **When**: scan.
- **Then**: `agent_chat_get` is called with `{ chat_id }` only; no `message_limit`.
- **Signals**: file text.

### S12 — Unknown cursor does not loop

- **Level**: Rust unit
- **Given**: `before_message_id` that is not in the list.
- **When**: page.
- **Then**: empty vec, `has_more` false.
- **Signals**: return value.

## Performance & load budgets

- First-paint `agent_chat_get` response contains ≤ 20 messages.
- Lean tool JSON must not include `old_content` / `new_content` / execute `output` / file `text` / fetch markdown.
- `tool_call_ids` length > 20 is clamped or rejected; test the clamp.

## Regression checklist

- [x] QUALITY-018 subscribe register-before-snapshot tests still pass (`contains_key` after HashMap change).
- [x] EventGate hydrate order (get → finishHydrate → subscribe cursor) unchanged.
- [x] `agent_chat_backfill` still used for text holes, not tools.
- [x] Expand store does not reset when older messages prepend (`messages[0]` changes).
- [x] oxlint `--max-warnings=455` is not raised.
- [x] Web chat session still hydrates via `agentChatApi.get(id)` with no limit.

## Exploratory agent-browser checks

Omitted. This spec does not change the web chat surface. Mobile verification is Bun helpers plus optional simulator smoke (non-coverage below).

## Acceptance criteria

- [x] S1–S12 have automated coverage at the declared level, or S6 is covered by service-level collect+handler tests if a live tool fixture is too heavy.
- [x] First Mobile get payload is lean and `message_limit` is 20.
- [x] `has_more` / `has_more_messages` distinguish “exactly 20 messages” from “more exist”.
- [x] No new REST endpoint.
- [x] Web is not forced onto pagination.
- [x] `just lint` on changed TS (oxlint/oxfmt) and `cargo clippy -p api -p core-service` pass.

## Manual verification steps

1. On a Computer with a chat longer than 20 messages and at least one large edit tool: open the chat on Mobile; confirm the tail; scroll to top for the next page; expand the tool and see Loading then the diff.
2. Send a new user message while scrolled up; confirm it does not wipe older pages.

## Non-coverage

- iOS/Android simulator E2E in CI (QUALITY-009 is local-only).
- Web chat virtualizer / QUALITY-008 paint path.
- Reducing server-side jsonl fold cost.

## Coverage Status

- S1 — ✅ `core-service` `page_messages_keeps_the_tail`; API `get_pages_last_twenty_and_strips_tools` (24 user turns + tool turn → 20 messages, `has_more_messages`).
- S2 — ✅ `strip_replaces_diff_and_execute_bodies`, `strip_diff_becomes_stats_and_json_is_flagged`; API lean get asserts `detail_omitted` and no `old_content`/`new_content`.
- S3 — ✅ `page_messages_before_id_loads_older_window`; API `messages_before_id_loads_older_page`.
- S4 — ✅ `paged-transcript.test.ts` merge keeps m1..m40 + m41; `fold-transcript.test.ts` resync last-20 keeps older prefix.
- S5 — ✅ `lean-chat.test.ts` `olderPageAfterFailure` three retries then header error.
- S6 — ✅ API `tool_get_returns_full_diff` (`edit-1` full `diff`); `collect_tool_parts` + `clamp_tool_get_ids_caps_at_twenty`.
- S7 — ✅ `toolDetailPhase` / `shouldFetchToolDetail` in `lean-chat.test.ts`.
- S8 — ✅ `use-agent-chat-thread.test.ts` scans `leanChatGetRequest` / `leanChatSubscribeRequest` / `agentChatToolGet`.
- S9 — ✅ `lean-chat.test.ts` scans `tool-body.tsx` for `ActivityIndicator` + `toolDetailPhase`.
- S10 — ✅ API `subscribe_stores_lean_and_full_opts`; QUALITY-018 `subscribe_rolls_back_*` still pass.
- S11 — ✅ `lean-chat.test.ts` web `agent-chat-api.ts` is `{ chat_id }` only; API `get_without_flags_keeps_full_snapshot`.
- S12 — ✅ `unknown_before_id_returns_empty`; API missing cursor → empty + `has_more: false`.

Commands (2026-10-23):

```
cargo test -p core-service transcript_view
cargo test -p api --bin api -- get_pages_last_twenty_and_strips_tools messages_before_id_loads_older_page tool_get_returns_full_diff subscribe_stores_lean_and_full_opts get_without_flags_keeps_full_snapshot subscribe
cargo clippy -p api -p core-service --tests -- -D warnings
bun test packages/api-types packages/api-client/src/agent-chat/fold.test.ts apps/mobile/src/features/agent-chat/*.test.ts apps/mobile/src/api/mobile-ws-client.test.ts
bun lint   # oxlint --max-warnings=455, exit 0
```

Remaining: iOS/Android simulator smoke (TEST.md Manual verification). Agent-browser omitted (no web UI change).
