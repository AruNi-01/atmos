# REVIEW · APP-022: Canvas Terminal New Tab - Implementation Review

> Post-implementation review log for functional completeness, architecture, maintainability, code size, testability, and follow-up fixes. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: 2026-06-02  
**Review scope**: functional review + quality review  
**Related code**: `apps/web/src/features/canvas/components/CanvasTerminalCard.tsx`, `apps/web/src/features/terminal/store/use-terminal-store.ts`, `apps/web/src/features/terminal/store/terminal-store-types.ts`, `apps/web/src/features/terminal/components/TerminalGrid.tsx`

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After code implementation reaches review or post-review and the findings need durable tracking before cleanup. |
| **Entry id** | `REV-NNN` - zero-padded, monotonic in this file (next: **REV-003**). |
| **Status** | `open` -> `in_progress` -> `fixed` -> `verified` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH/TEST content; link to baseline docs and record only review findings plus fix status. |
| **Fix proof** | Each fixed item should name the code change and the verification command or manual check. |

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P1 | frontend | New tab can be lost when the canvas terminal context is not already hydrated | verified |
| REV-002 | P2 | test | No APP-022 test covers the click-to-create canvas workflow | verified |

---

## REV-001 · New tab can be lost when the canvas terminal context is not already hydrated

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The `New Terminal` action creates the terminal tab before navigating to the shape's project/workspace route, but the terminal store helper only receives `workspaceId` and does not ensure that the target context is loaded or that project/workspace persistence is selected before the tab is created. When a user clicks a canvas terminal whose context is not already hydrated in the terminal store, the newly created tab can remain unsaved and then be overwritten by the subsequent route-level backend load.

This is an inference from the source flow, not a manually reproduced browser trace.

### Evidence

- `specs/APP/APP-022_canvas-terminal-new-tab/PRD.md:10` - requires creating the new terminal in the same project or workspace context as the current canvas terminal.
- `specs/APP/APP-022_canvas-terminal-new-tab/TECH.md:11` - says the action should create a center-stage terminal tab for `shape.props.workspaceId`.
- `apps/web/src/features/canvas/components/CanvasTerminalCard.tsx:274` - calls `createTerminalTabWithInitialPane(shape.props.workspaceId)` before routing to the shape context.
- `apps/web/src/features/canvas/components/CanvasTerminalCard.tsx:394` - only after the tab and shape are created does the handler route to `/project` or `/workspace`.
- `apps/web/src/features/terminal/store/use-terminal-store.ts:136` - `createTerminalTabWithInitialPane` accepts only `workspaceId`; it cannot pass `shape.props.contextScope` or force context hydration.
- `apps/web/src/features/terminal/store/use-terminal-store.ts:713` - `saveToBackend` skips saving when `loadedWorkspaces` does not contain the workspace/project id.
- `apps/web/src/features/terminal/store/use-terminal-store.ts:527` and `apps/web/src/features/terminal/store/use-terminal-store.ts:558` - the later backend load rewrites `workspaceTerminalTabs` from persisted layout or the fixed default tab.

### Required fix

Make the APP-022 creation path context-aware and deterministic for both already-loaded and not-yet-loaded contexts. The handler should use `shape.props.contextScope` to ensure the terminal store has loaded the target workspace/project with the correct persistence API before creating the tab, or move the create operation behind a store action that atomically loads, creates, activates, and schedules persistence for the correct context.

### Acceptance

- [x] Clicking `New Terminal` on a canvas terminal for a workspace/project that is not the current center-stage context still leaves the new terminal tab visible and active after route navigation.
- [x] Project-level canvas terminals persist through `projectLayoutApi`, and workspace-level terminals persist through `workspaceLayoutApi`.
- [x] The created canvas shape keeps `sourceTerminalTabId` pointing at the visible created tab.
- [x] A regression test covers the not-yet-hydrated context path.

### Fix log

- 2026-06-02 - Review opened; no fix landed yet.
- 2026-06-02 - Fix started; making center-stage tab creation context-aware before canvas routing.
- 2026-06-02 - Fixed by making `createTerminalTabWithInitialPane` async/context-aware in `apps/web/src/features/terminal/store/use-terminal-store.ts`; it now hydrates the requested project/workspace context before creating a tab and refuses to create an unsaved tab if hydration fails.
- 2026-06-02 - Verified with `bun --cwd apps/web typecheck`, targeted `eslint`, and `bun test apps/web/src/features/canvas/__tests__/canvas-terminal-new-tab.test.ts apps/web/src/features/canvas/__tests__/canvas-terminal-pin.test.ts apps/web/src/features/canvas/__tests__/canvas-terminal-placement.test.ts apps/web/src/features/canvas/__tests__/canvas-terminal-rendering.test.ts apps/web/src/features/terminal/store/__tests__/terminal-store-new-tab.test.ts`.

---

## REV-002 · No APP-022 test covers the click-to-create canvas workflow

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | test |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

APP-022 adds a multi-step UI/store/tldraw workflow, but there is no dedicated test that exercises the new `New Terminal` action or the frame/source-tab outcomes required by the spec. Existing canvas tests cover lower-level pin, placement, and rendering helpers, so regressions in the new component-level orchestration can pass the current test gate.

### Evidence

- `specs/APP/APP-022_canvas-terminal-new-tab/TEST.md:5` - requires click-to-create behavior for the same context.
- `specs/APP/APP-022_canvas-terminal-new-tab/TEST.md:6` - requires the new card to link back through `sourceTerminalTabId`.
- `specs/APP/APP-022_canvas-terminal-new-tab/TEST.md:7` and `specs/APP/APP-022_canvas-terminal-new-tab/TEST.md:8` - require both in-frame and no-existing-frame canvas organization behavior.
- `apps/web/src/features/canvas/components/CanvasTerminalCard.tsx:259` - the new orchestration lives inside a React click handler, which makes the behavior hard to verify without a component test or extracted helper.
- Current related tests are `canvas-terminal-pin.test.ts`, `canvas-terminal-placement.test.ts`, and `canvas-terminal-rendering.test.ts`; none exercise `CanvasTerminalCard`'s `New Terminal` click path.

### Required fix

Add focused coverage for the APP-022 action. A pragmatic path is to extract the pure tldraw/store orchestration behind the button into a small helper and test:

- already-in-frame -> new canvas terminal is reparented into the existing frame;
- no frame -> a new frame is created and both shapes are reparented;
- frame naming uses workspace display name fallback and project name for project context;
- `sourceTerminalTabId` matches the created center-stage tab;
- unloaded context regression from REV-001.

### Acceptance

- [x] APP-022 has a dedicated automated test for the new terminal action or an extracted helper with equivalent behavioral coverage.
- [x] Existing pin-to-canvas and canvas terminal rendering tests still pass.
- [x] `bun --cwd apps/web typecheck` passes.

### Fix log

- 2026-06-02 - Review opened; no fix landed yet.
- 2026-06-02 - Fix started; extracting the new-tab canvas orchestration behind the toolbar action for focused tests.
- 2026-06-02 - Fixed by extracting `apps/web/src/features/canvas/lib/create-related-canvas-terminal.ts` and adding `apps/web/src/features/canvas/__tests__/canvas-terminal-new-tab.test.ts` plus `apps/web/src/features/terminal/store/__tests__/terminal-store-new-tab.test.ts`.
- 2026-06-02 - Verified with `bun --cwd apps/web typecheck`, targeted `eslint`, and `bun test apps/web/src/features/canvas/__tests__/canvas-terminal-new-tab.test.ts apps/web/src/features/canvas/__tests__/canvas-terminal-pin.test.ts apps/web/src/features/canvas/__tests__/canvas-terminal-placement.test.ts apps/web/src/features/canvas/__tests__/canvas-terminal-rendering.test.ts apps/web/src/features/terminal/store/__tests__/terminal-store-new-tab.test.ts`.
