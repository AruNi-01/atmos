# Brainstorm · APP-067: Atmos Agent Chat

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Agent Chat today is a second-class overlay (`modal` / `sidebar` / `standalone`). Center-stage New / ⌘N / New Workspace open **Terminal** tabs. History identity is ACP `session/list` + `acp_session_id`. Live chat is `AgentServerMessage` folded into in-memory `ThreadEntry`. Opening a history row always `resumeSession`s and often `session/load`s replay, which is neither ACP-correct nor ChatGPT/Codex-like.

The product goal is a ChatGPT / Codex Chat workspace: Atmos-owned Conversation as the history source of truth, Agent Chat as a New-able center-stage peer to Terminal, ACP as one provider behind a host abstraction. No backward compatibility with the old chat domain, protocol, or data model.

Locked for this spec (from product discussion):

- **Web is Must Have.** Agent Chat becomes a first-class web/desktop center-stage workspace.
- **Mobile is deferred.** Do not block v1 on `apps/mobile`. The API must not paint Mobile into a corner.
- **CLI conversation verbs are Nice to Have.** Reuse the APP-065 envelope later; do not make CLI a v1 gate.

## Goals (draft)

- Agent Chat is a New-able, tabbed, focused center-stage workspace, peer to Terminal — not a floating panel.
- Atmos persists Conversation / Turn / Message / ToolCall / Permission as the chat SOT. Native ACP ids are resume handles only.
- History restore ≠ runtime resume: Get Conversation and render stored messages; resume the provider only when the user continues.
- Composer supports **queue** (next turn) and **steer** (inject into the current turn), with an explicit user policy including an auto-steer mode.
- Clients speak Atmos Conversation + `AgentEvent`, never ACP schema.
- One host protocol for Web now and Mobile/CLI later. No dedicated ACP chat socket.

## Options

### 1. Workspace placement

**A — Keep Chat as overlay.** Plus menu still only New Terminal. Chat stays modal/sidebar.

**Pros**: smallest UI change.
**Cons**: Chat remains a side feature; contradicts the product goal.
**Unknown**: none; this is the status quo.

**B — Center-stage Agent Chat tab, peer to Terminal.** New / plus menu can open Agent Chat. Same tab strip, focus, and split rules as Terminal.

**Pros**: matches how people use ChatGPT / Codex / Cursor; history and runtime live in one workspace; Terminal stays first-class.
**Cons**: tab model, New Workspace, and launcher need a Chat path.
**Unknown**: whether Canvas side-chat and APP-030 terminal side chat stay as-is (likely yes — different surfaces).

**C — Chat replaces Terminal as the only home.** Terminal becomes a tool of Chat.

**Pros**: agent-first narrative.
**Cons**: throws away the current Terminal product; out of scope for this spec.

**Preferred**: B.

### 2. Client ↔ Atmos transport

Two layers must not be confused:

- **Host ↔ Provider** stays ACP JSON-RPC over stdio inside the adapter (Codex/Claude/etc. as they are).
- **Client ↔ Atmos** is the decision. Mainstream products:

| Product | Client ↔ host | Why |
|---|---|---|
| ChatGPT web / Claude.ai | REST + SSE | One-shot send, then one-way token stream. Control is a new HTTP call. |
| OpenAI Responses API | REST + SSE; optional WebSocket mode | SSE for generation; WS when the same socket must carry the next turn without reconnect. |
| Codex app-server | JSON-RPC over stdio (local) or WebSocket (remote) | Bidirectional: approvals, `turn/steer`, `turn/interrupt`, subscribe/unsubscribe. |
| Claude Code IDE | JSON-RPC over WebSocket | IDE and agent both push (diffs, selection, cancel). |
| Cursor Agent | HTTP/2 bidirectional ConnectRPC; SSE fallback | True bidi for tool results mid-stream; enterprises often break HTTP/2, hence SSE fallback. |
| AG-UI | SSE events + HTTP actions | Fine for “watch the agent”; weak for in-turn control. |
| Microsoft AHP | Host sequences ACP and broadcasts envelopes to N clients | Host is a mutex over a 1:1 agent protocol — the role Atmos must play. |

**A — Keep dedicated `/ws/agent/{session_id}`.** Current path. ACP events mapped 1:1.

**Pros**: already streaming.
**Cons**: one socket per ACP session; duplicates APP-049 session kernel; clients stay ACP-shaped; Mobile/CLI inherit the leak.

**B — REST + SSE (ChatGPT web style).** POST send, SSE for deltas, REST for permission/cancel/steer.

**Pros**: simple one-way generation; proxy-friendly.
**Cons**: steer, permission, cancel, and queue dispatch are bidirectional and interleaved; two protocols for one conversation; reconnect is snapshot + new SSE; fights Atmos WS-first + APP-048/049.

**C — Main `/ws` `WsContract` actions + sequenced `agent.event` notifications.** One Computer connection. Actions: create/list/get/send/steer/queue/cancel/permission. Events: `{ chat_id, event_id, sequence, payload }`. History hydrate is a WS snapshot request (Get Conversation), then subscribe from last sequence.

**Pros**: matches Codex/AHP *semantics* without a second RPC dialect; multiplexes many conversations; permission/steer/cancel ride the same channel; Mobile/CLI later reuse the catalog; reconnect is snapshot + sequence; deletes `/ws/agent`.
**Cons**: event journal / sequence must be honest; high-rate deltas need coalescing in TECH.
**Unknown**: whether an extra HTTP GET snapshot helps Mobile cold start later (not v1).

**D — New Codex-like JSON-RPC app-server beside `/ws`.**

**Pros**: copy Codex 1:1.
**Cons**: two RPC styles in one product; APP-048/049 become a side path.

**E — Cursor-style HTTP/2 bidi.**

**Pros**: lowest stream latency.
**Cons**: browsers do not expose this cleanly; Cursor itself falls back to SSE; Atmos already has WebSocket.

**Preferred**: C. WebSocket is the right default for an interactive coding agent (steer, approval, cancel, multi-tab). SSE is the right default for a one-shot chatbot. Atmos is the former. Do not add a second protocol.

### 3. Queue + steer

Today every composer submit is a **client-local queue**. Dispatch waits until the turn is idle, not connecting, and not waiting on permission. There is no in-flight injection.

Busy-composer is three different intents, not one:

| Intent | User meaning | Turn identity | Gold-standard mapping |
|---|---|---|---|
| **Queue** | After you finish, do this next | New turn later | Persist follow-up; dispatch on turn complete |
| **Steer** | Keep going, but take this into account now | Same turn | Codex `turn/steer`: append input, no `turn/started`, no model/cwd/sandbox override, `expectedTurnId` must match |
| **Interrupt** | Stop that | Turn ends cancelled | Codex `turn/interrupt` / ACP `session/cancel`. Stop does not auto-send the draft |

ChatGPT web mostly cannot send while generating (extensions add queues). ChatGPT desktop Goal mode lets follow-ups add constraints while work runs. Codex Chat is the clean model: queue is “next turn”, steer is “same turn, non-interruptive”, interrupt is explicit.

**Steer rules (preferred):**

1. Steer is **non-interruptive injection**. It does not start a turn, does not emit `TurnStarted`, and does not cancel the current model/tool call.
2. The steered text is a user message **inside the current turn** (kind: steer / guidance), visible immediately in the transcript — not a new top-level bubble.
3. The host requires the active `turn_id`. If the turn already completed, steer fails; the client queues or starts a new turn instead of silently attaching to the next one.
4. The agent sees the steer at the **next model step** (after the current tool or completion chunk). Mid-token takeover is interrupt, not steer.
5. Steer does not answer a permission prompt. Permission stays its own control.
6. **Never fake steer** with cancel + new prompt. If the provider cannot inject (typical ACP v1: one `session/prompt` until idle), `supports_steer` is false and the UI only offers Queue / Stop. ACP v2 “prompt contributes to foreground work” may map to steer when the agent accepts a prompt while running — decide per adapter in TECH.
7. Queue remains. Default Enter-while-busy is **Queue** (safe, matches current habit). Steer is an explicit composer action. A per-conversation **Auto-steer follow-ups** policy makes Enter steer while a turn is running, with Queue still a visible secondary. No silent text classifier in v1.
8. Move the queue off the client dialog store onto the conversation so reload / tab switch does not drop follow-ups. The existing dock UX (edit / reorder / delete / pause) stays.

**A — Queue only (status quo).**
**B — Steer only; drop the dock.**
**C — Queue + steer + user policy (preferred).**
**D — Auto-route by heuristic (“looks like a correction”).** Too wrong for v1.

## Key forks in the road

- **Placement**: overlay vs center-stage tab — lock **tab** in PRD.
- **Transport**: dedicated `/ws/agent` vs REST+SSE vs main `/ws` — lock **main `/ws` + sequenced events** in TECH.
- **Busy send default**: Queue vs Auto-steer — default Queue, Auto-steer as a remembered conversation policy; lock in PRD.
- **Queue ownership**: client dock vs conversation-owned pending items — prefer server-owned in PRD.
- **Steer during permission wait**: allow as guidance vs block until resolved — decide in PRD.
- **History chrome**: pin / rename / archive / search in v1 vs list + restore only — decide in PRD.
- **Permission profiles** (Ask / Approve for me / Full access): v1 vs later — decide in PRD.
- **CLI verbs**: this spec vs APP-065 N2 — Nice to Have here, not a v1 gate.
- **Storage shape**: event journal vs row updates — decide in TECH.
- **APP-018 ACP resume/close/capability honesty**: remains adapter-internal after history SOT moves — confirm in TECH.

## Open questions

- [ ] Decide in PRD: exact New / plus-menu / New Workspace entry points for Agent Chat vs Terminal.
- [ ] Decide in PRD: v1 history operations (pin, rename, archive, search, delete).
- [ ] Decide in PRD: permission-profile control in composer for v1, or keep ACP permission dialogs only.
- [ ] Decide in PRD: steer allowed while `requires_action` (permission) is open?
- [ ] Decide in PRD: Auto-steer policy scoped per conversation, per agent, or per user?
- [ ] Decide in TECH: ACP v2 concurrent `session/prompt` → steer mapping vs capability=false.
- [ ] Decide in TECH: delta coalescing and reconnect (`after_sequence` vs full snapshot).
- [ ] Decide in TECH: which new tables vs event log; never `chat_id == acp_session_id`.

## References

- Existing: `apps/web/src/features/agent/**`, `apps/web/src/app-shell/center-stage-tab-model.ts`, `crates/agent`, `apps/api/src/api/ws/agent_handler.rs`, `packages/api-types/src/ws/contract/agent.ts`
- Specs: `APP-004` (ACP process — reuse; chat transport — supersede), `APP-018` (history/identity — supersede), `APP-048` / `APP-049` (main `/ws` — depend), `APP-015` / `APP-022` / `APP-027` (Terminal stays a peer), `APP-024` / `APP-030` (terminal surfaces — out of scope), `APP-065` (CLI envelope — later)
- Source prompt: `IDEA.md` in this directory
- External: [Codex app-server](https://learn.chatgpt.com/docs/app-server) (`thread/read` vs `resume`, `turn/steer`, `turn/interrupt`); [ACP v2 prompt lifecycle](https://agentclientprotocol.com/protocol/v2/prompt-lifecycle); ChatGPT Goal follow-ups; Cursor HTTP/2 + SSE fallback; [AHP × ACP](https://microsoft.github.io/agent-host-protocol/guide/ahp-and-acp.html)

## Ready to promote

- Promote to PRD: center-stage Agent Chat tab; Web Must Have; Mobile deferred; CLI Nice to Have; Conversation SOT; history restore ≠ resume; queue + steer + Auto-steer policy; no backward compat; supersedes APP-018 history identity and APP-004 chat transport; Terminal remains a peer; APP-024/030 out of scope.
- Promote to TECH: main `/ws` conversation actions + sequenced `agent.event`; delete dedicated `/ws/agent`; `AgentProvider` / `AgentEvent` / projector; ConversationId ≠ ProviderPersistenceHandle; steer as non-interruptive same-turn inject with `turn_id` match; capability-gated adapter mapping; server-owned queue; reconnect via snapshot + sequence.
