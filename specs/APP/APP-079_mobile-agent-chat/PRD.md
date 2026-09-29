# PRD · APP-079: Mobile Agent Chat

> Product Requirements · WHAT and WHY. The phone opens Agent Chat from the lists it already has, and a chat on the phone matches the web chat except the right-hand file directory.

## Context

- **Problem**: After connect, the phone can list workspaces and sessions, then only open a terminal. The Agent Chat a builder already uses on web (draft a chat, stream a reply, see tool cards, pick an agent and a model) is not on the phone.
- **Why now**: The terminal path and the session inbox are in place (APP-077, APP-078). Web Agent Chat already has the transcript, tool UI, and new-chat composer (APP-067, APP-068, APP-069). The phone should join that same chat, not invent a second one.
- **Related specs**: Builds on [APP-077](../APP-077_mobile-terminal-main-path/PRD.md) and [APP-078](../APP-078_mobile-session-inbox/PRD.md) for navigation. Consumes the Agent Chat product in [APP-067](../APP-067_atmos_agent_abs/PRD.md), [APP-068](../APP-068_agent_chat_arch_optimize/PRD.md), and [APP-069](../APP-069_agent_chat_hits_and_session_ops/PRD.md). Does not replace [APP-075](../APP-075_agent-sessions/PRD.md) (CLI session browser). Narrows the “no chat” note in [APP-025](../APP-025_mobile-app/PRD.md) for this path only.

## Goals

1. Primary — From the existing phone lists, opening a workspace or a session enters that workspace’s Agent Chat session list, not the terminal.
2. Primary — Reading and sending a chat on the phone shows the same conversation the web chat shows: streaming text, tool results, permission prompts, and the new-chat composer’s agent, model, and supported options.
3. Secondary — Prompt fields and action buttons feel like the rest of the phone (glass and native controls), while the conversation content stays recognizable next to web.

## Users & Scenarios

- **Primary persona**: A builder who already runs Atmos on a Computer and uses Agent Chat on web, now picking up the phone against that same Computer.
- **Scenario 1**: They tap a workspace on the home list. They see that workspace’s chats and can start a new one. They do not land in a terminal.
- **Scenario 2**: They tap a session in the inbox or a bucket. They land on that workspace’s chat list, then open a chat and watch the reply stream, including tool cards.
- **Scenario 3**: They start New chat, pick an agent and a model, and send. The first send creates the chat and the transcript fills the same way it does on web.
- **Scenario 4**: They compare the open chat with the same chat on web. Messages, tools, and composer choices match. The web file directory on the right is not on the phone.

## User Stories

- As a builder, I want the lists I already use to open chats, so that I do not learn a second home screen.
- As a builder, I want one list of this workspace’s chats, so that I can resume or start one without a desktop sidebar.
- As a builder, I want the phone transcript to match web, so that a tool call or a streamed answer is the same conversation.
- As a builder, I want New chat to offer the same agent, model, and composer options as web, so that I do not get a weaker phone-only agent.
- As a builder, I want the prompt and buttons to match the phone’s other controls, so that chat does not look like a shrunk website.

## Functional Requirements

### Must Have

- **M1**: Workspace home, Session home, Session buckets, and workspace filters keep their current screens and list structure. The tap that opens a workspace or a session no longer opens the terminal.
- **M2**: That tap opens the Agent Chat session list for the row’s workspace. A row with no workspace does nothing. The list shows that workspace’s existing Agent Chats (title, agent, recency) and a New chat action. An empty workspace explains that there is no chat yet and still offers New chat.
- **M3**: Session inbox includes chat sessions as well as the terminal sessions it already lists. APP-078 kept chats hidden until a chat screen existed; that hold ends here. Tapping either kind of row still follows M2 (the workspace chat list, not a terminal, and not a single transcript).
- **M4**: New chat matches the web draft chat: agent choice, model choice, and the option controls web shows for that agent (including thinking, mode, and permission when the agent supports them). The first successful send creates the chat and shows its transcript. Leaving without sending does not create an empty chat.
- **M5**: An open chat matches the web conversation: user and assistant messages, streaming text, tool cards (including command output), permission prompts the user can answer, and the session actions web already offers from the composer (including queue, steer, and stop). Restoring an existing chat shows the history already stored for that chat.
- **M6**: The right-hand file directory from the web workspace is not on the phone. Paths mentioned in a chat stay visible as text. They do not open an editor or a file tree.
- **M7**: The prompt, send, stop, and picker triggers use the phone’s existing native and glass controls (filled inputs, glass action buttons, native sheets or menus). Conversation content follows the web chat’s information and order. Web button chrome, hover rails, and desktop window controls are not copied.
- **M8**: The phone stays a native client of the Computer the app is already connected to. It uses the same Agent Chat conversation web uses. It does not load the website inside the app.

### Nice to Have

- **N1**: When web would show the user-message outline, the phone can jump to those user messages from a native sheet. The web hover rail itself is not required.
- **N2**: Rename and delete on a chat row, if they are one tap away in the web history list.

## Out of Scope

- **Right file directory** — the web sidecar of project files. The phone is too narrow, and this request leaves it out.
- **Code editor, diff viewer, GitHub panel, terminal mosaic** — not part of opening a chat.
- **Removing the terminal renderer** — list navigation stops opening it. This spec does not delete the terminal screen or add a new way to reach it.
- **Host Sessions (APP-075)** — CLI transcript browser, not this Agent Chat.
- **Web or Desktop layout changes** — web chat stays as it is. This spec is the phone client.
- **Embedded website** — a web view of the chat page is not the product.
- **A new mobile locale system** — visible English copy matches the web Agent Chat wording. Adding `zh` waits until the phone has locales.

## Success Metrics

- Leading: from a connected phone, a builder can open a workspace, start New chat, send, and see a streamed reply with a tool card when the agent uses a tool.
- Lagging: the same `chat` opened on web and on the phone shows the same messages and tool outcomes.
- Qualitative: a side-by-side screenshot of an open chat is recognizably the same conversation; the prompt and buttons match the phone’s other glass and filled controls, not the web app chrome.

## Risks & Open Questions

- **Risk**: 1:1 conversation content is a large UI port. Web rendering uses the browser. A phone that matches structure but not font metrics can still fail a pixel screenshot. The bar is the same information, order, and tool treatment, with mobile chrome for controls.
- **Risk**: Inbox rows that are terminals now open the chat list. Builders who used the phone as a terminal will not reach the terminal from these lists. That is the requested path change.
- **Open (TECH)**: which pure chat helpers the phone imports from shared packages, and which display rules are reimplemented in the mobile feature.
- **Resolved forks**:
  - Detail tap opens the workspace chat session list, then a second tap opens one chat (Brainstorm Fork 1).
  - Inbox lists chats and still uses the same list screens (Fork 2).
  - Terminal code stays; these lists no longer navigate to it (Fork 3).
  - Composer options match web for the selected agent, not a reduced agent/model-only form (Fork 5). The right file directory is the cut.

## Milestones

- Phase 1 — M1, M2, M8: lists open the chat session list on the live connection.
- Phase 2 — M4, M5, M6, M7: new chat, transcript, tools, permissions, composer actions, mobile chrome.
- Phase 3 — M3, then N1 and N2 if the transcript path is already solid.
