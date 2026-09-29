# TECH · APP-079: Mobile Agent Chat

> Technical Design · HOW. Implements PRD APP-079: Mobile Agent Chat.

## Scope summary

Phone-only client for the Agent Chat that web already runs. Addresses M1–M8. N1 (message jump sheet) and N2 (rename/delete) ship in the last rollout step if the transcript path is green; they are not a reason to block M1–M8.

No new tables, no new `WsAction`, no REST, no changes under `apps/web` or `crates/`. The right file explorer (`FileTreePanel` in `apps/web/src/app-shell/workspace-center-frame.tsx`) is not ported (M6). `apps/mobile/app/workspace/[workspaceId]/terminal.tsx` and `src/features/terminal/` stay on disk and lose their list entry points (M1).

## Architecture overview

```
apps/mobile  (routes, RN screens, glass composer)
    → existing MobileWsClient.request / subscribeMessages
        → @atmos/api-types AgentChatContract + agent_chat_event
        → @atmos/api-client/agent-chat fold (createPartStore, applyTextChunk, applyToolCall, …)
            → apps/api + crates already serving web
```

Touched apps: `apps/mobile` only. Shared packages are imported, not extended, unless a typecheck shows a mobile-safe export is missing. Do not import `apps/web` or `@workspace/ui`.

## Decisions

- **Reuse the wire.** List, create-on-first-send, subscribe, backfill, send, steer, queue, cancel, permission, session-op, configure, and options all go through `WsContract` rows already in `packages/api-types/src/ws/contract/agent-chat.ts`. Mobile adds wrappers in `apps/mobile/src/api/ws-actions.ts` only.
- **Own the hook.** Do not port `apps/web/src/features/agent/hooks/use-agent-chat-session.ts`. A mobile hook in `src/features/agent-chat/` calls the wrappers and folds `agent_chat_event` with `@atmos/api-client/agent-chat`. Web remains the behavior reference for when to create, subscribe, and send.
- **RN transcript, web information.** `FlatList` plus a small markdown view. Tool kind and card body follow `apps/web/src/features/agent/lib/agent-tool-kind.ts` and `components/tool-results/` as a spec of what to show, reimplemented under `src/features/agent-chat/`. Copying a pure function into mobile is allowed; importing the web file is not.
- **Mobile chrome.** Prompt is `NativeTextInput`. Send, stop, and the row of composer actions use `GlassActionButtons` / Expo UI glass buttons. Agent, model, thinking, mode, and permission open native sheets fed by `agent_options_get`, showing only options the snapshot marks supported (APP-068).
- **Scope id.** The route param `workspaceId` is whatever the home list already pushes (`WorkspaceHomeEntry.id`). Resolve `kind` from the bootstrap the home list uses. `kind: "workspace"` → `workspace_id`. `kind: "project"` → `project_id`. Create uses that same scope plus the workspace `localPath` or project `mainFilePath` as `cwd`.

## Module-by-module design

### crates / apps/api / apps/web

No edits. Rollback of a bad phone build does not require a server flag.

### packages

- Import `@atmos/api-types` DTOs (`AgentChatIndexEntry`, `AgentMessage`, `AgentPart`, `AgentChatEvent`, `AgentOptionsSnapshot`, `AgentChatPrefs`) and `@atmos/api-client/agent-chat` fold helpers.
- Do not add a new package. Do not add oRPC.

### apps/mobile routes (M1, M2, M4)

| Route | Screen |
| --- | --- |
| `app/workspace/[workspaceId]/index.tsx` | Replace `WorkspaceSessionsScreen` with the chat session list |
| `app/workspace/[workspaceId]/chat/new.tsx` | Draft New chat. No `agent_chat_create` until the first send succeeds, then `replace` to `chat/[chatId]` |
| `app/workspace/[workspaceId]/chat/[chatId].tsx` | Transcript + composer for one chat |
| `app/workspace/[workspaceId]/terminal.tsx` | Unchanged. No list navigates here |

Navigation edits, and nowhere else in the terminal feature:

- `src/features/sessions/SessionInboxScreen.tsx` `openSessionRow`: push `/workspace/[workspaceId]` with `workspaceId` only. Drop the `terminal` param.
- `src/features/workspaces/WorkspaceHomeList.tsx` already pushes `/workspace/${entry.id}`. Leave that path; the index screen is now the chat list.
- Remove the “new terminal” action from the workspace index header. The list header action is New chat → `chat/new`.

`WorkspaceSessionsScreen.tsx` becomes unused by routes. Delete it only if nothing else imports it. Do not keep a second list that still creates terminals.

### Session inbox rows (M3)

`src/features/sessions/session-inbox.ts` currently skips `snapshot.surface !== "terminal"`. Allow `terminal` and `chat`. Keep the same row component (`session-row-list.tsx`). A chat row still opens the workspace chat list (M2), not `chat/[id]`. Update `session-inbox.test.ts` and `scoped-session-rows` tests for the new surface.

### Feature folder

`apps/mobile/src/features/agent-chat/`:

- `copy.ts` — English strings. Wording matches `apps/web/messages/en.json` under `Agent.workspace` and `Agent.components` for the controls this UI shows. No `next-intl` in mobile.
- `ws.ts` — thin wrappers over `wsActions` (or call `wsActions` directly).
- `use-agent-chat-list.ts` — `agent_chat_list` for the resolved scope. Rows: title (fallback “New chat”), `provider_id`, `updated_at`. Hide `deleted`. Paginate with `cursor` when `limit` is not enough.
- `use-agent-chat-thread.ts` — one live chat:
  1. `agent_chat_subscribe` then `agent_chat_messages` (or `agent_chat_get` if messages are empty and the snapshot carries them — prefer `agent_chat_messages` for history).
  2. `subscribeMessages` in this hook, filter `type === "notification"` and `event === "agent_chat_event"` and `chat_id` match. Do not put chat state into `MobileWsProvider`; that provider already filters terminal titles only.
  3. Fold each `AgentChatEvent.payload` with `createPartStore` / `applyTextChunk` / `applyToolCall` / `applyPartClosed`. Map the store into `AgentMessage[]` for the list.
  4. On blur/unmount, `agent_chat_unsubscribe`.
- `use-new-chat.ts` — load `agent_options_get` + `agent_chat_prefs_get`. Hold the draft in component state. On send: `agent_chat_create` with scope, `cwd`, `provider_id`, and the selected option fields, then `agent_chat_send`, then navigate. Failed create leaves the draft on screen.
- `AgentChatSessionListScreen.tsx` — large-title `AppScreen`, reused list row visuals (`session-row-list` patterns, not a new design system). Empty copy + New chat.
- `AgentChatThreadScreen.tsx` — `FlatList` of messages, inverted or stick-to-bottom. Streaming row updates in place.
- `AgentChatComposer.tsx` — shared by new and thread. `NativeTextInput`. Glass send. While the turn is busy, glass stop calls `agent_chat_cancel`. Queue and steer use the same prompt: queue → `agent_chat_queue_add`; steer → `agent_chat_steer` with the current `turn_id`.
- `AgentChatOptionSheet.tsx` — native sheet for agent, model, thinking, mode, permission. Options come from `AgentOptionsSnapshot`. Unsupported controls are omitted, not disabled lookalikes.
- `AgentChatToolCard.tsx` — one card per tool part. Kind switch mirrors web `ToolView` (command output, file edit, search hits, generic). Command output is a monospaced block, not an xterm and not `TerminalScreen`.
- `AgentChatPermissionCard.tsx` — `agent_chat_permission_respond`.
- `AgentChatSessionOpCard.tsx` — `agent_chat_session_op_respond` for the fork/rewind chrome web shows above the prompt.
- `tool-kind.ts` — pure classifier + unit test. Port the decision table from `apps/web/src/features/agent/lib/agent-tool-kind.ts`.

Attachments (M5): the composer can attach a Computer path chosen with the existing `fs_list_dir` / `fs_search_dirs` flow, sent as `attachment_paths` on `agent_chat_send`. No phone photo library. No file tree sidebar.

Mention and slash (part of “the rest of the composer”): a native sheet lists the same `@` path suggestions and `/` commands the web composer would show for this agent. Data comes from existing chat/registry actions the web hook already calls. If a command needs a web-only UI (opening the editor), show the command result in the transcript and do not navigate to an editor (M6).

Markdown: add `react-native-markdown-display` if its license is MIT or BSD. Confirm before `bun add`. Do not vendor it. Skip `NOTICE` for a normal registry dependency. Do not use a GPL markdown package. Code fences render as monospaced scroll blocks. Mermaid and other web-only embeds render as their source fence, not a diagram.

N1: a header menu “Messages” opens a sheet of user-message previews and scrolls the `FlatList`. Do not port `AgentMessageTimelineNav.tsx`.

N2: row context menu calls `agent_chat_rename` / `agent_chat_delete`.

### Header and glass

Follow `agents/references/mobile/native-navigation.md` and `agents/references/design/mobile.md`. Titles via `Stack.Screen`. New chat and send/stop are glass or native header items, not a custom bar inside the scroll view. Dark mode inputs use the existing filled `NativeTextInput`, not a web border.

## Data model

No new persisted types. Runtime draft:

```ts
type MobileChatDraft = {
  scope: { workspace_id: string } | { project_id: string };
  cwd: string | null;
  provider_id: string;
  model: string | null;
  thinking: string | null;
  mode: string | null;
  permission_mode: string | null;
  fast: string | null;
  context: string | null;
  text: string;
};
```

Prefs round-trip through `agent_chat_prefs_get` / `agent_chat_prefs_set` (`AgentChatPrefs`). Do not add AsyncStorage keys for agent or model; the Computer already stores `last_registry_id` and `last_new_chat_configs`.

## Transport

No new actions. Mobile calls, with the DTO fields above:

- `agent_chat_list`, `agent_chat_create`, `agent_chat_messages`, `agent_chat_subscribe`, `agent_chat_backfill`, `agent_chat_unsubscribe`
- `agent_chat_send`, `agent_chat_steer`, `agent_chat_queue_add`, `agent_chat_queue_update`, `agent_chat_queue_reorder`, `agent_chat_queue_delete`, `agent_chat_cancel`
- `agent_chat_permission_respond`, `agent_chat_session_op_respond`, `agent_chat_configure`
- `agent_options_get`, `agent_chat_prefs_get`, `agent_chat_prefs_set`
- `agent_chat_rename`, `agent_chat_delete` for N2

Live updates: notification event `agent_chat_event`, payload `AgentChatEvent` (`packages/api-types/src/ws/event-contract.ts`). Ignore events for other `chat_id`s.

Create invariant: New chat does not call `agent_chat_create` until send. Subscribe starts after create returns `chat_id`, or immediately on the thread route.

REST: none.

## Security & permissions

Same device Bearer and Computer WebSocket as the rest of mobile. Do not log prompts, tool output, or attachment paths. Do not put credentials into any WebView. The transcript is not a WebView (M8). Tool output may contain secrets the agent printed; show it on screen the way web does, and do not write it to `logs/debug`.

## Rollout plan

1. **Nav and inbox.** Retarget list taps, swap the workspace index to an empty chat-list shell, allow `chat` rows. Terminal route still builds.
2. **List and draft.** `agent_chat_list`, prefs, options, New chat screen, create-on-send, land on the thread route. Thread can show a loading history.
3. **Transcript.** Subscribe, messages, fold, streaming text, stick to bottom.
4. **Tools and prompts.** Tool cards, permission cards, session-op cards, stop / queue / steer, attachments.
5. **N1, N2, and screenshot pass.** Message sheet, rename/delete, then simulator shots against a web chat of the same `chat_id`.

Steps 1–4 are the Must Have bar. Each step typechecks with `bun --filter @atmos/mobile typecheck`.

## Risks & tradeoffs

- **Risk**: folding events differently from web desyncs the transcript. Mitigation: use `@atmos/api-client/agent-chat` only, and fixture-test a recorded `agent_chat_event` sequence against expected message text.
- **Risk**: `use-agent-chat-session.ts` hides ordering bugs (subscribe vs backfill). Mitigation: the mobile hook’s order is fixed in this doc; do not “clean it up” mid-port.
- **Tradeoff**: duplicate the tool-kind table in mobile instead of extracting a package, so this spec does not churn web imports. If the table is wrong, web stays the source to diff.
- **Tradeoff**: mermaid stays a code fence. Diagram layout is not the 1:1 bar; message text and tool cards are.
- **Rollback**: revert the mobile navigation change. Server chats are untouched. Terminal route still exists.

## Dependencies & compatibility

- Depends on APP-067 / APP-068 / APP-069 wire and on the phone already connecting (APP-077).
- APP-078 inbox filter changes here; web sidebar session view does not.
- Minimum server: whatever already serves `agent_chat_*` to web. No CLI version pin.
- New npm dependency only for markdown, license-checked at add time.

## Open questions

None for product scope. Implementation must not invent a second chat protocol if a web helper is hard to call; stop and match the action names in this doc.
