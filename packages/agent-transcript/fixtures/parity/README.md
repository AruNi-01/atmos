# Parity fixtures

These chats are synthetic. No Computer was connected and nothing here was captured from a live session. Shapes match `AgentMessage` and `AgentChatEvent`. Paths stay under `src/`. There are no home directories, tokens, or private repository names.

`projectParityTree` reads `messages` and optional `cards`. It does not replay `script` and it does not import the mobile fold. Density is compact. Expected trees in `expected/` use default expand (`none`).

`pending: true` on a user message is fixture-only. It is not a wire field. The meta row is the expand key `user-meta:<messageId>`, closed unless that key is opened.

Expand keys:

- `process:<messageId>`
- `group:<messageId>:<toolCallId>`
- `tool:<toolCallId>`
- `thinking:<messageId>:<partIndex>`
- `user-body:<messageId>`
- `user-meta:<messageId>`

`expand: "process"` opens process keys. `expand: "all"` opens every key. A record opens the keys set to true.

A user node sets `expanded: false` when its text is longer than `USER_MESSAGE_COLLAPSE_LINES` (3). A body longer than 10 lines also gets a paste chip (`Pasted: N lines`), the same threshold the composer uses for a plain-text chip.

F4 `script` is the ordered timeline `{ atMs, event }` for a later fold. `messages` are the settled end state: thinking, a read tool, a search tool, then the answer, with `worked_ms` 15000. The events, in order, are thinking `text_chunk`, `tool_call_started` / `tool_call_completed` for read, the same pair for search, two answer `text_chunk`s, then `turn_completed`.

F7 plan document: `presentAgentTool` has no `plan_document` presentation. The part uses kind `plan_document` and an `other` result tagged `{ kind: "markdown" }`, which that function already returns as `markdown`. Image output is result type `images`. Web search is result type `web_search`.

F8 subagent row uses that same presentation kind. A text result is node kind `text`, and the child tools hang under it. The wait row is a completed `TaskOutput` tool with no parent id, so it stays its own process row.
