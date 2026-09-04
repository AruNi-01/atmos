# TEST · APP-067: Atmos Agent Chat

> Test Plan · how we verify Agent Chat as a Conversation-hosted center-stage workspace. References PRD APP-067 and TECH APP-067.

## Test strategy

- **Rust unit/integration** owns Agent Chat apply-event rules, queue dispatch, steer turn-id matching, catalog merge/cache, and “restore does not spawn”.
- **WS/API-level** owns `agent_chat_*` / `agent_model_catalog_*` contracts, subscribe fan-out, and the prefetch worker lifecycle (first web `/ws`, no `IntervalSpec`).
- **Bun tests** own web tab model, follow-up setting default, composer busy routing, and “no ACP schema in client”.
- **Playwright** covers New Agent Chat, list restore without resume, rename/delete, and composer Queue vs Steer chrome. File: `e2e/tests/specs/APP-067_atmos-agent-chat.e2e.ts` via `just test-e2e`.
- **agent-browser** explores copy, empty list, busy composer, and permission vs steer. Not a substitute for apply-event/WS tests.
- **Manual**: real ACP agent spawn, temp catalog probe, and standalone multi-window — process + CLI variance is too flaky for CI.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1 |
| M2 | S1, S2 |
| M3 | S3, S17 |
| M4 | S3, S4 |
| M5 | S4 |
| M6 | S5 |
| M7 | S5, S6 |
| M8 | S7 |
| M9 | S8 |
| M10 | S9 |
| M11 | S10, S11 |
| M12 | S12 |
| M13 | S13 |
| M14 | S14 |
| M15 | S15 |
| M16 | S16 |
| M17 | S1 (web); N3 deferred |
| M18 | S17 |
| M19 | S18, S19, S20 |
| N1–N6 | deferred |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | E2E | Playwright | `just test-e2e -- tests/specs/APP-067_atmos-agent-chat.e2e.ts` | local Server + web; empty mosaic | Agent Chat tab in strip; plus menu has New Agent Chat next to New Terminal | planned |
| S2 | Bun + E2E | `bun test`, Playwright | tab/launcher tests; same e2e file | New Workspace overlay; ⌘N | launcher/New Workspace can start Chat; ⌘N still New Workspace | planned |
| S3 | Rust | `cargo test` | `cargo test -p core-service --lib agent_chat` | create chat | `meta.json` id ≠ persistence_handle; handle null until spawn | planned |
| S4 | Rust + WS | `cargo test` | conversation get + runtime map | persisted messages; no provider | get returns parts; no `AgentProvider::create/resume` | planned |
| S5 | Rust + Bun | `cargo test`, `bun test` | list grouping | two cwd groups | sidebar groups by cwd; new from list creates row | planned |
| S6 | WS/API | `cargo test -p api` | rename/delete actions | one conversation | title changes; soft-delete hidden from list | planned |
| S7 | Rust | `cargo test` | continue after restore | handle present vs absent | same chat_id; resume vs create_session | planned |
| S8 | WS/API | `cargo test -p api` | `agent_chat_send` idle | idle conversation | new turn running; `agent_chat_event` TurnStarted | planned |
| S9 | Rust | `cargo test` | queue table | busy turn + reload | items survive; dispatch on complete; pause holds | planned |
| S10 | Rust | `cargo test` | steer | running turn matching id | user message kind=steer; no new turn; no cancel | planned |
| S11 | Rust | `cargo test` | steer unsupported / stale turn | ACP v1 stub; completed turn | error; no cancel+resend; UI hides Steer | planned |
| S12 | Bun + WS | `bun test`, `cargo test` | `followup_policy` | default unset; two chats | default queue; setting applies to both | planned |
| S13 | WS/API | `cargo test` | `agent_chat_cancel` | running turn + draft | turn canceled; draft not sent | planned |
| S14 | Rust | `cargo test` | permission + queue + steer | pending permission | queue waits; steer stored; permission unresolved | planned |
| S15 | Bun | `bun test` | client import/lint guard | web agent-chat module | no ACP schema imports | planned |
| S16 | Bun + E2E | `bun test`, Playwright | `/agent-chat?chatId=` | existing conversation | same rows; events fan-out | planned |
| S17 | WS/API | `cargo test -p api` | no `/ws/agent` chat; no REST session list | after rollout step 4 | `agent_chat_*` only; identity not acp_session_id | planned |
| S18 | Rust + WS | `cargo test` | prefetch worker | first web `/ws`; two enabled agents | worker starts once; catalogs cached; `agent_options_updated` | planned |
| S19 | Rust | `cargo test` | 4h cache skip | fresh ok cache | second loop skips probe | planned |
| S20 | Rust | `cargo test` | strategy merge | fake CLI/config/ACP | CLI ids win; config thinking; temp ACP isolated cwd; no IntervalSpec job | planned |

## Scenarios

### S1 — New Agent Chat is a center-stage tab

- **Level**: E2E
- **Given**: web app on an empty center mosaic.
- **When**: the user opens plus menu and chooses New Agent Chat.
- **Then**: a focused `agent-chat` tab appears beside Terminal-capable tabs; Chat is not a global floating modal.
- **Signals**: tab kind `agent-chat`; plus menu contains New Agent Chat next to New Terminal.

### S2 — Entry points and ⌘N

- **Level**: Bun + E2E
- **Given**: empty launcher and New Workspace overlay.
- **When**: the user starts Chat from launcher or New Workspace, then presses ⌘N.
- **Then**: Chat can start from launcher and New Workspace; ⌘N still toggles New Workspace (not New Chat).
- **Signals**: overlay binding; no dedicated New Chat hotkey.

### S3 — Conversation id is not the ACP id

- **Level**: Rust
- **Given**: `agent_chat_create` for provider `claude`.
- **When**: the row is inserted.
- **Then**: `meta.json` `id` is an Atmos UUID; `persistence_handle` is null and never copied into `id`.
- **Signals**: `~/.atmos/data/agent/chats/{id}/meta.json`; create WS output.

### S4 — Opening history does not spawn the provider

- **Level**: Rust + WS
- **Given**: a conversation with stored messages and no live runtime.
- **When**: the client calls `agent_chat_get` / opens the list row.
- **Then**: messages including structured parts render from folded `transcript.jsonl`; `create_session` / `resume_session` are not called.
- **Signals**: fixture provider call counts remain 0; get payload has parts.

### S5 — Chat-first list grouped by cwd

- **Level**: Rust + Bun
- **Given**: two conversations with different `cwd` values.
- **When**: `agent_chat_list` runs.
- **Then**: the history sidebar groups by cwd and can create a new conversation in the current cwd.
- **Signals**: group keys; new row `cwd`.

### S6 — Rename and delete

- **Level**: WS/API
- **Given**: one listed conversation.
- **When**: rename then delete.
- **Then**: title updates in `meta.json` / `index.json`; delete sets `deleted` and leaves the default list.
- **Signals**: `agent_chat_rename` / `agent_chat_delete` outputs; `meta.deleted`.

### S7 — Continue uses the same chat

- **Level**: Rust
- **Given**: restored conversation with a persistence handle.
- **When**: the user sends.
- **Then**: `resume_session` is used with that handle; a new conversation is not created. If no handle, `create_session` attaches to the same `chat_id`.
- **Signals**: same directory `chat_id`; `meta.persistence_handle` used for resume.

### S8 — Idle send starts a turn

- **Level**: WS/API
- **Given**: idle conversation, no running turn.
- **When**: `agent_chat_send`.
- **Then**: a new turn is `running` and subscribers see `turn_started` then deltas.
- **Signals**: `running_turn_id`; `agent_chat_event` sequence.

### S9 — Queue is chat-owned

- **Level**: Rust
- **Given**: a running turn and a queued follow-up.
- **When**: the process restarts (reload) then the turn completes; a paused item is present.
- **Then**: queued items reload from `queue.json`; unpaused items dispatch as a **new** turn; paused items stay.
- **Signals**: `queue.json`; no dispatch while paused.

### S10 — Steer injects the current turn

- **Level**: Rust
- **Given**: running turn `T` and `supports_steer`.
- **When**: `agent_chat_steer` with `expected_turn_id = T`.
- **Then**: a user message `kind=steer` is on turn `T`; no `TurnStarted`; provider `steer` is called; `cancel` is not.
- **Signals**: message row; provider mock.

### S11 — Steer refuses fake inject

- **Level**: Rust
- **Given**: (a) ACP v1 stub without steer; (b) turn already completed.
- **When**: steer is requested.
- **Then**: the host returns unsupported/mismatch; it does not cancel+resend; UI with `supports_steer=false` omits Steer.
- **Signals**: error DTO; cancel call count 0.

### S12 — Follow-up setting is global Queue by default

- **Level**: Bun + WS
- **Given**: unset `followup_policy`; two open chats, both busy.
- **When**: Enter is pressed; then the user sets policy to `steer`.
- **Then**: default is Queue on both chats; after update both Enter-while-busy paths steer; one-shot still exposes the other action.
- **Signals**: `agent_behaviour_settings_*`; client busy-submit helper.

### S13 — Stop does not send the draft

- **Level**: WS/API
- **Given**: running turn and non-empty composer draft.
- **When**: `agent_chat_cancel`.
- **Then**: the turn is canceled; no new user message from the draft; next idle send starts a new turn.
- **Signals**: turn `canceled`; message count.

### S14 — Permission is not queue or steer

- **Level**: Rust
- **Given**: `waiting_permission` and a queued item plus a steer payload.
- **When**: neither permission is answered.
- **Then**: queue does not dispatch; steer persists as guidance; permission row stays `pending`.
- **Signals**: permission status; queue `pending`; steer message present.

### S15 — Client has no ACP schema

- **Level**: Bun
- **Given**: web Agent Chat modules after the rewrite.
- **When**: imports are scanned / typechecked.
- **Then**: UI types are Conversation/Turn/Message; ACP session DTOs are not imported outside the deleted adapter.
- **Signals**: test or lint deny-list; `tsc` on web.

### S16 — Standalone window shares the chat

- **Level**: Bun + E2E
- **Given**: a conversation open in center-stage.
- **When**: `/agent-chat` opens with that `chatId` and a send occurs.
- **Then**: both surfaces show the same rows; events fan out to both subscribers.
- **Signals**: two `agent_chat_subscribe` connections; shared message ids.

### S17 — Old chat transport is gone

- **Level**: WS/API
- **Given**: rollout step 4 complete.
- **When**: a client lists/opens chat.
- **Then**: identity is `chat_id`; dedicated `/ws/agent/{id}` is not the chat model; REST session list/create/resume are gone.
- **Signals**: router table; 404 or unused routes; list payload.

### S18 — Entering the app prefetches enabled agents

- **Level**: Rust + WS
- **Given**: two user-enabled agents and a first web `/ws`.
- **When**: the connection registers.
- **Then**: one prefetch worker starts; both agents are probed or served from cache; `agent_options_updated` fires; a second web socket does not start a second worker.
- **Signals**: worker single-flight; event names; no `IntervalSpec` registration for catalog.

### S19 — Four-hour cache skips live probe

- **Level**: Rust
- **Given**: an `ok` disk cache younger than 4 hours.
- **When**: the worker loops.
- **Then**: that agent is not CLI/ACP probed; `agent_options_get` returns `source=cache`.
- **Signals**: probe call count; cache `fetched_at`.

### S20 — Catalog strategies merge without leaking ACP into Chat

- **Level**: Rust
- **Given**: config thinking metadata, CLI model ids, and a temp ACP probe fixture.
- **When**: catalog merge runs.
- **Then**: CLI/ACP ids win; thinking comes from config if live list omits it; temp ACP cwd is under `catalog-probe/` and is closed; unsupported thinking is `None`, not invented.
- **Signals**: `AgentOptionsSnapshot`; probe cwd; process killed.

## Performance & load budgets

- `agent_chat_get` of a 200-record transcript: p95 < 200ms in-process (no provider).
- Assistant jsonl snapshot ≤ 100ms behind last delta (TECH).
- Catalog prefetch: ≤ 2 concurrent probes; picker remains interactive.
- Live `agent_chat_event` fan-out does not block other `/ws` actions on the same connection.

## Regression checklist

- [ ] Opening a history row does not start an ACP process.
- [ ] `meta.json` `id` never equals `persistence_handle`.
- [ ] No conversation tables added to `atmos.db`.
- [ ] Steer with a stale `expected_turn_id` does not attach to the next turn.
- [ ] Queue does not dispatch during `waiting_permission`.
- [ ] Stop does not send composer text.
- [ ] Follow-up policy default remains Queue after unset settings.
- [ ] Prefetch worker is not an APP-051 interval job.
- [ ] Modal floating Chat is not mounted as the global host.
- [ ] Terminal New / APP-024 / APP-030 behavior unchanged.
- [ ] Web client does not import ACP schema types.

## Exploratory agent-browser checks

Load Agent Browser skill or `agent-browser skills get core --full` first.

1. Fresh reload: plus menu New Agent Chat → tab + cwd-grouped list + composer model picker (if cache present).
2. Open a stored conversation: messages appear before any agent process; send continues the same chat.
3. Busy composer: default Queue vs one-shot Steer; Stop leaves the draft.
4. Permission dialog: steer does not approve; queue stays docked.
5. Narrow viewport: list, transcript, and composer remain usable; no overlap.
6. Console/network: no `/ws/agent/` chat frames; `agent_chat_event` on main `/ws`.

## Acceptance criteria

- [ ] Every Must Have M1–M19 has a passing scenario at the declared level.
- [ ] S4 proves restore ≠ spawn; S3/S17 prove identity and old transport removal.
- [ ] S10/S11 prove steer is capability-gated and never cancel+resend.
- [ ] S18–S20 prove enter-app prefetch, 4h cache, and isolated temp ACP.
- [ ] No new REST conversation CRUD (upload-attachments only, as TECH).
- [ ] `atmos-specs-test-run` has updated Coverage Status with exact commands.
- [ ] `just lint` and `just test` pass on changed crates/apps, or a scoped exception is recorded.

## Manual verification steps

1. Install one ACP agent and one CLI-list agent (e.g. grok). Enter the app; confirm catalogs populate without opening Chat; confirm Claude-style agents get config/ACP probe without writing into the project tree.
2. Open standalone `/agent-chat` in a second window; send; confirm both windows stream.
3. Toggle global Queue/Steer; confirm two chats follow the new default Enter behavior.

## Non-coverage

- N1 pin/archive/search, N2 CLI verbs, N3 Mobile UI, N4 permission profiles, N5 Canvas embed, N6 command palette.
- Pixel-level ChatGPT/Codex visual clones.
- Migrating ACP `session/list` rows.
- APP-024 Terminal run-config UI (shared catalog engine only).
- Live third-party model lists in CI (use fakes; manual for real CLIs).

## Coverage Status

Implemented 2026-08-28 on `feat/APP-067-agent-chat`.

| Scenario | Command | Result |
|----------|---------|--------|
| S3–S7 store/identity | `cargo test -p core-service --lib agent_chat` | pass (`s3_chat_id_is_not_persistence_handle`, `s4_*`, `s5_list_groups_by_cwd`, `s6_rename_and_soft_delete`, `s7_continue_*`) |
| S8 idle send | same | pass `s8_idle_send_starts_turn` |
| S9–S14 queue/steer/cancel/permission/policy | same | pass (`s9_queue_reloads_and_dispatch_skips_paused` asserts `next` dispatched + `hold` paused) |
| S16 fan-out | `cargo test -p core-service --lib s16_two_subscribers_see_the_same_send` + bun `agent-chat-events.test.ts` + Playwright S16 send | pass |
| S18–S20 catalog prefetch/cache/merge | same + `cargo test -p agent --lib` | pass (incl. `maps_model_mode_and_thinking_from_config_options`, `with_acp_probe_uses_the_provided_probe_not_noop`) |
| S2/S5/S12/S15 web | `bun test apps/web/src/app-shell/__tests__/agent-chat-entry-points.test.ts apps/web/src/features/agent/lib/__tests__/{followup-policy,group-agent-chats,no-acp-schema,agent-chat-events}.test.ts` | pass |
| S17 old transport | `cargo test -p api -- --test-threads=1 s17` | pass (`s17_rest_session_crud_removed`, `s17_dedicated_agent_ws_removed`) |
| S20 production ACP probe wiring | `cargo test -p api -- --test-threads=1 s20_catalog_engine_uses_temp_acp_probe` | pass (`StdioAcpOptionsProbe` + `OptionsProbe::with_acp_probe`) |
| S1/S16 Playwright | `E2E_SINGLE_SERVER=0 bun run --cwd e2e test tests/specs/APP-067_atmos-agent-chat.e2e.ts --project=chromium --workers=1` | pass twice (Next dev; S16 sends and both pages show `[data-agent-chat-message]`) |
| api-types | `bun run --filter @atmos/api-types extract-actions && extract-events && check-actions && check-events && test` | pass (301 actions, 33 events) |
| clippy | `cargo clippy -p agent -p core-service -p api --offline -- -D warnings` | pass |

Remaining gaps: live ACP spawn / real CLI model lists (TEST.md Non-coverage); agent-browser exploratory checks if the CLI is unavailable; Playwright S2 launcher/⌘N and S16 center-stage+standalone pairing (current S16 is two standalone pages); S12 UI persist is covered by settings wiring, not a two-chat Playwright. Review fixes 2026-08-28 also added `overlapping_send_rejects_second_turn` and live delta fold unit tests.
