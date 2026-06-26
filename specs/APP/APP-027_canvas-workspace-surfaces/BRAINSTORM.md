# Brainstorm - APP-027: Canvas Workspace Surfaces

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

APP-014 shipped Canvas as a global, persistent infinite surface with terminal cards as the first Atmos-specific widget. The next useful step is to let users add first-class Atmos work surfaces directly from Canvas without adding more buttons or pin affordances to existing app UI.

The clarified product direction is:

- Canvas gets one centralized **Add Atmos Widget** entry.
- The add flow first chooses a Project or Workspace, then chooses a Canvas component.
- Existing app UI must not be polluted with new "Pin to Canvas" actions, except the terminal pin flow that already exists.
- File editor/viewer and diff views are not top-level add-menu choices. They are opened from Canvas-side navigator widgets such as Files, Changes, and Review.
- Center-stage content is represented by a reusable, tabbed **Center Widget** per Project / Workspace context.
- Widgets can be added into an existing frame or outside any frame. Widgets created from another widget inherit that widget's frame when it has one.

## Goals (draft)

- Make Canvas a real workspace board while keeping the normal app UI unchanged.
- Provide a single, predictable widget creation path inside Canvas.
- Keep Files / Changes / Review as navigator widgets and Center as the reusable content host.
- Avoid one-off File or Diff widgets that fragment a workspace across many cards.
- Preserve frame organization when widgets create related widgets.

## Options

### Option A - Central Add Atmos Widget plus tabbed Center Widget

Canvas exposes one `Add Atmos Widget` entry. Users choose Project / Workspace, choose a component such as Workspace Context, Files, Changes, or Review, and optionally choose a target frame. Files / Changes / Review can open file and diff tabs into a Center Widget for the same context.

**Pros**: clean product surface, no existing UI pollution, matches how users already understand sidebar + center-stage composition.  
**Cons**: requires tab orchestration and context/frame matching.  
**Unknown**: whether Center should be manually addable in phase 1 or only created on demand.

### Option B - Add pin actions everywhere

Add "Pin to Canvas" actions to right sidebar panels, editor tabs, diff headers, review cards, and workspace context panels.

**Pros**: direct from the user's current work surface.  
**Cons**: pollutes existing UI, creates many entrypoints, and makes File/Diff too easy to scatter as separate cards.  
**Decision**: rejected for phase 1. Existing terminal pin remains because it already exists.

### Option C - Add every surface as a standalone widget

Expose Workspace Context, Files, Changes, Review, File, Diff, Review Diff, and future surfaces as separate add-menu widgets.

**Pros**: simple conceptual mapping from app surface to Canvas card.  
**Cons**: too many choices, duplicates center-stage semantics, and makes repeated file/diff tabs hard to manage.  
**Decision**: rejected for phase 1. File and diff content belongs inside Center Widget tabs.

## Key forks in the road

- **Creation entrypoint**: Canvas-only add flow vs source-surface pin actions. Decision: Canvas-only, except existing terminal pin.
- **Center-stage content**: standalone File/Diff widgets vs tabbed Center Widget. Decision: tabbed Center Widget.
- **Frame behavior**: manual frame choice only vs inherited frame for related widgets. Decision: both; Add flow chooses a frame, related widget creation inherits the source widget's frame.
- **Center matching**: one Center Widget per context globally vs per context within frame. Decide in TECH. Recommendation: match by Project/Workspace context and parent frame; fallback to unframed context match when source is unframed.
- **Component reuse**: mount existing source components directly vs extract scoped surfaces. Decide in TECH. Recommendation: extract scoped surfaces where global sidebar/center-stage state would leak.

## Open questions

- [ ] Should Center Widget be available in the Add Atmos Widget component list, or only created on demand from Files / Changes / Review?
- [ ] Should a context be allowed to have multiple Center Widgets in different frames?
- [ ] Should destructive git actions be available inside Canvas Changes widgets in phase 1?
- [ ] Should Review card interactions always open review diff tabs in Center, or can they navigate the main app center-stage view too?

## References

- Related spec: `../APP-014_canvas/`
- Related spec: `../APP-015_canvas-terminal-agent-integration/`
- Related spec: `../APP-022_canvas-terminal-new-tab/`
- Canvas code: `apps/web/src/features/canvas/`
- Workspace context: `apps/web/src/features/workspace/components/WorkspaceNotePanel.tsx`, `TaskListPanel.tsx`
- Files: `apps/web/src/features/files/components/FileTreePanel.tsx`, `FileTree.tsx`
- Changes / review / diff: `apps/web/src/features/diff/components/`
- Editor: `apps/web/src/features/editor/components/FileViewer.tsx`, `CodeMirrorEditor.tsx`

## Ready to promote

- Promote to PRD: Add Atmos Widget is the only new non-terminal widget creation entrypoint.
- Promote to PRD: no new pin-to-Canvas controls should be added to Files, Changes, Review, editor, or diff surfaces.
- Promote to PRD: Files / Changes / Review open file and diff content into a reusable tabbed Center Widget for the same context.
- Promote to PRD: Add flow and widget-created children must support target frame selection / frame inheritance.
- Promote to TECH: implement `canvas-widget` plus `canvas-center` semantics rather than separate File and Diff shape types.
