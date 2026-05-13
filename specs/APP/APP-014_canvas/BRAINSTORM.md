# Brainstorm · APP-014: Canvas

> Problem space and exploration. Settled content graduates to `PRD.md`; committed architecture graduates to `TECH.md`.
>
> **Scope note**: This spec was originally framed as a "Canvas" because the first concrete use case is placing terminal cards from multiple workspaces onto a shared spatial surface. The product surface is intentionally a general **Canvas** — terminal cards are the first widget type but the canvas is designed to host arbitrary future widgets (notes, agent sessions, references, charts, …).

## Context

Issue #106 proposes a new global **Canvas** so users can keep work from multiple workspaces and projects visible together. The first concrete need is multi-workspace terminal panels (debugging, release coordination, incident response), but the same surface is meant to host future widgets such as notes, agent sessions, file/PR references, or anything else worth spatially organizing.

The current workaround is context switching:

- jump between multiple workspace routes
- keep mental state in notes outside Atmos
- use the existing global `/terminals` management view for diagnostics, but not for active working layout
- rely on OS-level window management instead of an in-product workbench

The requested direction is not just "more terminals". It is a **persistent spatial work surface** with notes and freeform organization.

## Goals (draft)

- **Primary**: create a global, persistent place where users can keep terminals from multiple contexts visible and usable together.
- **Secondary**: let users add lightweight notes and group related work spatially.
- **Secondary**: preserve the identity of each terminal's source workspace/project so the canvas complements existing views instead of replacing them.
- **Constraint**: keep the existing tmux + terminal websocket runtime model; do not invent a second terminal runtime.

## Options

### Option A — True infinite canvas with live terminal cards

Use a real infinite canvas interaction model and place terminal cards, notes, and visual groupings onto it. Terminal cards stay tied to existing workspace/project sessions and are arranged spatially.

**Pros**

- Matches the product intent in the issue.
- Creates a distinct value proposition beyond the current terminal grid and manager.
- Natural fit for notes, grouping, and persistent "ops desk" workflows.
- Scales better to cross-workspace mental models than tabs or nested panes.

**Cons**

- Embedded live terminals inside a canvas are heavier than ordinary canvas objects.
- Focus and keyboard routing will be tricky when switching between canvas gestures and xterm input.
- Requires a custom terminal-card object model rather than using only stock canvas primitives.

**Unknown**

- Whether all terminal cards should be live simultaneously, or whether only the active card should mount an interactive terminal.
- How much of the source workspace's pane metadata should be copied into the canvas document versus looked up dynamically.

### Option B — Constrained spatial board built from existing terminal grid primitives

Keep the current terminal grid/pane model and add a looser drag-and-drop board around it, without committing to a true infinite canvas engine.

**Pros**

- Smaller implementation delta from the current `react-mosaic-component` setup.
- Easier to reuse existing pane rendering and layout state.
- Lower risk around custom canvas primitives.

**Cons**

- Does not really solve the "infinite canvas + notes + grouping" request.
- Likely to feel like "terminal tabs with better drag and drop" instead of a new workbench concept.
- Harder to add frames, notes, and mixed object types cleanly.

**Unknown**

- Whether users would perceive enough value over the existing workspace/project terminal layouts.

### Option C — Dashboard mode with read-mostly previews and on-demand live attach

Render terminal cards as lightweight previews or summaries by default. Only the focused card becomes a live terminal. Notes and grouping still exist, but the main value is monitoring rather than full parallel interaction.

**Pros**

- Stronger performance story when many cards are on one board.
- Easier to keep the canvas responsive on lower-end hardware.
- Aligns with the issue's need for side-by-side monitoring.

**Cons**

- Risks undermining the "operate terminals from the canvas" expectation if users think cards are passive widgets.
- Adds mode transitions that users must understand.

**Unknown**

- Whether users prefer "many live cards" or "one active card, many passive cards" once they try the feature.

## Key forks in the road

- **Fork 1 — Real infinite canvas vs constrained board**: resolved in PRD toward a true infinite-canvas model.
- **Fork 2 — Canvas engine choice**: tldraw vs custom/homegrown canvas. User direction is to use tldraw; TECH should lock the integration shape.
- **Fork 3 — Live interaction model**: every visible terminal card mounts a live xterm instance vs only the focused card is fully live. Decide in TECH.
- **Fork 4 — Persistence shape**: single default global board vs multiple named boards. PRD only requires one board; TECH should keep v1 minimal.
- **Fork 5 — Transport model**: reuse existing terminal websocket for runtime while using REST for board persistence vs introduce new app-level websocket messages. Decide in TECH.

## Open questions

- [ ] Should the canvas live inside the existing `/terminals` management area, or become a separate top-level destination with its own navigation affordance?
- [ ] Should v1 support importing terminals only from the main workspace/project terminal surfaces, or also from special scopes such as Project Wiki / Code Review terminal contexts?
- [ ] What is the right behavior when the source terminal is deleted or renamed after it has been placed on the canvas?
- [ ] Should notes use only plain text at launch, or should sticky-note styling be available immediately?
- [ ] Do users need multiple saved boards in the first release, or is one default global board enough?

## References

- Issue: `https://github.com/AruNi-01/atmos/issues/106`
- External docs: `https://tldraw.dev/quick-start`
- Current global terminals entry: `apps/web/src/components/layout/CenterStage.tsx`
- Current global terminals screen: `apps/web/src/components/terminal/TerminalManagerView.tsx`
- Existing terminal layout store: `apps/web/src/hooks/use-terminal-store.ts`
- Existing terminal grid: `apps/web/src/components/terminal/TerminalGrid.tsx`
- Existing terminal runtime: `apps/web/src/components/terminal/Terminal.tsx`
- Existing terminal websocket handler: `apps/api/src/api/ws/terminal_handler.rs`
- Existing project/workspace terminal layout persistence:
  - `apps/api/src/api/project/handlers.rs`
  - `apps/api/src/api/workspace/handlers.rs`
  - `crates/core-service/src/service/project.rs`
  - `crates/core-service/src/service/workspace.rs`

## Ready to promote

- **Promote to PRD**:
  - Canvas is a global workbench, not another per-workspace tab.
  - Users can import terminals from multiple workspace/project contexts onto one shared board.
  - Notes and grouping are part of the value proposition, not follow-up polish.
  - Persistence across app sessions is required for the first meaningful version.

- **Promote to TECH**:
  - Reuse the existing tmux + terminal websocket runtime rather than creating a new runtime path.
  - Prefer landing Canvas inside the existing `/terminals` entry, which already represents a global terminals destination.
  - Use tldraw as the canvas engine, starting from the quick-start React integration and layering Atmos-specific terminal-card behavior on top.
  - Keep v1 minimal with one persisted default board unless implementation pressure clearly forces a different persistence model.
