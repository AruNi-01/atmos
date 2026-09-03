# Slice examples

## Good: contract first, then parallel disjoint files

TECH defines `ChatSessionId` and `ws` action names, but types are not in the repo yet.

| ID | Wave | Owns |
|----|------|------|
| S0 | 0 serial | `packages/api-types/src/ws/dto/agent-chat.ts`, `contract/agent-chat.ts` |
| S1 | 1 | `crates/agent/src/session/**`, `apps/api/src/api/ws/agent_chat*.rs` |
| S2 | 1 | `apps/web/src/features/agent/lib/**` (excludes `messages/*.json`) |
| S3 | 2 serial | `apps/web/messages/en.json`, `apps/web/messages/zh.json` |

S1 and S2 cannot run in parallel before S0 lands. S3 is a hot file — always its own wave.

## Bad: “layer” split with shared files

| Slice | Wrong Owns |
|-------|------------|
| “Backend” | `crates/agent/**` |
| “Frontend” | `apps/web/**` |

Too broad. `apps/web/**` includes locale, stores, unrelated features. If both briefs say “add a WS field,” both will touch `packages/api-types`.

## Bad: two writers on one module

S1 `Owns`: `agent-chat-events.ts`  
S2 `Owns`: `agent-chat-thread.ts` with brief “also extend the event union”

S2 will edit S1's file → last-write-wins. Put the union in Wave 0, or give that file only to S1.

## Good: review checklist is logic, not “is the code nice”

Lead checklist for S2:

1. After reconnect, does resume use `resumeToken` per TECH, not full replay?
2. Empty transcript uses PRD empty state, not a spinner?
3. No edits outside Owns to `AgentChatPanel.tsx`?

Bad checklist: “readability, naming, React idioms” — that becomes style review.

## Good: BLOCKED instead of inventing defaults

TECH silent on whether permission failure is a `WsEvent` or tool result. Impl returns:

```text
STATUS: BLOCKED
QUESTION:
A) New WsEvent `agent_permission_denied` (needs api-types; not in Owns)
B) Tool result `error` field (Owns only)
Missing: one sentence in TECH §Events
```

Bad: pick B and ship while another slice builds the client for A.

## Dispatch shape (parent session, multiple Tasks in one message)

Parallel wave: dispatch only slices that passed Owns collision check. Each Task:

- `subagent_type`: `generalPurpose`
- `model`: `inherit` (unless HUMAN names another)
- Prompt includes full brief + “read `impl.md` / `review.md` first”
- Do not write “continue our earlier discussion”
