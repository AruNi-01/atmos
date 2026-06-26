# PRD - APP-027: Canvas Workspace Surfaces

> Product Requirements - WHAT and WHY. Settled direction for adding first-class Atmos workspace surfaces from a centralized Canvas widget entrypoint.

## Context

- **Problem**: Canvas can host live terminals, but real work also depends on workspace context, file navigation, git changes, review state, and center-stage file / diff views.
- **Why now**: APP-014 framed Canvas as a global workbench where terminal cards are only the first widget type. The next phase should make Canvas useful for complete workspace workflows without adding more controls to the existing right sidebar or center-stage UI.
- **Related specs**: Builds on `../APP-014_canvas/`, `../APP-015_canvas-terminal-agent-integration/`, and `../APP-022_canvas-terminal-new-tab/`.

## Goals

1. Provide one centralized **Add Atmos Widget** entry inside Canvas for non-terminal widgets.
2. Let users choose a Project or Workspace first, then choose the Canvas component to add.
3. Keep existing app UI unchanged: no new pin-to-Canvas actions in Files, Changes, Review, editor tabs, or diff views.
4. Represent center-stage file and diff content as tabs inside a reusable Center Widget for the selected Project / Workspace.
5. Preserve spatial organization by allowing widget creation into a chosen frame and inheriting frame placement for related widgets created from inside another widget.

## Users & Scenarios

- **Primary persona**: Agentic Builder arranging a working board around one or more workspaces while keeping terminals, context, files, changes, and center-stage content visible.
- **Secondary persona**: Reviewer or release owner who wants review state, changed files, and verification terminals grouped inside a frame.

### Key scenarios

1. A user opens Canvas, clicks **Add Atmos Widget**, selects a Workspace, chooses **Files**, optionally chooses a frame, and gets a Files widget in that frame.
2. From a Canvas Files widget, the user clicks a file. Canvas opens the file as a tab in the Center Widget for that same Workspace. If no matching Center Widget exists, Canvas creates one.
3. From a Canvas Changes widget, the user opens a changed file or grouped diff. Canvas adds a diff tab to the same Workspace / Project Center Widget instead of creating a standalone Diff widget.
4. A user groups Files, Review, Center, and terminal widgets inside a frame. Any new Center Widget created from Files / Review inside that frame appears in the same frame.
5. Inside a reused widget surface, a user clicks an element that, in the main app, would navigate to or open a surface Canvas does not host. Canvas shows a short notice modal explaining the action is not available on the Canvas and stays put instead of leaving the board.

## User Stories

- As a Canvas user, I want one Add Atmos Widget entry, so that I always know where non-terminal widgets are created.
- As a workspace user, I want to choose Project / Workspace before choosing a component, so that new widgets are scoped correctly.
- As a user, I want existing Files / Changes / Review / editor UI to stay clean, so that normal app workflows do not gain extra Canvas controls.
- As a developer, I want Files and Changes widgets to open content into a reusable Center Widget, so that a workspace's files and diffs are organized as tabs rather than scattered cards.
- As a reviewer, I want Review interactions to open relevant diff tabs in the same context's Center Widget, so that review work stays grouped.
- As a user organizing a board, I want new widgets to go into a chosen or inherited frame, so that Canvas layout stays intentional.

## Functional Requirements

### Must Have

- **M1**: Canvas exposes one centralized **Add Atmos Widget** entry in Canvas chrome for adding non-terminal Atmos widgets.
- **M2**: The Add Atmos Widget flow requires users to select a Project or Workspace before selecting a component.
- **M3**: The first-phase add-menu component list includes Workspace Context, Files, Changes, and Review. File, Diff, and Review Diff are not direct add-menu components.
- **M4**: The Add Atmos Widget flow lets users choose an existing frame as the target container or choose no frame.
- **M5**: Widgets created through the Add flow are placed inside the selected frame when one is chosen; otherwise they are placed unframed on the canvas.
- **M6**: Canvas does not add new non-terminal pin-to-Canvas controls to existing right sidebar Files / Changes / Review, center-stage file tabs, or diff views. The existing terminal pin-to-Canvas flow remains unchanged.
- **M7**: Workspace Context widgets can show workspace or project notes, tasks, and requirements using the same data files and save semantics as existing workspace context panels.
- **M8**: Files widgets can browse the selected Project / Workspace file tree. Opening a file from a Files widget adds or focuses a file tab in the matching Center Widget.
- **M9**: Changes widgets can show changed-file groups for the selected Project / Workspace. Opening a file, group, or diff from Changes adds or focuses a diff tab in the matching Center Widget.
- **M10**: Review widgets can show review summary, changed files, open comments, reviewed status, and review navigation for the selected Project / Workspace. Opening review content adds or focuses a review/diff tab in the matching Center Widget.
- **M11**: Center Widget is a reusable tabbed content host scoped to a Project / Workspace. It can host file editor/viewer tabs, normal diff tabs, grouped changes diff tabs, and review diff tabs.
- **M12**: If a Files, Changes, or Review widget opens center-stage content and no matching Center Widget exists for that Project / Workspace and frame context, Canvas creates one automatically.
- **M13**: If a Files, Changes, or Review widget is inside a frame, any automatically created Center Widget for that interaction is created inside the same frame.
- **M14**: If a matching Center Widget already exists in the same Project / Workspace and frame context, Canvas adds or focuses a tab in that existing widget instead of creating another widget.
- **M15**: Canvas persists widget layout, frame placement, source references, and Center Widget tabs. It must not duplicate file contents, diff bodies, review bodies, or workspace context content in the Canvas document.
- **M16**: Heavy Center Widget tabs such as CodeMirror and diff views mount live internals only when their Center Widget and tab are active enough for interaction; inactive widgets may render summaries.
- **M17**: Existing terminal cards remain supported and visually consistent; this spec does not change terminal session creation, terminal pinning, xterm behavior, or terminal agent routing.
- **M18**: Widget interactions follow Canvas focus rules: interacting inside a widget should not unexpectedly pan, select, or zoom the tldraw surface; interacting outside should preserve normal Canvas behavior.
- **M19**: Source identity and source navigation remain available from every widget so users can return to the originating Project, Workspace, file, diff, or review context.
- **M20**: Because widgets reuse existing app panels, those panels contain clickable elements whose action has no Canvas equivalent (for example navigating to a main-app view, opening a center-stage surface, or opening a panel Canvas does not host). When such an element is triggered inside a Canvas widget, Canvas must intercept it and show a non-blocking notice modal stating the action is not available on the Canvas, instead of silently failing or navigating the whole app away from the Canvas. Interactions that do have a Canvas equivalent (file / diff / review opens into a Center Widget, terminal focus, source reveal) keep working and must not show the notice.

### Nice to Have

- **N1**: Allow users to add an empty Center Widget manually from Add Atmos Widget after dogfood proves it is useful.
- **N2**: Card-level compact / expanded modes for dense dashboards.
- **N3**: Canvas agent commands for adding widgets and Center tabs from `atmos canvas`.
- **N4**: Saved layouts for common review, release, and debugging workflows.
- **N5**: Run Preview, Local Services, Agent Session, Appshot, and artifact cards in later phases.

## Out of Scope

- **Generic iframe or route embedding** - phase 1 uses typed Atmos widgets, not arbitrary app routes or websites.
- **New backend persistence tables** - widget references live inside the existing Canvas document.
- **New source-surface pin controls** - existing Files, Changes, Review, editor, and diff UI should not gain new Canvas buttons.
- **Standalone File or Diff widgets** - file and diff content is hosted inside Center Widget tabs.
- **New terminal runtime behavior** - terminal card behavior remains owned by APP-014 and APP-022.
- **Mobile-first Canvas support** - desktop/web Canvas remains the target.
- **Real-time multiplayer Canvas collaboration** - this remains a local-first personal board.

## Success Metrics

- Leading: users add at least two non-terminal widget types from Add Atmos Widget during internal dogfood.
- Leading: users open files or diffs from Canvas-side Files / Changes / Review widgets and reuse one Center Widget per context instead of creating scattered cards.
- Leading: repeated Canvas sessions restore frames, widgets, and Center tabs without manual rebuilding.
- Qualitative: users describe Canvas as a workspace board with sidebar-like navigators and center-stage content, not only a terminal board.

## Risks & Open Questions

- **Risk**: Center Widget tab orchestration may become complex if it tries to mirror every center-stage behavior. Mitigation: support file and diff tabs first, with strict tab source types.
- **Risk**: Directly mounting existing panels may leak global sidebar or center-stage state into Canvas. TECH must require scoped adapters where needed.
- **Risk**: Multiple heavy center tabs may make Canvas sluggish. M16 is mandatory.
- **Risk**: Destructive git actions inside Canvas could surprise users. TECH should keep existing confirmations and may limit destructive actions in phase 1.
- **Open**: Should Center Widget be manually addable from Add Atmos Widget in phase 1 or only created on demand?
- **Open**: Should Review widgets pin a specific review session/revision, or follow the current review session for the selected context?
- **Risk**: Reused panels can trigger many unmapped interactions. Phase 1 treats the notice modal (M20) as a catch-all safety net for app-route navigation rather than wiring every individual action; query-param-only switches inside reused panels are a known gap to revisit if dogfood surfaces them.

## Milestones

- **Phase 1A**: Add centralized Add Atmos Widget flow, Project / Workspace selector, component selector, frame selector, and widget placement.
- **Phase 1B**: Add Workspace Context and Files widgets, plus automatic Center Widget creation for file tabs.
- **Phase 1C**: Add Changes and Review widgets, plus Center Widget diff/review tabs.
- **Phase 1D**: Harden frame inheritance, source reveal, active mounting, and terminal regression coverage.
- **Phase 2**: Add manual Center Widget creation, agent-created widgets/tabs, layout presets, and non-code artifact cards.
