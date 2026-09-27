# PROGRESS · APP-079: Mobile Agent Chat

> Implementation Progress · current state, handoff notes, blockers, and verification status. This file is not a requirements source.

## Status

- **State**: in_progress
- **Branch**: current worktree
- **Last updated**: 2026-09-25
- **Current owner**: lead agent
- **Current phase**: mobile client

## Snapshot

- Spec quartet is written: `BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`.
- Next: S0 pure chat contract and hooks, then parallel UI slices.
- Blocked: nothing.
- Do not edit `apps/web`, `crates/`, or `packages/api-types`. Do not delete the terminal route.

## Implementation Checklist

- [ ] S0 chat contract, pure helpers, hooks
- [ ] S1 list navigation and session list screen
- [ ] S2 transcript, tools, permissions
- [ ] S3 composer and new chat
- [ ] S4 glue (AGENTS.md, markdown dep if still missing)
- [ ] Review
- [ ] Bun tests and simulator screenshots

## Progress Log

### 2026-09-25

- Wrote APP-079 brainstorm, PRD, TECH, and TEST.
- Dispatched S0.

## Decisions Since TECH

| ID | Decision | Why | Source update |
|----|----------|-----|---------------|
| D1 | None yet | TECH is the source of truth | — |

## Verification Status

| Area | Command / Method | Last result | Notes |
|------|------------------|-------------|-------|
| Mobile unit | `cd apps/mobile && bun test src/features/agent-chat` | not_run | S0 |
| Mobile typecheck | `cd apps/mobile && bun run typecheck` | not_run | after slices |
| Simulator | iOS simulator screenshots vs web | not_run | after UI |

## Known Blockers

- [ ] None

## Handoff Notes

### Task goal

Phone lists open a workspace Agent Chat session list. Transcript and new-chat composer match web Agent Chat except the right file directory. Controls use mobile glass and native inputs.

### Current progress

S0–S8 implemented. Simulator screenshots exist for New chat and the disconnected list. Live web compare, slash commands, and richer markdown are still open (REVIEW.md).

### Completed work

Spec documents only.

### Key decisions

No new WebSocket actions. Mobile hook folds `agent_chat_event` with `@atmos/api-client/agent-chat`. Create happens on first send.

### Next steps

Collect S0, review it, then dispatch S1–S3 in parallel.

## Slice Kanban

> Orchestration board for `atmos-long-task-impl`. Not a requirements source.

| ID | Wave | Owns | Forbids | Depends | Status | Impl | Review | Verify |
|----|------|------|---------|---------|--------|------|--------|--------|
| S0 | 0 | chat contract, helpers, hooks | web, crates, screens | — | done | ok | pass | bun test agent-chat + typecheck pass |
| S1 | 1 | inbox + workspace index + session list screen | S0 files, terminal feature, thread/composer | S0 | in_progress | running | — | bun test sessions + typecheck |
| S2 | 1 | thread route + transcript + tool cards | S0 files, composer files, inbox | S0 | in_progress | running | — | typecheck |
| S3 | 1 | new-chat route + composer + option sheet | S0 files, transcript, inbox | S0 | in_progress | running | — | typecheck |
| S4 | 2 | `apps/mobile/AGENTS.md`, `apps/mobile/package.json` only if markdown still missing | feature screens | S1 S2 S3 | planned | — | — | typecheck |

**Status**: `planned` · `ready` · `in_progress` · `blocked` · `in_review` · `rework` · `done`

## Slice Cards

### S0 — Chat contract and hooks

- **Wave**: 0
- **Goal**: Mobile can call existing `agent_chat_*` actions and fold events into messages. No screens.
- **Out of scope**: Routes, React Native screens, markdown dependency, inbox filter, terminal files.
- **Owns**: paths in the kanban row.
- **Forbids**: everything else.
- **Reads (read-only)**: `packages/api-types/src/ws/dto/agent-chat.ts`, `packages/api-types/src/ws/contract/agent-chat.ts`, `packages/api-client/src/agent-chat/fold.ts`, `apps/web/src/features/agent/lib/agent-tool-kind.ts`, `apps/mobile/src/api/mobile-ws-client.ts`, `apps/mobile/src/providers/MobileWsProvider.tsx`, `apps/mobile/src/features/workspaces/workspace-home-list.ts`, `apps/mobile/src/features/workspaces/WorkspaceListScreen.tsx`, `specs/APP/APP-079_mobile-agent-chat/TECH.md`.
- **Depends**: —
- **Invariants**: no new WsAction; no REST; create-on-send order; ignore other chat ids; deleted list rows hidden; null title becomes “New chat”; thinking control omitted when the snapshot has no thinking support; paths are display text with no editor route.
- **Verify**: `cd apps/mobile && bun test src/features/agent-chat && bun run typecheck`
- **Review checklist**: action names match TECH; fold uses api-client only; create failure does not send; foreign events do not change text; scope uses workspace_id vs project_id.
- **HUMAN open questions**: none

### S1 — Lists open the chat session list

- **Wave**: 1
- **Goal**: M1–M3. Inbox includes chat rows. Taps open the workspace chat list. Index screen lists chats.
- **Out of scope**: transcript rendering, composer, new-chat submit UI.
- **Owns**: `apps/mobile/src/features/sessions/session-inbox.ts`, `session-inbox.test.ts`, `SessionInboxScreen.tsx`, `scoped-session-rows.ts`, `scoped-session-rows.test.ts`, `WorkspaceSessionsScreen.tsx` (delete if unused), `apps/mobile/app/workspace/[workspaceId]/index.tsx`, `apps/mobile/src/features/agent-chat/AgentChatSessionListScreen.tsx`.
- **Forbids**: S0 files, `terminal.tsx`, `src/features/terminal/**`, S2/S3 files.
- **Depends**: S0
- **Invariants**: no `terminal` param; row without workspace does not navigate; chat and terminal surfaces both list; other surfaces still drop.
- **Verify**: `cd apps/mobile && bun test src/features/sessions && bun run typecheck`
- **Review checklist**: openSessionRow target; surface filter; index does not mount TerminalScreen.
- **HUMAN open questions**: none

### S2 — Transcript

- **Wave**: 1
- **Goal**: M5, M6. Open chat shows messages, streaming, tool cards, permission and session-op cards. No file tree. No WebView.
- **Out of scope**: composer internals, inbox, session list.
- **Owns**: `apps/mobile/app/workspace/[workspaceId]/chat/[chatId].tsx`, `apps/mobile/src/features/agent-chat/AgentChatThreadScreen.tsx`, `AgentChatTranscript.tsx`, `AgentChatToolCard.tsx`, `AgentChatPermissionCard.tsx`, `AgentChatSessionOpCard.tsx`, `AgentChatMarkdown.tsx`.
- **Forbids**: S0 files except import, S1 files, S3 files, `package.json` (markdown import only if S4 already added it; otherwise render fenced text without a new dependency and note that in the report).
- **Depends**: S0
- **Invariants**: FlatList; stick to bottom; tool kind from `tool-kind.ts`; paths are text; cards call the thread hook’s respond methods.
- **Verify**: `cd apps/mobile && bun run typecheck`
- **Review checklist**: no WebView; no FileTree; no @workspace/ui; permission respond wired.
- **HUMAN open questions**: none

### S3 — Composer and new chat

- **Wave**: 1
- **Goal**: M4, M7. New chat draft, first send creates, glass send/stop, native option sheet.
- **Out of scope**: transcript cards, inbox.
- **Owns**: `apps/mobile/app/workspace/[workspaceId]/chat/new.tsx`, `apps/mobile/src/features/agent-chat/AgentChatNewScreen.tsx`, `AgentChatComposer.tsx`, `AgentChatOptionSheet.tsx`.
- **Forbids**: S0/S1/S2 files except importing them.
- **Depends**: S0
- **Invariants**: NativeTextInput; GlassActionButtons or Expo UI glass for send/stop; no Radix; unsupported options omitted; failed create stays on the draft screen.
- **Verify**: `cd apps/mobile && bun run typecheck`
- **Review checklist**: create-on-send uses `use-new-chat`; prompt is NativeTextInput; sheet not a web dropdown.
- **HUMAN open questions**: none

### S4 — Docs and markdown dependency

- **Wave**: 2
- **Goal**: Mobile AGENTS product shape mentions Agent Chat as the list destination. Add MIT/BSD markdown renderer only if S2 still needs it.
- **Owns**: `apps/mobile/AGENTS.md`, `apps/mobile/package.json`, lockfile only if the dependency is added.
- **Depends**: S1 S2 S3
- **Invariants**: do not import @workspace/ui; do not add GPL.
- **Verify**: `cd apps/mobile && bun run typecheck`
- **Review checklist**: AGENTS no longer says the only workspace surface is the terminal; license is MIT or BSD.
- **HUMAN open questions**: none
