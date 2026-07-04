# TECH · APP-031: Terminal Selection AI Context

> Technical Design · HOW. Implements PRD APP-031: Terminal Selection AI Context.

## Scope summary

APP-031 adds terminal selection context chips and replaces raw `/side` detection with protocol-backed side command chips. It addresses PRD M1-M11. The implementation is frontend-first and does not require a new database table, REST endpoint, or WebSocket action. Existing APP-030 side chat WebSocket flows remain unchanged for side-terminal creation, registry persistence, and bounded tmux capture. `Side chat for selection` always keeps the APP-030 bounded capture and appends the selected context to the generated prompt.

## Architecture overview

```text
Terminal.tsx selection snapshot
  -> TerminalSelectionToolbar
  -> TerminalAgentInputOverlay composer context registry
  -> PromptComposer protocol chips
  -> resolveTerminalAgentPrompt / side-chat prompt builder
  -> source terminal send OR APP-030 side chat launch
```

The key architectural change is that command intent moves out of plain text:

```text
old: text contains "/side" -> side chat
new: text contains side protocol chip -> side chat
```

Protocol tokens:

```text
atmos://terminal-selection/{context_id}
atmos://side-chat/{context_id}
```

`context_id` is a client-generated opaque id scoped to the current composer instance. It is not a database id and is not expected to survive reload.

## Module-by-module design

### apps/web/src/features/terminal/components/Terminal.tsx

Add terminal selection reporting on top of existing xterm APIs:

- Use `terminal.onSelectionChange` to detect non-empty selections.
- Read the selected text with `terminal.getSelection()`.
- Normalize line endings to `\n`, remove control characters that should not enter prompts, and trim only surrounding empty lines. Do not collapse meaningful whitespace inside the selection.
- Track the most recent pointer-up coordinates inside the terminal viewport as a stable toolbar anchor. If xterm exposes a usable selection range rectangle in the installed version, prefer that rectangle; otherwise anchor the toolbar near the last selection pointer position.
- Expose a callback prop:

```ts
export interface TerminalSelectionSnapshot {
  id: string;
  text: string;
  sourceSessionId?: string | null;
  sourceTmuxWindowName?: string | null;
  selectedAtMs: number;
  lineCount: number;
  byteCount: number;
  truncated: boolean;
  anchor: { x: number; y: number };
}

onSelectionSnapshotChange?: (snapshot: TerminalSelectionSnapshot | null) => void;
```

Selection snapshots are click-time inputs for toolbar actions. They are not continuously bound to future terminal selection changes after the user clicks an action.

### apps/web/src/features/terminal/components/TerminalSelectionToolbar.tsx

Add a feature-local toolbar component rendered inside the terminal surface, not as an app-level modal. It receives the current `TerminalSelectionSnapshot` and two action callbacks.

Controls:

- `Add as context` with `MessageCircleMore`.
- `Side chat for selection` with `MessageCirclePlus`.

Behavior:

- Toolbar is visible only for non-empty selections.
- `pointerdown` / `mousedown` stops propagation so terminal focus and drag logic do not consume the click.
- The snapshot is copied before opening AI Input, because focusing the composer may clear xterm selection.
- The toolbar hides after either action, Escape, selection clear, terminal unmount, or pane switch.

### apps/web/src/features/welcome/components/PromptComposer.tsx

Replace `/side` as a serialized chip token with protocol tokens.

New protocol helpers should live outside the component so they can be tested:

```text
apps/web/src/features/terminal/lib/terminal-ai-context-protocol.ts
```

Suggested helpers:

```ts
export const TERMINAL_SELECTION_PROTOCOL_PREFIX = "atmos://terminal-selection/";
export const SIDE_CHAT_PROTOCOL_PREFIX = "atmos://side-chat/";

export function formatTerminalSelectionProtocol(contextId: string): string;
export function formatSideChatProtocol(contextId: string): string;
export function parseTerminalSelectionProtocolToken(token: string): { contextId: string } | null;
export function parseSideChatProtocolToken(token: string): { contextId: string } | null;
```

PromptComposer changes:

- Update `CHIP_TOKEN_PATTERN` to include terminal selection and side-chat protocol tokens.
- Remove raw `/side` from `CHIP_TOKEN_PATTERN`.
- Render `atmos://terminal-selection/{context_id}` as a chip labeled `Selection`.
- Render `atmos://side-chat/{context_id}` as a chip labeled `Side`.
- Keep the slash menu label `/side` for discoverability, but side command insertion must receive an explicit `contextId` from `TerminalAgentInputOverlay` and insert `formatSideChatProtocol(contextId)` instead of `/side`.
- Change the side mention shape from `{ kind: "side" }` to `{ kind: "side"; contextId: string }`, or add a side-specific insertion method that avoids overloading generic mention insertion.
- Add explicit handle methods for non-slash toolbar insertion:

```ts
insertTerminalSelectionContext(contextId: string): void;
insertSideChatCommand(contextId: string): void;
removeContextToken(contextId: string): void;
```

Paste behavior:

- Plain text paste remains plain text unless it is a supported first-line protocol reference that can be resolved safely.
- Raw `/side` in pasted text is never converted to a chip.
- Pasted `atmos://side-chat/{context_id}` should only become a side chip if the current composer registry already has that `context_id`; otherwise it is inserted as plain text. This prevents stale copied protocol text from activating side mode with missing context.

### apps/web/src/features/terminal/components/TerminalAgentInputOverlay.tsx

Own the composer-local context registry and side command resolution.

Add state:

```ts
type TerminalPromptContext =
  | {
      kind: "terminal_selection";
      contextId: string;
      text: string;
      sourceTmuxWindowName?: string | null;
      sourceSessionId?: string | null;
      selectedAtMs: number;
      lineCount: number;
      byteCount: number;
      truncated: boolean;
    }
  | {
      kind: "terminal_capture";
      contextId: string;
      sourceTmuxWindowName?: string | null;
    };
```

Add imperative handle methods so terminal panes and Canvas terminal cards can drive AI Input:

```ts
addTerminalSelectionContext(snapshot: TerminalSelectionSnapshot): void;
startSideChatForTerminalSelection(snapshot: TerminalSelectionSnapshot): void;
```

Submit behavior:

- Replace `stripSideCommandToken(text)` with `extractSideChatCommand(text)`, which only parses `atmos://side-chat/{context_id}` tokens.
- `isSideCommandActive` must be based on the protocol side chip, not raw `/side`.
- When the user selects `/side` from the slash menu without a terminal selection, create a `terminal_capture` context record and pass its `contextId` to the side command chip. That preserves APP-030 bounded-capture behavior without relying on raw text.
- Before a normal terminal submit, expand all `terminal_selection` context chips into the resolved prompt text.
- Before a side submit, keep the user's typed prompt separate from selected context records and call `onStartSideChat(prompt, agent, runConfig, contexts)`.
- If the side chip references a missing context id, show inline recoverable feedback and do not send text to the source terminal.
- Clearing the composer removes all context records that are no longer referenced by chips.

Prompt expansion format for normal terminal submit:

````text
The user selected this terminal text as context:

Source terminal: {sourceTmuxWindowName}
Selected lines: {lineCount}
Selected bytes: {byteCount}
Selection was truncated: {yes|no}

```text
{selectionText}
```

User prompt:
{typedPrompt}
````

Do not log the expanded prompt outside the existing terminal send path.

### apps/web/src/features/terminal/hooks/use-terminal-side-chats.tsx

Extend `startSideChat` to accept optional context records:

```ts
startSideChat(
  userPrompt: string,
  agent: TerminalPaneAgent,
  runConfig?: TerminalAgentRunConfigInput | null,
  contexts?: TerminalPromptContext[],
): Promise<void>
```

Routing:

- Always call `terminalSideChatApi.captureContext` before creating a side chat. This preserves APP-030's broader terminal context and keeps the side chat agent grounded in the source terminal environment.
- If `contexts` contains a `terminal_selection` referenced by the active side command, append the selected context block after the normal captured terminal context block.
- If no selected context exists, keep the APP-030 behavior and build the side prompt from bounded capture only.
- Side-chat registry records still store metadata only. They must not store selected text.

Add helpers in `apps/web/src/features/terminal/lib/terminal-side-chat.ts`:

```ts
export function buildSideChatPromptWithSelectionContext(args: {
  capture: TerminalSideContextCaptureResponse;
  selectedContexts: Array<TerminalPromptContext & { kind: "terminal_selection" }>;
  sourceTmuxWindowName: string;
  userPrompt: string;
}): string;
```

Prompt wording must preserve the existing APP-030 bounded terminal transcript wording, then add a separate section such as `User-selected terminal context:`. That section must state that the selected text was explicitly chosen by the user and may be more relevant than surrounding capture.

### Terminal pane and Canvas wiring

Files that already mount `TerminalAgentInputOverlay` must pass selection actions through:

- `apps/web/src/features/terminal/components/terminal-mosaic-workspace-pane-window.tsx`
- `apps/web/src/features/terminal/components/terminal-mosaic-scoped-pane-window.tsx`
- `apps/web/src/features/canvas/components/CanvasTerminalCard.tsx`

Each surface already owns an overlay ref. Add the new imperative methods to that ref and pass `TerminalSelectionToolbar` action callbacks to the local `Terminal` instance.

Canvas-specific rules:

- Render the toolbar inside the terminal card/shape subtree.
- Clip the toolbar to the terminal card.
- Do not create a canvas-global floating toolbar.

### i18n

Update every app locale file:

- `apps/web/messages/en.json`
- `apps/web/messages/zh.json`

Suggested namespace: `terminal.agentInput.selectionContext`.

Keys:

- `addAsContext`
- `sideChatForSelection`
- `selectionChip`
- `sideChip`
- `selectionTooltip`
- `sideMissingContext`
- `selectionTruncated`

### Data and security

- No new database schema.
- No new REST route.
- No new WebSocket action.
- Selection text is held in React state until submit or composer clear.
- Do not include selected text in console logs, debug logs, side-chat registry rows, or Tauri events.
- Default maximum selection payload: 64 KiB UTF-8 after normalization. Larger selections are truncated from the middle, preserving the beginning and end with an omission marker.

## Transport

No new transport is required. This spec reuses:

- normal terminal text send for non-side AI Input submit,
- `terminalSideChatApi.captureContext` for every side chat, including `Side chat for selection`,
- APP-030 terminal WebSocket flow for creating and streaming side chat terminals.

## Rollout plan

1. Add `terminal-ai-context-protocol.ts` and unit tests for protocol formatting/parsing and raw `/side` rejection.
2. Update `PromptComposer` token rendering, paste handling, deletion, and slash insertion to use protocol side tokens.
3. Add composer-local context registry and prompt expansion in `TerminalAgentInputOverlay`.
4. Add terminal selection snapshot reporting and `TerminalSelectionToolbar` in center-stage terminal panes.
5. Wire Canvas terminal cards through the same overlay ref and toolbar action path.
6. Extend side-chat prompt builders to append selected context after the APP-030 bounded capture.
7. Add i18n keys, Bun tests, and Playwright coverage.

## Risks & tradeoffs

- **Tradeoff**: Selection context is client-local in v1. This avoids storing sensitive selected text, but selection chips cannot survive reload.
- **Tradeoff**: Raw typed `/side` no longer submits a side chat unless selected from the slash menu. This fixes accidental activation but changes a shortcut some dogfood users may have learned.
- **Risk**: xterm selection anchoring may not expose exact rectangles. The toolbar can use last pointer position as a practical fallback.
- **Risk**: Manual DOM chip rendering is already complex. Protocol helper tests should cover inflate, serialize, paste, and delete behavior before adding more chip types.

## Dependencies & compatibility

- Builds on [APP-030 Terminal Side Chat](../APP-030_terminal-side-chat/TECH.md).
- Uses Appshot-style protocol-token conventions from [APP-021 Appshots Cross-App Snapshot](../APP-021_appshots-cross-app-snapshot/TECH.md).
- Minimum affected runtime: web and desktop builds that include terminal AI Input.

## Open questions

- [ ] Should Phase 2 allow multiple selected contexts in one side chat prompt?
- [ ] Should the slash menu expose side mode as `Side` visually while still letting users type `/side` to find it?
- [ ] Should long selection truncation be configurable next to APP-030 side context budget settings?
