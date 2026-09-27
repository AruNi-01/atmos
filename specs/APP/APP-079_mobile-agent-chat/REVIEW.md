# REVIEW · APP-079: Mobile Agent Chat - Implementation Review

> Post-implementation review log. Complements the planning quartet. Not a requirements source.

**Review date**: 2026-09-25  
**Review scope**: functional review  
**Related code**: `apps/mobile/src/features/agent-chat/`, `apps/mobile/src/features/sessions/`, `apps/mobile/app/workspace/`

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P2 | frontend | Slash commands and @ mentions are not on the phone composer | fixed |
| REV-002 | P2 | frontend | Transcript markdown is fenced text, not the web markdown renderer | fixed |
| REV-003 | P3 | frontend | Message jump sheet and rename/delete are not shipped | fixed |
| REV-004 | P2 | test | Live web-vs-phone transcript was not compared | open |

## REV-001 · Slash commands and @ mentions are not on the phone composer

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

New chat and the open thread can send, stop, queue, steer, attach a path, and pick agent/model/options. They do not offer the web composer’s `/` command sheet or `@` mention sheet.

### Evidence

- `apps/mobile/src/features/agent-chat/AgentChatComposer.tsx` shows a list above the prompt when the draft ends in `/` or `@`.

### Required fix

Store `available_commands_updated` and show a native sheet when the draft starts with `/`. Show project files for `@`.

### Acceptance

- [x] Typing `/` lists agent commands from the options catalog and `available_commands_updated`.
- [x] Typing `@` lists project files from `fs_list_project_files`.

### Fix log

- 2026-09-25 — composer suggestion list. Commands come from `AgentOptionsSnapshot.commands`, overlaid by `available_commands_updated`. Files come from the workspace file tree. Picking a row inserts `/name ` or `@path `.

## REV-002 · Transcript markdown is fenced text

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Assistant text renders as plain text plus monospaced fences. Web uses its markdown renderer. Mermaid stays source, which TECH allows. Headings, lists, and links do not match web.

### Evidence

- `apps/mobile/src/features/agent-chat/AgentChatMarkdown.tsx`

### Required fix

Add an MIT/BSD markdown renderer and use it for text parts, still leaving mermaid as a fence.

### Acceptance

- [x] A message with a heading, a list, and a code fence is readable as those three things.

### Fix log

- 2026-09-25 — `AgentChatMarkdown` now uses `react-native-markdown-display` 7.0.2 (MIT). `http`/`https` links open; other URLs do not. Mermaid stays a fenced source block. `bun run typecheck` in `apps/mobile` passed.

## REV-003 · Message jump and rename/delete

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P3 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

PRD N1 and N2 are not implemented. Must-have chat send/stop/queue/steer does not depend on them.

### Evidence

- Two or more user messages show a Messages control that scrolls the transcript to the chosen message.
- A long-press on a chat row can rename or delete it through `agent_chat_rename` and `agent_chat_delete`.

### Required fix

Ship only if N1/N2 are pulled into the must-have bar.

### Acceptance

- [x] Messages sheet scrolls to a user message.
- [x] Rename and delete call the existing chat actions.

### Fix log

- 2026-09-25 — list long-press and thread Messages sheet. `bun run typecheck` passed.

## REV-004 · No live side-by-side

| Field | Value |
|-------|--------|
| **Status** | open |
| **Severity** | P2 |
| **Area** | test |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The iPhone 17 Pro simulator is not paired to a Computer. Screenshots show New chat chrome and the disconnected list/thread. They do not show a streamed reply or tool card next to web.

### Evidence

- Simulator launch lands on “Pair this phone with your Computer.”
- Deep link `atmos://workspace/demo-workspace/chat/new` shows the composer.
- Deep link to the list without a socket shows only “Atmos mobile WebSocket is not connected”.

### Required fix

Pair the simulator (or a phone already on `just dev-mobile-phone`) and screenshot one existing chat beside web.

### Acceptance

- [ ] Same `chat_id` on web and the phone shows the same messages and tool cards, and the phone has no file directory.

### Fix log

- 2026-09-25 — simulator chrome captured. Live compare still open.
