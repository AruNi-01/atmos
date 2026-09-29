# Brainstorm · APP-079: Mobile Agent Chat

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Phone home already lists workspaces and Agent sessions (APP-077, APP-078). Opening a workspace lands on a terminal-session list (`WorkspaceSessionsScreen`); tapping a session row pushes `/workspace/[workspaceId]/terminal`. There is no Agent Chat screen. The inbox model already knows `surface: "chat"` and drops those rows until a chat screen exists.

Web center-stage Agent Chat is the finished product: draft “new chat”, streaming transcript, tool cards, permission and session-op chrome, agent/model/options on the composer. It rides the existing `agent_chat_*` WebSocket contract (APP-067 / APP-068 / APP-069). Mobile must not become a hosted web shell (`apps/mobile/AGENTS.md`).

The request is to keep the list pages, send their detail tap into chat instead of the terminal, and bring the web chat experience onto the phone minus the message outline rail. Composer chrome should use the phone’s existing glass and native controls.

## Goals (draft)

- Primary: from the reused Workspace and Session lists, the detail destination is that workspace’s Agent Chat session list, not the terminal.
- Primary: inside a chat, streaming messages and tool/permission UI match the web Agent Chat transcript. The web message outline rail stays off the phone.
- Primary: New chat matches the web draft composer (agent, model, and the options that composer already exposes) and creates a real Agent Chat on send.
- Secondary: inputs, send/stop, and picker triggers use mobile glass / native controls (`GlassActionButtons`, `NativeTextInput`, native sheets), not web shadcn.
- Non-goal for this brainstorm: delete the terminal renderer, port Center Stage, or add the message outline.

## Options

### Option A — Native chat behind the existing lists
Keep Workspace home, Session inbox, buckets, and filters as they are. Change the tap that currently opens the terminal so it opens a per-workspace Agent Chat session list. That list offers New chat and existing chats. A chat screen reimplements the web transcript and draft composer in React Native, reusing the wire contract and pure fold logic. Buttons and the prompt use mobile glass/native chrome.

**Pros**: Matches the request. One Computer, one chat history, no second protocol. Terminal code can stay off the primary path.
**Cons**: Transcript and tool cards are a large UI port. Web components are DOM-only (virtual list, markdown, portals) and cannot be imported.
**Unknown**: How much of `features/agent/lib` can move to a shared package versus being copied.

### Option B — WebView of the web chat page
Load the existing web Agent Chat route inside the mobile workspace stack.

**Pros**: Pixel match is free, including streaming and tools.
**Cons**: Forbidden as a hosted shell. Auth is device Bearer, not the web cookie. Glass composer and native headers would not be the web page. Hard to skip only the outline rail.
**Unknown**: none worth pursuing; this fights mobile product rules.

### Option C — Full web shell on the phone
Port center tabs, history sidebar, outline rail, find-in-transcript, subagent overlay, and Host Sessions (APP-075) together.

**Pros**: No later parity gap.
**Cons**: The request explicitly skips the outline. Phone width cannot hold the web shell. APP-075 is a different product.
**Unknown**: which overlays are actually required for a usable first chat.

## Key forks in the road

- **Fork 1**: Detail tap opens a chat session list vs opens one transcript immediately — decide in PRD. Request says the detail is the chat session list.
- **Fork 2**: Session inbox keeps hiding `surface: "chat"` vs starts listing chats now that a screen exists — decide in PRD. APP-078 deferred chat rows until this screen.
- **Fork 3**: Terminal route deleted vs left in the app but no longer the list destination — decide in PRD. Request only changes the list tap.
- **Fork 4**: Shared fold/types imported by mobile vs duplicated under `apps/mobile` — decide in TECH.
- **Fork 5**: Composer options parity (thinking, mode, permission, queue, steer, stop, attachments, slash) vs agent + model + send only — decide in PRD. Request says model select, agent select, and the new-chat page; streaming and tool UI are in scope; outline is out.

## Open questions

- [ ] Does a Session inbox row open the workspace chat list, or a specific chat when the row is already a chat? Decide in PRD.
- [ ] Which web composer extras ship in the first phone cut beyond agent, model, streaming, and tool cards? Decide in PRD.
- [ ] Where do mobile strings live? The phone has no `next-intl` tree today. Decide in TECH.

## References

- Existing code: `apps/mobile/src/features/sessions/WorkspaceSessionsScreen.tsx`, `SessionInboxScreen.tsx` (`openSessionRow`), `apps/mobile/app/workspace/[workspaceId]/`
- Web chat: `apps/web/src/features/agent/components/AgentChatPanel.tsx`, `AgentChatTranscriptList.tsx`, `AgentPromptComposer.tsx`, `ChatAgentConfigInput.tsx`; skip `AgentMessageTimelineNav.tsx`
- Wire: `@atmos/api-types` agent chat contract, `@atmos/api-client/agent-chat` fold
- Mobile chrome: `apps/mobile/src/ui/primitives/glass-action-buttons.tsx`, `native-text-input.tsx`, `agents/references/design/mobile.md`
- Related specs: `APP-067_atmos_agent_abs`, `APP-068_agent_chat_arch_optimize`, `APP-069_agent_chat_hits_and_session_ops`, `APP-077_mobile-terminal-main-path`, `APP-078_mobile-session-inbox`, `APP-025_mobile-app`

## Ready to promote

- Promote to PRD: Option A. Reused lists; detail is the workspace Agent Chat session list; transcript matches web without the outline rail; New chat matches the web draft composer; glass/native chrome for inputs and buttons; do not embed the website.
- Promote to TECH: reuse `agent_chat_*` (no new REST); import or extract fold helpers; RN transcript instead of DOM virtualizer/streamdown; native sheets for agent/model; keep terminal modules on disk but off this navigation path.
