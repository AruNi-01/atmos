# PRD · APP-014: Canvas

> Product Requirements · WHAT and WHY. Settled direction for a global, persistent **Canvas** — an infinite spatial surface that hosts terminal cards (v1) and is designed to accept additional widget types over time.

## Context

- **Problem**: Today, Atmos work is primarily organized inside individual workspace or project views. This is effective for local context, but weak for cross-workspace workflows where users need several active terminals, logs, agents, notes, and other references visible at the same time.
- **Why now**: Issue #106 identifies a clear product gap: Atmos lacks a persistent "ops desk" for multi-project development, debugging, release work, and incident response. The requested direction is an actual infinite canvas experience rather than another tabbed or grid-based terminal view.
- **Naming**: The surface is called **Canvas** (not "Terminal Canvas"). Terminal cards are simply the first widget type living on it; future widget types (notes, agent sessions, references, …) are explicitly in scope for the canvas, even if not all of them ship in v1.
- **Related specs**: None yet.
- **Product constraint for this spec**: The first shipped experience preserves a true infinite-canvas mental model and aligns with a tldraw-style interaction model. The canvas is an **immersive full-screen overlay** launched from Management Center — not a tab embedded inside any single view. Exact library integration belongs in `TECH.md`.

## Goals

1. **Primary**: Let users open one global canvas and place terminal panels from multiple workspaces or projects into a shared working surface.
2. **Secondary**: Let users capture lightweight notes and spatial context around those terminal panels so the canvas becomes a persistent working board, not just a detached terminal gallery.
3. **Secondary**: Keep source navigation clear so users can always jump from a canvas terminal card back to its originating workspace or project.

## Users & Scenarios

- **Primary persona**: Agentic Builder / developer who runs multiple workspaces, dev servers, agents, or builds in parallel and needs a persistent multi-context workbench.
- **Secondary persona**: Debugger / release owner who monitors several terminals and keeps notes, commands, and reminders attached to the current task.

### Key scenarios

1. A user is debugging a cross-service issue and wants backend, frontend, worker, and agent terminals visible side-by-side without switching between workspace routes.
2. A user is preparing a release and wants to arrange build terminals, verification terminals, and TODO notes in one persistent board that survives app reloads.
3. A user is comparing outputs from different projects and wants to keep those terminals spatially organized by task or incident instead of relying on tab order.
4. A user sees a terminal card on the canvas and needs to jump back to its source workspace or project to continue deeper work there.

## User Stories

- As a multi-project developer, I want to collect terminals from different workspaces and projects onto one canvas, so that I can work across contexts without constant navigation.
- As a debugger, I want to position and resize terminal cards freely, so that I can organize my working surface around the task at hand.
- As a developer, I want to add text notes near terminals, so that I can preserve commands, reminders, and investigation context in the same place as the live sessions.
- As a user returning to ongoing work, I want the canvas layout to persist, so that I can resume where I left off.
- As a user operating a terminal from the canvas, I want to focus it and interact with it directly, so that the canvas is operational rather than read-only.
- As a user, I want to reveal the source workspace or project for a terminal card, so that I can move between the global board and the original context without losing orientation.

## Functional Requirements

### Must Have

- **M1**: Users can open a dedicated global **Canvas** experience from Management Center. The canvas is an immersive full-screen overlay that covers the whole app surface — not a tab nested inside a single view.
- **M2**: Users can collapse / dismiss the canvas overlay from a clearly visible top-of-overlay icon button and return to the page underneath.
- **M3**: Users can add existing terminal sessions from multiple workspaces and projects onto the canvas without creating duplicate terminal ownership in the product model.
- **M4**: Users can move and resize terminal cards freely on an infinite canvas surface, with the full tldraw default toolset (page menu, tools palette, style panel, minimap, undo/redo) available.
- **M5**: Users can create, edit, move, and delete plain text notes and other built-in tldraw shapes on the canvas.
- **M6**: Each terminal card clearly shows its source context, including enough identity for the user to distinguish workspace or project origin at a glance.
- **M7**: Users can focus and operate a terminal directly from its canvas card, with behavior suitable for active terminal work rather than preview-only viewing.
- **M8**: Users can reveal or navigate to the source workspace or project for a terminal card from the canvas.
- **M9**: Canvas layout (document state) persists across app sessions, so reopening Atmos restores the user's existing board.
- **M10**: Canvas user preferences (theme/color scheme, page list, snap settings, keyboard-shortcut toggles, etc.) persist across page reloads.
- **M11**: The canvas theme defaults to mirror the Atmos theme. When the Atmos theme changes (light/dark/system) the canvas theme follows. Users can still override the canvas theme from tldraw's own preferences menu; that override is remembered until the Atmos theme changes again.
- **M12**: The first version must remain usable when the canvas contains multiple active terminal cards, with degraded or simplified rendering allowed for non-focused cards as long as user intent remains clear.

### Nice to Have

- **N1**: Quick actions to add a terminal to the canvas from existing workspace/project terminal UI.
- **N2**: Simple note styling such as sticky-note appearance, accent color, or tags.
- **N3**: Saved starter layouts for common use cases such as debugging, release coordination, or multi-service monitoring.
- **N4**: Search or filtering inside the canvas for quickly locating a terminal card by title, workspace, or project.

## Out of Scope (v1)

- **Real-time multiplayer collaboration** — this PRD is for a local-first personal workbench, not a shared collaborative whiteboard.
- **Rich document editing in notes** — v1 notes are plain text via tldraw's built-in note shape, not rich text docs or embedded files.
- **Terminal session creation from the canvas** — v1 focuses on importing and organizing existing sessions; creating brand-new sessions from the canvas can follow later.
- **Non-terminal Atmos-specific widgets** — agent session cards, PR/issue references, file viewers, charts, dashboards, and similar custom widgets are explicitly *future scope* for the canvas surface, but are not part of v1. v1 ships terminal cards plus tldraw's built-in shape catalogue (notes, frames, drawings, geo shapes, text, …).
- **Mobile-first canvas UX** — the target experience is desktop/web usage with keyboard and terminal-heavy interaction.

## Success Metrics

- **Leading**: Users who regularly work across multiple workspaces/projects open Canvas and place terminals from more than one source context onto it.
- **Leading**: Repeat usage, measured by users reopening a previously saved canvas instead of rebuilding the same multi-terminal setup manually.
- **Lagging**: Reduced context switching in multi-workspace workflows, validated through product observation and user feedback.
- **Qualitative**: Users describe Canvas as a persistent "ops desk", "working board", or "release/debugging surface" rather than just another terminal tab.

## Risks & Open Questions

- **Risk**: If terminal interaction on the canvas feels meaningfully worse than in the source workspace, users may treat the canvas as a read-only dashboard and abandon the workflow.
- **Risk**: If the canvas becomes visually noisy with many active terminals, users may prefer simpler pinned layouts unless grouping and focus behavior are strong enough.
- **Open**: Should a terminal remain fully interactive in both the source view and the canvas at the same time, or should one surface become the active interaction owner?
- **Open**: How much grouping semantics should ship in v1 — purely visual frames, or containers with clearer move/select behavior?
- **Open**: How prominent should Canvas be in the main product navigation: a top-level destination, a global shortcut, or both?
- **Open**: The requested direction is to use tldraw. TECH should confirm the exact integration shape, persistence model, and how tldraw canvas interactions coexist with embedded terminal surfaces.

## Milestones

- **Phase 1** — Ship the global Canvas overlay with terminal cards, tldraw's built-in shapes (including notes), source reveal, freeform movement/resizing, Atmos↔canvas theme sync, and persistence of both the document and user preferences.
- **Phase 2** — Strengthen organization with grouping/frame conventions for Atmos workflows and fast-add flows from existing terminal/agent surfaces.
- **Phase 3** — Extend the widget catalogue beyond terminal cards (agent sessions, PR/issue references, dashboards, …) and evaluate richer notes, search, and reusable layouts based on real usage patterns.
