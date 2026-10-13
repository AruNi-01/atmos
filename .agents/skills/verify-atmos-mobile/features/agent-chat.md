# Agent chat

## Sub-features
- New chat composer (placeholder "Send a message to create a session", "Send"/"Stop" button)
- Model / agent / mode pickers, photo attachments, suggestions
- Thread screen with transcript, queue/steer while busy; chat history ("Chats")

## How to get to it (user POV)
Workspace → chat → new. Route `/workspace/<id>/chat/new`; thread `/workspace/<id>/chat/<chatId>`.

## Driving it with e2e
`tests/agent-chat.e2e.ts`: `device.openLink('atmos://workspace/<id>/chat/new')`, `getByPlaceholder('Send a message to create a session')`, `getByLabel('Send')`, then the sent text in the transcript.

## Proof
The thread shows the message; the new session appears in the Desktop/Web chat list for that workspace and the agent replies.

## Charters
`agent-chat-busy|ios|explorer|Send a message, then try queue, steer and stop while the agent is running, and check the transcript stays consistent.`

## Gotchas
Sends a real prompt to the configured agent (costs tokens). Model list depends on the Computer's providers. iOS Simulator keyboard: see apps/mobile/references/ios-simulator-keyboard.md.
