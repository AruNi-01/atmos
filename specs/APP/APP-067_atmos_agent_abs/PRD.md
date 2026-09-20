# PRD · APP-067: Atmos Agent Chat

> Product Requirements · WHAT and WHY. Settled direction for Agent Chat as a first-class Atmos workspace: Conversation is the history source of truth, Chat is a center-stage peer to Terminal, and ACP is only a provider behind the host.

## Context

- **Problem**: Agent Chat is a second-class overlay. New / plus / New Workspace open Terminal. History is ACP `session/list` keyed by `acp_session_id`. Opening a past chat always resumes the agent and often replays ACP events into an in-memory thread. A workspace can host several chats, but there is no Chat-first list of Atmos conversations.
- **Why now**: The product is promoting Agent Chat to a primary workspace, on par with Terminal, with ChatGPT / Codex Chat behavior. Backward compatibility with the old chat domain, protocol, and data model is not a goal.
- **Related specs**:
  - **Supersedes** `APP-018_acp-protocol-upgrade` history and identity (ACP `session/list` + `acp_session_id` as durable chat identity).
  - **Supersedes** `APP-004_local-agent-integration-acp` chat domain and dedicated agent chat transport. Reuses APP-004 process launch, stdio ACP, permission, tool, and registry capabilities as the first provider.
  - **Depends on** `APP-048_api-types` and `APP-049_api-client` (main `/ws` catalog and session kernel). How the wire is shaped is TECH.
  - **Does not replace** `APP-015` / `APP-022` / `APP-027` — Terminal remains a peer workspace.
  - **Out of this spec's product scope**: `APP-024_terminal-agent-run-config`, `APP-030_terminal-side-chat`.
  - **Later**: `APP-025_mobile-app` UI; `APP-065` CLI conversation verbs.

## Goals

1. **Primary** — Users can start, list, restore, continue, and steer Agent Chat as a first-class workspace, not a floating extra.
2. **Primary** — Atmos owns Conversation history. Opening a past chat shows stored messages immediately. The native agent resumes only when the user continues.
3. **Primary** — One Agent Chat product on Web: center-stage tab, Chat-first conversation list, and standalone window. Clients never think in ACP sessions.
4. **Secondary** — Queue and steer feel like Codex Chat: next-turn vs same-turn guidance, under a global user setting (default Queue).
5. **Secondary** — Mobile and CLI can later consume the same Conversation contract without a second chat model.

## Users & Scenarios

- **Primary persona**: Agentic Builder working in a Project or Workspace on Web / Desktop, running coding agents through Atmos.
- **Secondary persona**: The same user opening a second Chat window, or returning later to yesterday's conversation without wanting the agent process to wake up just to read it.

### Key scenarios

1. **New Chat as a workspace**: From the center-stage plus menu, empty launcher, or New Workspace, the user opens Agent Chat the same way they open Terminal. ⌘N still toggles New Workspace.
2. **Chat-first list**: With several Chats in a workspace, the user opens a conversation list grouped by working directory, finds the right Atmos conversation, and opens it.
3. **Read vs continue**: Selecting a history row renders stored messages. The agent process is not resumed until the user sends, steers, or otherwise continues.
4. **Busy composer**: While a turn is running, Enter follows the user's global follow-up setting (Queue by default, or Steer). The other action stays available as a one-shot. Stop does not send the draft.
5. **Second window**: The user pops a Chat into a standalone window and keeps working in the original workspace.

## User Stories

- As an Agentic Builder, I want Agent Chat as a New-able center-stage workspace, so that chatting with an agent is as first-class as a Terminal tab.
- As an Agentic Builder, I want a Chat-first list of Atmos conversations grouped by working directory, so that I can find a chat without hunting through tabs.
- As a user returning to work, I want past messages to appear from Atmos history, so that reading a chat does not boot or resume the agent.
- As a user continuing a chat, I want the host to resume the provider only then, so that the agent still has its runtime context.
- As a user talking to a busy agent, I want to queue the next turn or steer the current one, so that I can correct course without waiting or killing the turn.
- As a user, I want Queue vs Steer as a global setting (default Queue) that applies to every Agent Chat, so that I am not re-picking the policy on each conversation.
- As a user who wants another window, I want standalone Agent Chat, so that I can keep a conversation visible beside the main workspace.
- As a user switching agents, I want Atmos conversations and provider sessions to stay distinct, so that a native ACP id is never the chat's identity.
- As an Agentic Builder, I want to choose model and thinking depth before the agent process starts, so that the first turn already runs the model I picked.

## Functional Requirements

### Must Have

- **M1 — Center-stage Chat tab**: Agent Chat is a center-stage tab kind, peer to Terminal (same tab strip, focus, and split). It is not only a modal overlay.
- **M2 — New entry points**: The plus menu has New Agent Chat next to New Terminal. The empty center launcher can start Agent Chat. New Workspace can start Agent Chat. ⌘N remains New Workspace (not a dedicated New Chat hotkey).
- **M3 — Conversation identity**: Every chat has an Atmos Conversation id. That id is the UI, history, and list identity. A native ACP / provider session id is only a resume handle and must not equal the Conversation id.
- **M4 — Atmos history SOT**: Atmos persists conversation metadata, turns, messages (including structured parts such as text, thinking, tool calls, plan, errors), permissions, and attachments needed to render Chat. Storage is Atmos-owned files (not ACP history and not `atmos.db` chat tables). Reloading the app restores Chat from those files, not from ACP replay.
- **M5 — History restore ≠ runtime resume**: Opening a conversation from the list or a tab shows stored messages immediately. The host must not start or resume the native agent solely because the user opened history. Resume happens when the user continues (send, steer, or an equivalent continue action).
- **M6 — Chat-first conversation list**: Agent Chat keeps a history sidebar as the Chat-first catalog. It lists Atmos conversations, grouped by working directory (`cwd`), and can create a new conversation from that list. This is the missing first-person Chat index for a workspace that already allows multiple chats.
- **M7 — v1 list operations**: Users can open (restore), rename, and delete conversations. The list stays usable while more pages load. Pin, archive, and search are not required in v1.
- **M8 — Continue after restore**: When the user continues a restored conversation, Atmos attaches or resumes the provider session for that conversation when a handle exists, or starts a provider session if none does. The user must never see a new conversation silently substituted for the one they opened.
- **M9 — Idle send starts a turn**: With no running turn, sending from the composer starts a new turn on that conversation.
- **M10 — Queue**: Follow-ups can be queued for after the current turn. The queue belongs to the conversation (survives reload and tab switch). Users can edit, reorder, delete, and pause queued items.
- **M11 — Steer**: Users can inject guidance into the **current** turn without starting a new turn and without interrupting the in-flight model/tool call. Steered text appears in that turn's transcript as user guidance. Steer requires an active turn; if the turn already finished, the host must not attach the text to a later turn. Agents that cannot inject expose no Steer action (Queue and Stop still work). Steer must not be faked by cancel-and-resend.
- **M12 — Follow-up setting (Queue vs Steer)**: Queue vs Steer is a user setting, not a per-conversation switch. Default is **Queue**. The setting is global and applies to every Agent Chat in the Atmos session. Enter during a running turn follows this setting; the other action remains a visible one-shot so a single message does not require flipping the setting. No silent text classifier.
- **M13 — Interrupt**: Stop cancels the current turn. It does not send the composer draft. After stop, Enter starts a new turn.
- **M14 — Permission stays its own control**: Tool approval is not queue and not steer. While a permission prompt is open, queued next-turns wait; steer is allowed as guidance for remaining work and must not answer the prompt.
- **M15 — Host-owned chat model**: Web UI renders Conversation / Turn / Message. It does not import ACP schemas or infer tool types from raw ACP payloads.
- **M16 — Standalone window**: Users can open Agent Chat in a standalone window (`/agent-chat` today) and work there against the same Atmos conversations.
- **M17 — Web / Desktop only for v1 UI**: v1 ships the Web app (including Desktop hosting it). The contract must not hard-code Web-only identity, but Mobile UI is not a v1 surface.
- **M18 — No compatibility with the old chat domain**: Old ACP-keyed history, dedicated agent-chat socket messages as the chat model, and replay-driven restore are not product behavior after this spec. Existing local ACP session rows may be discarded.
- **M19 — Pre-spawn model catalog**: Before the host spawns the agent process, the user can pick a model (and thinking depth when that agent supports it) from a unified Atmos catalog. Entering the app starts a background prefetch of catalogs for every user-enabled agent. Cache lasts hours. Strategies include CLI discovery, local config files, and a temporary ACP session that reads model/mode config. Missing thinking support is omitted, not faked.

### Nice to Have

- **N1 — History chrome**: Pin, archive, and search over Atmos conversations.
- **N2 — CLI**: `atmos` conversation / chat verbs on the APP-065 envelope, using the same host contract.
- **N3 — Mobile UI**: Same Conversation product on `apps/mobile` in a later spec.
- **N4 — Composer permission profiles**: Ask for approval / Approve for me / Full access (Codex-style). v1 keeps explicit per-request permission UI.
- **N5 — Canvas / automation embed**: The same Agent Chat bound to a Conversation, not a second protocol. Not a v1 layout goal.
- **N6 — Command palette New Agent Chat** if plus menu and launcher already cover the habit.

## Out of Scope

- **Mobile screens** — deferred until Mobile is a real product surface; do not block v1.
- **CLI as a v1 gate** — Nice to Have only.
- **Replacing Terminal** — Terminal stays a first-class center-stage workspace.
- **APP-024 terminal agent run-config** — builtin terminal-agent launch settings are unchanged.
- **APP-030 terminal side chat** — tmux `/side` chats are a different surface.
- **Floating modal as the primary Chat host** — center-stage tab + conversation list + standalone window replace it. Keep the list and standalone; do not keep Chat as a global floating panel.
- **Migrating ACP `session/list` rows into Atmos history** — no users to preserve; start from Atmos Conversation.
- **Pixel-level ChatGPT / Codex visual clones** — match the interaction model (restore vs resume, queue vs steer vs interrupt), not skins.
- **Implementing third-party agents** — Atmos hosts them.
- **Silent heuristic routing of follow-ups** — user policy only.
- **Pin / archive / search** — N1, not Must Have.
- **Permission profiles** — N4, not Must Have.

## Success Metrics

- **Leading**: A user can New Agent Chat from plus menu, launcher, or New Workspace and get a focused center-stage Chat tab.
- **Leading**: Opening a listed conversation shows Atmos-stored messages with no provider resume until the user continues.
- **Leading**: Busy composer follows the global Queue/Steer setting (default Queue), with a one-shot for the other action; Stop does not send.
- **Leading**: Conversation list is grouped by `cwd` and supports rename + delete on Atmos conversations.
- **Lagging**: Agent Chat is used as a workspace beside Terminal, not only as a leftover overlay.
- **Qualitative**: Users describe history as "Atmos chats grouped by folder", not "whatever ACP listed last time".

## Risks & Open Questions

- **Risk**: People look for the old floating Chat. Center-stage + list + standalone must be easier to find than the overlay was.
- **Risk**: Many ACP agents cannot steer. The UI must degrade to Queue / Stop without pretending injection happened.
- **Risk**: Conversation list and tab strip both show chats. The list is the catalog; tabs are open work. Empty/duplicate states need care in implementation, not a second identity model.
- **Risk**: Grouping by `cwd` is less useful when many chats share one workspace path. Rename is the v1 escape hatch; search is N1.
- **Locked**: Follow-up policy is a global user setting (default Queue), not per conversation.
- **Locked**: Steer is allowed while a permission prompt is open, as guidance only.
- **Open for TECH**: Provider mapping for steer (capability vs ACP v2 concurrent prompt). Event sequence, reconnect, and persistence shape. How APP-018 resume/close/capability honesty remains adapter-internal.

## Milestones

- **Phase 1** — Conversation identity + Atmos persistence + restore-without-resume + Chat-first list (cwd groups, rename, delete) + center-stage New Agent Chat + pre-spawn model catalog.
- **Phase 2** — Live turn streaming on the host event model; permission; queue as conversation-owned pending turns; standalone window on the same contract.
- **Phase 3** — Steer + global Queue/Steer setting (default Queue); interrupt vs queue vs steer made obvious in the composer.
- **Phase 4** — Optional N1 chrome, N2 CLI, N4 permission profiles; Mobile later under APP-025.
