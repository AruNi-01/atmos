# TEST · APP-075: Agent Sessions

> Test Plan · how we verify the Agent Sessions sidebar, cheap scan, preview-without-persist, Atmos Chat tag, Chat/TUI resume, and transcript search. References PRD APP-075 and TECH APP-075.

## Test strategy

- **Rust unit** (`cargo test -p agent`): each v1 `session_source` adapter — roots, cheap list, parse fixtures → `AgentEvent` kinds, skip internal Codex threads, Grok summary-only vs `updates.jsonl`.
- **Rust service** (`cargo test -p core-service`): list filters, Atmos Chat tag join, `get` does not create `chats/`, `resume_chat` reuses vs creates, `Imported` origin + `persistence_handle`, TUI plan argv.
- **api-types**: `host_session_*` contract rows; `AgentChatOrigin` includes `imported`.
- **Bun**: sidebar filter model, tag rendering, virtualizer present in list + transcript components, Launchpad id `agent-sessions`, `CurrentView` parse for `/agent-sessions`.
- **Playwright**: optional smoke for Launchpad → list → preview. Live CLI resume is manual.
- **agent-browser**: layout, filters, empty state, tag copy, resume buttons. Not a substitute for adapter fixtures.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2 |
| M2 | S3, S4 |
| M3 | S5, S6 |
| M4 | S7, S8 |
| M5 | S9, S10 |
| M6 | S11, S12 |
| M7 | S13, S14, S15 |
| M8 | S16, S17 |
| M9 | S18 |
| M10 | S19, S20 |
| M11 | S21 |
| M12 | S22 |
| M13 | S23, S24, S25 |
| M14 | S26, S27 |
| M15 | S28, S29 |
| M16 | S30, S31 |
| N2–N6 | deferred |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Bun | `bun test` | `CurrentView` + Launchpad id | `/agent-sessions` | `currentView === "agent-sessions"`; item id present | planned |
| S2 | Bun | `bun test` | LeftSidebar branch | source read | `agent-sessions` renders host sidebar, not `projectTabContent` | planned |
| S3 | Rust | `cargo test -p agent` | `SessionSource::list` | temp homes for all six v1 hosts | six adapters return refs; missing root → empty | planned |
| S4 | Service | `cargo test -p core-service` | `HostSessionService::list` | empty homes | empty `sessions`, no error | planned |
| S5 | Service + Bun | `cargo test`, `bun test` | filter provider + project | mixed list | Codex+cwd subset only | planned |
| S6 | Service | `cargo test` | clear filters | same | full list restored | planned |
| S7 | Service | `cargo test` | `host_session_get` | one jsonl | messages returned; `chats/` dir unchanged | planned |
| S8 | Service | `cargo test` | get twice | same | still no `chats/{id}` | planned |
| S9 | Rust | `cargo test -p agent` | parse Claude/Codex/Grok fixtures | testdata | `UserMessage` / `ToolCall*` / thinking mapped | planned |
| S10 | Rust | `cargo test -p agent` | unknown line | extra jsonl type | omit or `Unknown`; parse continues | planned |
| S11 | Service | `cargo test` | tag join | chat meta `persistence_handle` | `tags` includes `atmos_chat`; `atmos_chat_id` set | planned |
| S12 | Service | `cargo test` | no matching chat | host only | no tag | planned |
| S13 | Service | `cargo test` | `resume_chat` reuse | tagged row | `created: false`; same `chat_id`; no second dir | planned |
| S14 | Service | `cargo test` | `resume_chat` convert | untagged | `created: true`; `origin=imported`; jsonl exists; handle = native id | planned |
| S15 | Service | `cargo test` | resume_chat unsupported host | stub | error; no write | planned |
| S16 | Service | `cargo test` | `resume_tui` argv | Codex fixture | `codex resume <id>`; cwd set; no chats/ write | planned |
| S17 | Service | `cargo test` | TUI missing binary | PATH without cli | recoverable error | planned |
| S18 | Bun | `bun test` | component source | `HostSessionSidebar` / transcript | `useVirtualizer` present | planned |
| S19 | Rust | `cargo test -p agent` | list vs parse | large jsonl | `list` does not read full file body | planned |
| S20 | Service | `cargo test` | index reuse / sync | two list calls then `sync: true` | second list does not rescan; refresh does | planned |
| S21 | Rust | `cargo test -p agent` | roster | only v1 ids | no Gemini/Hermes adapter registered | planned |
| S22 | Bun | `bun test` | grep identifiers | apps/web + crates | no third-party browser product names; WS is `host_session_*` | planned |
| S23 | Service | `cargo test -p core-service` | list `query` | fixture with unique body text | session returned; `hits[0].kind` user or assistant | pass |
| S24 | Service | `cargo test -p core-service` | CJK query | Chinese user text | session + hit | pass |
| S25 | Service | `cargo test -p core-service` | tool/think only | assistant think + tool, no text | query on tool string misses | pass |
| S26 | Service | `cargo test -p core-service` | list without waiting catchup | many sessions | list returns before all bodies indexed | pass |
| S32 | Service + Bun | `cargo test`, `bun test` | index progress chip | pending bodies / catchup events | list has `search_progress`; header chip left of Refresh | pass |
| S27 | Infra | `cargo test -p infra` | title row without parse | metadata replace | FTS title MATCH works | pass |
| S28 | Unit | `cargo test -p core-service` | extract chunk | 40KB assistant text | two chunks, same seq/message_id | pass |
| S29 | Infra | `cargo test -p infra` | title vs message rows | one session | one title row + N message rows | pass |
| S30 | Service + Bun | `cargo test`, `bun test` | hit locator | known flatten index | `hits[0].seq` equals message index; href has `mid`/`seq` | pass |
| S31 | Bun | `bun test` | drawer jump wiring | DetailView source | reads `mid`/`seq`; calls `scrollToIndexRef` | pass |

## Scenarios

### S1 — Launchpad opens Agent Sessions

- **Level**: Bun
- **Given**: Launchpad includes `agent-sessions`.
- **When**: user navigates to `/agent-sessions`.
- **Then**: `currentView` is `agent-sessions`; Launchpad item is active.
- **Signals**: parser test; Launchpad `ITEM_DEF_BY_ID` has `path: "/agent-sessions"`.

### S2 — Left sidebar is the session list

- **Level**: Bun (source) / agent-browser
- **Given**: `currentView === "agent-sessions"`.
- **When**: `LeftSidebar` renders.
- **Then**: workspace `projectTabContent` is not the main list; host session sidebar is.
- **Signals**: source contains the branch; Launchpad block still mounts.

### S3 — v1 hosts list from fixtures

- **Level**: Rust unit
- **Given**: temp dirs laid out like the TECH path table.
- **When**: each adapter `list`s.
- **Then**: refs include native ids; a missing home returns `[]`.
- **Signals**: `cargo test -p agent` session_source tests.

### S4 — Empty machine

- **Level**: Service
- **Given**: no v1 homes.
- **When**: `list`.
- **Then**: empty array, not a transport error.
- **Signals**: DTO `sessions: []`.

### S5 — Filter by agent and project

- **Level**: Service + Bun
- **Given**: mixed Claude/Codex rows, two cwds.
- **When**: `provider_id=codex` and `project` matches one cwd.
- **Then**: only that subset.
- **Signals**: list length and keys.

### S6 — Clear filters

- **Level**: Service
- **Given**: S5 filters applied.
- **When**: filters omitted.
- **Then**: full list.
- **Signals**: keys equal unfiltered scan.

### S7 — Preview does not persist

- **Level**: Service
- **Given**: one host jsonl.
- **When**: `get(key)`.
- **Then**: messages non-empty; `~/.atmos/data/agent/chats` (test dir) has no new chat folder.
- **Signals**: fs listing before/after.

### S8 — Preview is repeatable without write

- **Level**: Service
- **Given**: S7.
- **When**: `get` again.
- **Then**: still no chat dir.
- **Signals**: same.

### S9 — Unified events from disk

- **Level**: Rust unit
- **Given**: fixtures for Claude jsonl, Codex rollout, Grok `updates.jsonl` + `summary.json`.
- **When**: `parse`.
- **Then**: envelopes use Atmos tags (`user_message`, tool calls, thinking where present).
- **Signals**: snapshot or kind asserts.

### S10 — Unknown host line

- **Level**: Rust unit
- **Given**: a jsonl line with an unknown type.
- **When**: `parse`.
- **Then**: session still returns; line omitted or `Unknown`.
- **Signals**: no `Err` for one bad line.

### S11 — Atmos Chat tag

- **Level**: Service
- **Given**: Atmos meta `provider_id=codex`, `persistence_handle=abc`.
- **When**: list includes host `codex:abc`.
- **Then**: `tags` contains `atmos_chat`; `atmos_chat_id` is that chat.
- **Signals**: DTO fields.

### S12 — No tag without match

- **Level**: Service
- **Given**: host session with no Atmos chat.
- **When**: list.
- **Then**: `tags` empty; `atmos_chat_id` null.
- **Signals**: DTO fields.

### S13 — Resume in Chat reuses

- **Level**: Service
- **Given**: S11 tagged row.
- **When**: `resume_chat`.
- **Then**: `created=false`; same `chat_id`; no second directory.
- **Signals**: output + fs.

### S14 — Resume in Chat converts once

- **Level**: Service
- **Given**: untagged host session.
- **When**: `resume_chat`.
- **Then**: `created=true`; `origin=imported`; `persistence_handle=native_id`; `chat_id ≠ native_id`; jsonl exists.
- **Signals**: meta.json + transcript.jsonl.

### S15 — Resume in Chat refused for non-host

- **Level**: Service
- **Given**: a key whose provider is not in the v1 roster (if the service is called anyway).
- **When**: `resume_chat`.
- **Then**: error; no write.
- **Signals**: `Err`; chats dir unchanged.

### S16 — Resume in TUI argv

- **Level**: Service
- **Given**: Codex session cwd `/tmp/proj`.
- **When**: `resume_tui`.
- **Then**: spawn plan is `codex resume <id>` at that cwd; chats dir unchanged.
- **Signals**: captured spawn args (fake terminal).

### S17 — TUI CLI missing

- **Level**: Service
- **Given**: PATH without `codex`.
- **When**: `resume_tui`.
- **Then**: recoverable error, no panic.
- **Signals**: error string mentions CLI.

### S18 — Virtualization wired

- **Level**: Bun
- **Given**: sidebar and transcript components.
- **When**: tests read source.
- **Then**: `@tanstack/react-virtual` / `useVirtualizer` used in both.
- **Signals**: same pattern as `agent-chat-transcript-window.test.ts`.

### S19 — List does not slurp transcripts

- **Level**: Rust unit
- **Given**: a multi-MB jsonl.
- **When**: `list`.
- **Then**: completes without parsing every line (assert via a hook, max bytes read, or that `parse` was not called).
- **Signals**: unit assert on cheap path.

### S20 — Incremental skip

- **Level**: Service
- **Given**: listed once.
- **When**: list again with unchanged mtimes.
- **Then**: no full re-parse of those files.
- **Signals**: parse counter / mtime skip.

### S21 — Roster is v1 only

- **Level**: Rust unit
- **Given**: default roster.
- **When**: enumerate sources.
- **Then**: only `claude`, `codex`, `opencode`, `pi`, `grok`, `cursor`.
- **Signals**: id set.

### S22 — Naming

- **Level**: Bun / grep in tests
- **Given**: this feature’s new files.
- **When**: scanned for wire names and third-party browser product names.
- **Then**: actions are `host_session_*`; UI copy is Agent Sessions; no third-party product names in identifiers or comments.
- **Signals**: test grep allowlist.

### S23 — Query matches assistant/user text

- **Level**: Service
- **Given**: a fixture session whose title does not contain `unique-body-token` but a user or assistant text part does.
- **When**: `host_session_list` with `query=unique-body-token` after catchup.
- **Then**: that session is in `sessions`; `hits[0].kind` is `user` or `assistant`; snippet contains the token.
- **Signals**: keys + hit fields.

### S24 — CJK substring

- **Level**: Service
- **Given**: a user message containing `你好世界`.
- **When**: query `世界`.
- **Then**: the session is returned.
- **Signals**: hit `session_key`.

### S25 — Tool and think are not searchable

- **Level**: Service
- **Given**: assistant thinking and a tool name/arg that do not appear in visible text.
- **When**: query that tool string.
- **Then**: no hit (or only an unrelated title match).
- **Signals**: empty `sessions` for that token.

### S26 — List does not wait for body catchup

- **Level**: Service
- **Given**: many fixture files.
- **When**: first `list` after empty index.
- **Then**: metadata rows return without requiring every jsonl to be parsed first.
- **Signals**: elapsed vs parse of all files; `search_status` may be `indexing`.

### S27 — Title is indexed without parse

- **Level**: Infra / service
- **Given**: metadata `replace_all` with a distinctive title.
- **When**: FTS/query on that title before body catchup.
- **Then**: the session matches as `kind=title`.
- **Signals**: hit kind.

### S28 — 32KB chunking

- **Level**: Unit
- **Given**: one assistant text longer than 32KiB.
- **When**: extract search docs.
- **Then**: two or more chunks; same `seq` and `message_id`; each `text` ≤ 32768 bytes.
- **Signals**: chunk count and byte lengths.

### S29 — Title row is separate

- **Level**: Infra
- **Given**: one session with title + two text messages.
- **When**: body index written.
- **Then**: one `kind=title` row and two message rows (plus extra chunks if any).
- **Signals**: row counts by kind.

### S30 — Hit locator matches flatten index

- **Level**: Service
- **Given**: S23 fixture.
- **When**: list with query.
- **Then**: `hits[0].seq` is the flatten index of that message; `message_id` equals `messages[seq].id` from `get`.
- **Signals**: get vs hit.

### S31 — Drawer jump wiring

- **Level**: Bun
- **Given**: session search URL helpers and detail view.
- **When**: source is inspected / unit-tested.
- **Then**: href includes `key`, `mid`, `seq`; detail view calls `scrollToIndexRef` after load.
- **Signals**: bun tests.

## Performance & load budgets

- Cheap `list` of a few hundred sessions: < 500ms p50 on local SSD in service tests with fixtures (order of magnitude, not a CI flake gate).
- `get` parses **one** session file.
- Opening the sidebar with 1k+ rows must not create 1k DOM nodes (virtualizer).
- Search catchup must not block the first metadata `list` (M14).
- Each FTS `text` cell ≤ 32KiB.

## Regression checklist

- [ ] `/agents` Atmos chat list still only Atmos chats.
- [ ] Preview never creates `chats/` directories.
- [ ] Second Resume in Chat does not duplicate `persistence_handle`.
- [ ] `chat_id` ≠ `persistence_handle` after import.
- [ ] Empty host home is not a WS error.
- [ ] `CODEX_HOME` pointing at an empty dir does not hide `~/.codex` when the default still has files (env-as-candidate).
- [ ] English labels are not forced uppercase.
- [ ] Workspace left sidebar still works on `/workspace`.

## Exploratory agent-browser checks

Load Agent Browser instructions before running (`agent-browser` skill or `agent-browser skills get core --full`). If missing, use `specs/references/agent-browser-setup.md` and mark `not_run`.

1. Open `/agent-sessions` from Launchpad. Confirm the left sidebar is the session list (not the workspace tree) and the Launchpad item is highlighted.
2. Apply agent filter, then project filter; click a row; confirm the center transcript updates and the sidebar selection stays.
3. Narrow viewport: list still scrolls; resume actions remain reachable; no clipped filter labels.
4. Empty state (no CLIs): copy is readable; no console/WS errors.
5. A tagged **Atmos Chat** row: Resume in Chat does not look like a destructive import.
6. Watch for failed `host_session_*` requests, stuck loading, or overlap with Launchpad.
7. Type a unique phrase from a known session body; confirm the list filters; open the hit and confirm the transcript scrolls to that message.

## Acceptance criteria

- [ ] All Must Have PRD items have at least one passing scenario after test-run.
- [ ] Preview path writes no Atmos chat files.
- [ ] Resume in Chat is idempotent on `persistence_handle`.
- [ ] Resume in TUI does not convert.
- [ ] No new REST endpoints.
- [ ] Virtual lists used for sidebar and transcript.
- [ ] v1 roster only.
- [ ] `atmos-specs-test-run` has updated Coverage Status.
- [ ] `just lint` and scoped `cargo test` / `bun test` on touched packages pass.
- [ ] Search matches user/assistant text and CJK; tool/think text is not indexed.
- [ ] Clicking a non-title hit scrolls the preview to that message.

## Manual verification steps

1. On a machine with real `~/.claude` / `~/.codex` / `~/.grok` data: open Agent Sessions, preview one session per installed v1 CLI.
2. Resume in TUI for Codex or Claude; confirm the CLI attaches the same id.
3. Resume in Chat for a session never opened in Atmos; send a follow-up; confirm the live runtime continues that vendor session.
5. Search a unique sentence from a real transcript; confirm the drawer opens on that turn.

## Non-coverage

- Live format drift of unreleased CLI versions beyond fixtures.
- N2 Cursor IDE Composer, N3 remote hosts, N4 usage, N5 pin overlay, N6 mobile.
- Playwright covering every adapter (fixtures + one smoke enough).

## Coverage Status

Updated 2026-09-17 after APP-075 transcript search (M13–M16).

| Scenario | Status | Evidence |
|----------|--------|----------|
| S3, S9–S10, S18–S21 | pass | `cargo test -p agent --lib session_source` 42 passed (adapters emit `parent_native_id` children; Codex keeps subagent, skips guardian/memory) |
| S4–S8, S11–S17, S23–S26, S28, S30 | pass | `cargo test -p core-service --lib host_session` 27 passed (user/CJK hits, thinking skipped, child locator, title-before-body, list does not wait for parse, 32KB chunk) |
| S27, S29 | pass | `cargo test -p infra --lib host_session` 5 passed (FTS English + CJK, title rows, prune after replace_all, 2-char CJK via `instr` fallback) |
| S1, S2, S18, S22, S31, S32 | pass | bun `agent-sessions-host.test.ts`, locator href/`mid`/`seq`, DetailView `hostSessionMessageIndex` + `scrollToIndexRef`, index progress chip left of Refresh |
| WS catalog | pass | extract/check-actions 336, extract/check-events 36, `@atmos/api-types test` 23 pass |
| Live homes | pass | `ATMOS_LIVE_HOST_SESSIONS=1 cargo test live_default_homes` listed 1683 sessions (claude 121, codex 425, opencode 168, pi 35, grok 796, cursor 138); get `grok:01a0aadd-f485-78e0-980e-a1cf180fbc36` returned 7 messages; Atmos chats dir listing unchanged |
| agent-browser | pass | localhost:3030 `/agent-sessions`: placeholder “Search titles and messages”; query `IMAGE PROTOCOL PROBE` filtered Claude Code 121→1 with body snippet; click opened drawer at `?key=claude:3e916d98-…&mid=04875f1e-…&seq=0` on the matching user turn |
| Live `/ws` | pass | `host_session_list` with `query` via running API; search results and `host_session_index_updated` refetch observed |

Commands: `cargo test -p agent --lib session_source`; `cargo test -p core-service --lib host_session`; `cargo test -p infra --lib host_session`; `bun test apps/web/src/app-shell/__tests__/agent-sessions-host.test.ts …`; `bun run --filter @atmos/api-types check-actions`.
