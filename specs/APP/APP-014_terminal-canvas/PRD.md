# PRD · APP-014: Terminal Canvas

> Product Requirements · WHAT and WHY. Settled direction for a global, persistent canvas where users can work with terminals and notes across workspaces and projects.

## Context

- **Problem**: Today, Atmos terminals are primarily organized inside individual workspace or project views. This is effective for local context, but weak for cross-workspace workflows where users need several active terminals, logs, agents, and notes visible at the same time.
- **Why now**: Issue #106 identifies a clear product gap: Atmos lacks a persistent "ops desk" for multi-project development, debugging, release work, and incident response. The requested direction is an actual infinite canvas experience rather than another tabbed or grid-based terminal view.
- **Related specs**: None yet.
- **Product constraint for this spec**: The first shipped experience should preserve a true infinite-canvas mental model and is expected to align with a tldraw-style interaction model. Exact library integration belongs in `TECH.md`.

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

- **M1**: Users can open a dedicated global **Terminal Canvas** view that is separate from any single workspace or project route.
- **M2**: Users can add existing terminal sessions from multiple workspaces and projects onto the canvas without creating duplicate terminal ownership in the product model.
- **M3**: Users can move and resize terminal cards freely on an infinite canvas surface.
- **M4**: Users can create, edit, move, and delete plain text notes on the canvas.
- **M5**: Each terminal card clearly shows its source context, including enough identity for the user to distinguish workspace or project origin at a glance.
- **M6**: Users can focus and operate a terminal directly from its canvas card, with behavior suitable for active terminal work rather than preview-only viewing.
- **M7**: Users can reveal or navigate to the source workspace or project for a terminal card from the canvas.
- **M8**: Canvas layout and note state persist across app sessions, so reopening Atmos restores the user's existing board.
- **M9**: The canvas supports lightweight grouping or framing so users can visually organize related terminals and notes by task, incident, or topic.
- **M10**: The first version must remain usable when the canvas contains multiple active terminal cards, with degraded or simplified rendering allowed for non-focused cards as long as user intent remains clear.

### Nice to Have

- **N1**: Quick actions to add a terminal to the canvas from existing workspace/project terminal UI.
- **N2**: Simple note styling such as sticky-note appearance, accent color, or tags.
- **N3**: Saved starter layouts for common use cases such as debugging, release coordination, or multi-service monitoring.
- **N4**: Search or filtering inside the canvas for quickly locating a terminal card by title, workspace, or project.

## Out of Scope

- **Real-time multiplayer collaboration** — this PRD is for a local-first personal workbench, not a shared collaborative whiteboard.
- **Rich document editing in notes** — v1 notes are plain text, not rich text docs, markdown canvases, or embedded files.
- **Terminal session creation from the canvas** — v1 focuses on importing and organizing existing sessions; creating brand-new sessions from the canvas can follow later.
- **Non-terminal widgets beyond notes and grouping** — charts, logs-only panels, task boards, and custom app widgets are not part of this first cut.
- **Mobile-first canvas UX** — the target experience is desktop/web usage with keyboard and terminal-heavy interaction.

## Success Metrics

- **Leading**: Users who regularly work across multiple workspaces/projects open Terminal Canvas and place terminals from more than one source context onto it.
- **Leading**: Repeat usage, measured by users reopening a previously saved canvas instead of rebuilding the same multi-terminal setup manually.
- **Lagging**: Reduced context switching in multi-workspace workflows, validated through product observation and user feedback.
- **Qualitative**: Users describe Terminal Canvas as a persistent "ops desk", "working board", or "release/debugging surface" rather than just another terminal tab.

## Risks & Open Questions

- **Risk**: If terminal interaction on the canvas feels meaningfully worse than in the source workspace, users may treat the canvas as a read-only dashboard and abandon the workflow.
- **Risk**: If the canvas becomes visually noisy with many active terminals, users may prefer simpler pinned layouts unless grouping and focus behavior are strong enough.
- **Open**: Should a terminal remain fully interactive in both the source view and the canvas at the same time, or should one surface become the active interaction owner?
- **Open**: How much grouping semantics should ship in v1 — purely visual frames, or containers with clearer move/select behavior?
- **Open**: How prominent should Terminal Canvas be in the main product navigation: a top-level destination, a global shortcut, or both?
- **Open**: The requested direction is to use tldraw. TECH should confirm the exact integration shape, persistence model, and how tldraw canvas interactions coexist with embedded terminal surfaces.

## Milestones

- **Phase 1** — Ship the global Terminal Canvas view with terminal cards, plain text notes, source reveal, freeform movement/resizing, and persistence.
- **Phase 2** — Strengthen organization with grouping/frame behavior and fast-add flows from existing terminal surfaces.
- **Phase 3** — Evaluate richer note affordances, search, and reusable layouts based on real usage patterns.
