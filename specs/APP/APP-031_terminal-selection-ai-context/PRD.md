# PRD · APP-031: Terminal Selection AI Context

> Product Requirements · WHAT and WHY. Settled direction for terminal selections as AI Input context and protocol-backed side-chat commands.

## Context

- **Problem**: Terminal users often want to ask about a specific error line, stack trace, or command output range. Today they must copy text manually or use `/side`, which captures implicit terminal context rather than the exact range they selected.
- **Bug**: Terminal AI Input currently treats raw `/side` text as side-chat activation. Pasting prose or logs that contain `/side` can start side mode accidentally.
- **Why now**: Terminal AI Input, APP-030 side chats, and Appshot-style protocol references already exist. Terminal text selection can now become a clear, low-friction context source.
- **Related specs**:
  - [APP-030 Terminal Side Chat](../APP-030_terminal-side-chat/PRD.md)
  - [APP-021 Appshots Cross-App Snapshot](../APP-021_appshots-cross-app-snapshot/TECH.md)

## Goals

1. Let users add the exact selected terminal text to AI Input as explicit context.
2. Let users start a side chat from a selected terminal range without typing `/side`.
3. Make prompt serialization distinguish user-selected context from ordinary prompt text and from bounded terminal capture.
4. Remove raw `/side` command activation from typed, pasted, and resolved prompt text.

## Users & Scenarios

- **Primary persona**: Agentic Builder reviewing terminal output and asking an agent about a specific selected range.
- **Secondary persona**: Workspace reviewer debugging a command failure without polluting the source terminal agent thread.

### Key scenarios

1. A user selects an error block in a terminal and clicks `Add as context`. AI Input opens with a `Selection` chip, and the user asks "what caused this?".
2. A user selects a stack trace and clicks `Side chat for selection`. AI Input opens with the selection context and side mode active, so the question launches a side chat with the normal APP-030 bounded terminal context plus an explicit selected-text context block.
3. A user pastes documentation or logs containing `/side`. The input sends the pasted text normally and does not start a side chat.
4. A user selects `/side` from the terminal slash menu. The composer shows a side chip backed by a protocol token, not a raw `/side` text command.
5. A user deletes the `Selection` chip before submitting. The selected text is not included in the final prompt.

## User Stories

- As a terminal user, I want selected terminal text to become a visible context chip, so that I know exactly what the agent will receive.
- As a terminal user, I want to start a side chat from my selection, so that I can discuss a tangent without sending it to the source terminal.
- As a user pasting code or logs, I want `/side` text to remain plain text unless I selected the command chip, so that pasted content cannot unexpectedly change submit behavior.
- As a reviewer, I want the generated prompt to say that a context block was selected by the user, so that the agent treats it as intentional context.

## Functional Requirements

### Must Have

- **M1 · Terminal selection toolbar**: When a non-empty text range is selected in a terminal pane, Atmos shows a compact toolbar near the selection with two actions:
  - `Add as context`, using the `MessageCircleMore` icon.
  - `Side chat for selection`, using the `MessageCirclePlus` icon.

- **M2 · Add as context**: Clicking `Add as context` snapshots the selected terminal text, normalizes it to plain text, opens/focuses the terminal AI Input, and inserts a removable `Selection` context chip.

- **M3 · Side chat for selection**: Clicking `Side chat for selection` performs the M2 context insertion and also activates side-chat mode through a side command chip. The user can still edit the prompt before submitting.

- **M4 · Explicit selected-context prompt**: When the final prompt is built, every `Selection` chip expands into a clearly labeled context block that says the user selected this terminal text as context. The selected text must not be mixed invisibly into the user's typed prompt.

- **M5 · Protocol-backed side command**: Side-chat activation is represented by a structured composer token, not by raw `/side` text. The side command token serializes as `atmos://side-chat/{context_id}`. Raw `/side` in typed text, pasted text, resolved file content, or attachment output does not activate side chat.

- **M6 · Slash menu compatibility**: Selecting `/side` from the terminal slash menu still works, but it inserts the protocol-backed side chip. Typing `/side` as plain text and submitting without selecting the slash menu command sends ordinary text.

- **M7 · Selection side-chat context**: `Side chat for selection` still uses the APP-030 bounded tmux context capture for the source terminal. When a selected terminal context is present, the generated side chat prompt appends an additional block that clearly says this is the user-selected terminal context. APP-030 bounded tmux capture remains the baseline for all side chats, not a fallback that selection replaces.

- **M8 · Chip management**: `Selection` and side command chips are visible, removable, keyboard-deletable, and included in normal composer text change state. Removing a `Selection` chip removes that selected text from prompt construction.

- **M9 · Privacy and bounds**: Selection context is a click-time snapshot. It is not logged, not persisted to the backend side-chat registry, and is subject to a client-side byte limit with truncation metadata if the selection is too large.

- **M10 · Web/Desktop terminal scope**: The feature works for center-stage terminal panes and Canvas terminal cards in web and desktop. It is out of scope for mobile.

- **M11 · Localization**: Toolbar labels, tooltips, chip labels, prompt metadata labels, and inline errors are localized in every web locale.

### Nice to Have

- **N1 · Selection preview**: Let users inspect the selected text from the `Selection` chip before submitting.
- **N2 · Multiple selection grouping**: Let users collect multiple terminal selections and reorder them before submit.
- **N3 · Keyboard command**: Add a keyboard shortcut to add the current terminal selection as context.

## Out of Scope

- **Backend selection persistence** - selection context is ephemeral composer state in v1.
- **Full terminal transcript preview** - this spec is about explicit selection context, not APP-030 capture preview.
- **Mobile UI** - terminal selection and toolbar ergonomics are web/desktop first.
- **Agent memory capture** - selected terminal text is visible terminal output only, not hidden agent state.
- **REST APIs** - this feature should not add REST endpoints.

## Success Metrics

- **Leading**: Users can create a `Selection` chip from terminal selection without copying text manually.
- **Leading**: `Side chat for selection` launches side chat without writing the selected prompt to the source terminal.
- **Reliability**: Pasted content containing `/side` never starts side mode unless a side chip exists.
- **Quality**: Dogfood reports fewer accidental side-chat launches from pasted logs or docs.

## Risks & Open Questions

- **Risk**: Terminal selections can contain secrets. Selection content must stay client-local until submit and must not appear in logs or registry records.
- **Risk**: Very large selections can exceed prompt budgets. The composer should bound and mark truncation rather than freezing the UI.
- **Risk**: A toolbar near terminal selection can fight terminal copy behavior. Toolbar actions must not clear the selection before taking the snapshot.
- **Decision**: `Side chat for selection` includes the APP-030 bounded terminal capture plus the selected range. The selected range is appended after the captured context so the side chat agent sees both the broader terminal environment and the exact user-selected excerpt.

## Milestones

- **Phase 1 · Structured command and selection context**: Add selection toolbar, `Selection` chips, protocol-backed side command chips, prompt expansion, raw `/side` bug fix, i18n, and focused tests.
- **Phase 2 · Context ergonomics**: Add selection preview, multi-selection ordering, and optional keyboard shortcut if dogfood shows demand.
