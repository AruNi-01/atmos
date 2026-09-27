# TEST · APP-079: Mobile Agent Chat

> Test Plan · how we verify the phone opens Agent Chat from existing lists and matches the web conversation without the file directory. References PRD APP-079 and TECH APP-079.

## Test strategy

Deterministic checks live in Bun tests next to the mobile helpers (navigation target, inbox surface filter, tool-kind table, event fold → message text). There is no new server behavior, so no Rust or Playwright suite. The web app is not modified.

- Unit / integration: `bun test` under `apps/mobile` for pure helpers and inbox mapping.
- Service-level: not used. `agent_chat_*` already ships for web.
- WebSocket/API-level: not a new contract. A Bun fixture feeds recorded `agent_chat_event` payloads through `@atmos/api-client/agent-chat` and asserts the text the transcript would render.
- End-to-end (Playwright): none. This spec does not change `apps/web`, and mobile has no Playwright harness.
- Exploratory agent-browser: not the phone. `agent-browser` does not drive the Expo simulator. Use it only if a web reference screenshot of the same chat is needed and the web app is already running. Record `not_run` when the CLI is absent.
- Manual: iOS simulator (and Android if a dev build is already installed) for the visual pass the request asks for. Automation cannot screenshot the native glass composer against web.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2 |
| M2 | S3, S4 |
| M3 | S5, S6 |
| M4 | S7, S8 |
| M5 | S9, S10, S11 |
| M6 | S12 |
| M7 | S13, S14 |
| M8 | S15, S16 |
| N1 | S17 |
| N2 | S18 |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Bun test | `bun test` | `apps/mobile` session navigation test | workspace id, no terminal id | pushed pathname is the workspace index; params have no `terminal` | planned |
| S2 | Bun test | `bun test` | same navigation test | session row without workspace id | no navigation call | planned |
| S3 | Bun test | `bun test` | chat list mapping test | `AgentChatIndexEntry` list with one deleted row | visible rows show title, provider, recency; deleted hidden | planned |
| S4 | Manual | iOS simulator | open a workspace with zero chats | connected Computer | empty copy and a New chat control; route is not `terminal` | planned |
| S5 | Bun test | `bun test` | `session-inbox.test.ts` | snapshots with `surface` terminal and chat | both become rows | planned |
| S6 | Bun test | `bun test` | inbox open helper | chat row and terminal row, same workspace | both target `/workspace/[workspaceId]` only | planned |
| S7 | Bun test | `bun test` | new-chat submit helper | draft text + options, create not yet called | create payload matches scope/cwd/provider/options; send follows create | planned |
| S8 | Bun test | `bun test` | new-chat submit helper | create returns an error | send is not called; draft text kept | planned |
| S9 | Bun test | `bun test` | fold fixture test | ordered `agent_chat_event` text chunks | one assistant message with the concatenated text | planned |
| S10 | Bun test | `bun test` | tool-kind test | representative tool names from web’s kind table | each maps to the same card kind web uses | planned |
| S11 | Manual | iOS simulator | open an existing chat that already has a tool call | same `chat_id` as web | history visible; a new streamed reply appends; stop control appears while busy | planned |
| S12 | Bun test | `bun test` | path presentation helper | tool result containing a repo path | path string kept; helper does not return an editor route | planned |
| S13 | Manual | iOS simulator | focus the composer in light and dark | connected Computer | prompt is the filled native field; send/stop are glass buttons | planned |
| S14 | Bun test | `bun test` | option-sheet filter | `AgentOptionsSnapshot` missing thinking | thinking control omitted | planned |
| S15 | Bun test | `bun test` | action wrapper list | static inventory | wrappers only name actions in TECH Transport; no new REST path | planned |
| S16 | Manual | iOS simulator | send a message with the web app closed on this phone | device session already connected | transcript updates from `agent_chat_event`; no WebView of the website | planned |
| S17 | Manual | iOS simulator | chat with two user messages | N1 implemented | Messages sheet scrolls to the second user message | planned |
| S18 | Bun test | `bun test` | rename/delete payload helper | chat id + title | payloads match `agent_chat_rename` / `agent_chat_delete` | planned |

## Scenarios

### S1 — Happy path: a session row does not open the terminal

- **Level**: Bun test
- **Given**: a session row with `workspaceId` set and a terminal candidate id.
- **When**: the inbox open helper builds the navigation.
- **Then**: the pathname is the workspace route and the params do not include `terminal`.
- **Signals**: pathname `/workspace/[workspaceId]`; `terminal` absent.

### S2 — Edge: a row with no workspace does not navigate

- **Level**: Bun test
- **Given**: a session row with `workspaceId` null.
- **When**: the open helper runs.
- **Then**: it does not push a route.
- **Signals**: zero navigation calls.

### S3 — Happy path: the workspace list is chats

- **Level**: Bun test
- **Given**: `agent_chat_list` items, one with `deleted: true`, one with a null title.
- **When**: rows are mapped for the scope.
- **Then**: the deleted item is absent; the null title uses the New chat label; provider and timestamp remain.
- **Signals**: row count, title fallback, `provider_id`, `updated_at`.

### S4 — Edge: workspace with no chats

- **Level**: Manual
- **Given**: a connected Computer and a workspace whose chat list is empty.
- **When**: the builder opens that workspace from home.
- **Then**: they see the empty chat copy and New chat, on the workspace index, not the terminal screen.
- **Signals**: empty-state text, New chat control, route name is not `terminal`.

### S5 — Happy path: inbox keeps terminal rows and adds chat rows

- **Level**: Bun test
- **Given**: status snapshots for `surface: "terminal"` and `surface: "chat"`, plus one other surface.
- **When**: inbox rows are built.
- **Then**: terminal and chat rows exist; the other surface is still dropped.
- **Signals**: row surfaces in the result.

### S6 — Edge: both inbox kinds open the chat list

- **Level**: Bun test
- **Given**: one chat row and one terminal row for the same workspace.
- **When**: each is opened.
- **Then**: both navigations are the workspace chat list with the same workspace id.
- **Signals**: identical pathname and `workspaceId`.

### S7 — Happy path: first send creates, then sends

- **Level**: Bun test
- **Given**: a draft with scope, cwd, provider, model, and text; create has not been called.
- **When**: submit runs and create returns a `chat_id`.
- **Then**: create payload carries that scope and options; send uses the new id and the draft text; navigation target is `chat/[chatId]`.
- **Signals**: ordered calls `agent_chat_create` then `agent_chat_send`; route params.

### S8 — Failure: create fails

- **Level**: Bun test
- **Given**: the same draft, and create rejects.
- **When**: submit runs.
- **Then**: send is not called and the draft text is unchanged.
- **Signals**: send call count 0; text still present.

### S9 — Happy path: streamed text becomes one message

- **Level**: Bun test
- **Given**: a part store and two `agent_chat_event` text chunks for one assistant part.
- **When**: the fold applies them in order.
- **Then**: the transcript model has one assistant message whose text is the concatenation.
- **Signals**: message count 1; text equals both chunks joined.

### S10 — Edge: tool cards follow the web kind table

- **Level**: Bun test
- **Given**: tool names that web classifies as command, edit, search, and generic.
- **When**: the mobile classifier runs.
- **Then**: kinds match the web table for those names.
- **Signals**: kind string per tool name.

### S11 — Failure: stop while a reply is streaming

- **Level**: Manual
- **Given**: an open chat whose agent is still streaming.
- **When**: the builder taps stop.
- **Then**: the client issues cancel for that chat id and the busy indicator clears when the event stream says the turn ended.
- **Signals**: `agent_chat_cancel` for that `chat_id`; stop control leaves.

### S12 — Happy path: a path does not open an editor

- **Level**: Bun test
- **Given**: a tool result that includes an absolute repo path.
- **When**: the card model is built.
- **Then**: the path is display text and the model has no editor or file-tree route.
- **Signals**: path string present; route field absent.

### S13 — Happy path: composer chrome is the phone’s

- **Level**: Manual
- **Given**: New chat and an open chat, light mode and dark mode.
- **When**: the composer is focused.
- **Then**: the field matches other filled mobile inputs; send and stop match existing glass buttons; agent and model open a sheet, not a web dropdown.
- **Signals**: screenshots of the composer next to an existing mobile form (settings or create workspace) and next to the web composer of the same chat.

### S14 — Edge: unsupported thinking is hidden

- **Level**: Bun test
- **Given**: an options snapshot with no thinking support.
- **When**: composer controls are derived.
- **Then**: thinking is not in the control list; model still is when models are non-empty.
- **Signals**: control ids.

### S15 — Happy path: no new protocol

- **Level**: Bun test
- **Given**: the mobile chat action wrapper module.
- **When**: its exported action names are listed.
- **Then**: every name is in the TECH transport list and none is an HTTP path.
- **Signals**: string set equality with the TECH list.

### S16 — Failure: events for another chat are ignored

- **Level**: Bun test
- **Given**: a thread subscribed to chat A.
- **When**: an `agent_chat_event` arrives for chat B.
- **Then**: chat A’s message text is unchanged.
- **Signals**: message text before and after.

### S17 — Nice: jump to a user message

- **Level**: Manual
- **Given**: N1 is implemented and the chat has at least two user messages.
- **When**: the builder picks the second user message from the Messages sheet.
- **Then**: that message is brought into view.
- **Signals**: list scroll position at that message id.

### S18 — Nice: rename payload

- **Level**: Bun test
- **Given**: a chat id and a new title.
- **When**: the rename helper builds the request.
- **Then**: the action is `agent_chat_rename` with that id and title.
- **Signals**: action name and payload fields.

## Performance & load budgets

- Applying one streamed text chunk does not replace the whole screen’s data source identity in a way that jumps the list to the top. Stick-to-bottom stays at the bottom while the builder has not scrolled up.
- No budget on first-token latency; that is the Computer and the model.

## Regression checklist

- [ ] Workspace home, Session home, buckets, and filters still render their existing lists.
- [ ] Terminal route module still typechecks; no list passes a `terminal` param.
- [ ] Inbox still drops surfaces other than `terminal` and `chat`.
- [ ] Prompts and tool output are not written to debug logs.
- [ ] A failed create does not leave a thread route with an empty id.
- [ ] `bun --filter @atmos/mobile typecheck` passes.

## Exploratory agent-browser checks

The phone UI is verified on the simulator, not with `agent-browser`. If a side-by-side needs a live web shot and `agent-browser` is installed, load its skill (or `agent-browser skills get core --full`) and open the web chat for the same `chat_id`. If the CLI is missing, mark that web shot `not_run` and use the simulator plus a manual web window instead. Do not treat either screenshot as a substitute for S1–S16 Bun tests.

## Acceptance criteria

- [ ] S1–S16 are covered at the level in the execution map, except manual rows which have simulator notes in Coverage Status.
- [ ] S4, S11, S13, and S16 have simulator evidence (screenshot or written observation of route, streaming, glass controls, and no WebView).
- [ ] A side-by-side of one open chat against web shows the same messages and tool cards, and does not show the file directory.
- [ ] No new REST route and no new `WsAction`.
- [ ] `bun --filter @atmos/mobile typecheck` passes.
- [ ] Mobile Bun tests for this feature pass.

## Manual verification steps

1. Boot the iOS simulator with the mobile dev client connected to a Computer that already has an Agent Chat.
2. From Workspace home, open a workspace. Confirm the chat list, not the terminal.
3. Open New chat, choose agent and model, send, and confirm the transcript streams.
4. Open the same chat on web. Compare messages and tool cards. Confirm the phone has no file directory.
5. Screenshot the phone composer and an existing glass/filled mobile control. Confirm they match each other more than they match web chrome.
6. Toggle dark mode and repeat the composer check.
7. If an Android dev build is already installed, repeat steps 2–4. If it is not installed, record that gap. Do not block on a from-scratch Android setup.

## Non-coverage

- Server persistence, auth, and provider adapters (existing web chat tests).
- Mermaid or other diagram layout (TECH renders the fence source).
- Pixel-identical fonts with web markdown.
- Reaching the terminal from these lists (intentionally removed).
- Web or Desktop session inbox behavior.

## Coverage Status

- S1, S2 — covered by `apps/mobile/src/features/agent-chat/navigation.test.ts`. `bun test src/features/agent-chat src/features/sessions` → 46 pass.
- S3, S5, S6 — covered by `list-rows.test.ts` and `session-inbox.test.ts` (chat surface kept, other surfaces dropped, both open the workspace route).
- S7, S8, S9, S10, S12, S14, S15, S16, S18 — covered by `new-chat-submit.test.ts`, `fold-transcript.test.ts`, `tool-kind.test.ts`, `path-display.test.ts`, `option-controls.test.ts`, `actions.test.ts`, `foreign-event.test.ts`, `rename.test.ts`.
- S4, S11, S13, S17 — manual. Simulator (iPhone 17 Pro, not paired): S4/S13 screenshots show the chat list error when the socket is down, and New chat with a filled prompt plus glass Attach / Queue / Steer / Send. S11 streaming and S17 message jump were not run. No side-by-side with a live web chat, because this simulator has no Computer session.
- agent-browser — `not_run`. Phone checks used `xcrun simctl` screenshots, not agent-browser.
