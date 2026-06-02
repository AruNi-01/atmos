# APP-022 Canvas Terminal New Tab

## Scope

This is a frontend-only change in `apps/web`.

## Design

`CanvasTerminalCard` owns the header toolbar for canvas terminal shapes. Add a toolbar button that:

1. Calls the terminal store to create a new center-stage terminal tab for `shape.props.workspaceId`.
2. Reads the initial pane from that tab and uses its tmux window name for the canvas terminal shape.
3. Creates a `canvas-terminal` shape in the current tldraw editor with `sourceTerminalTabId` set to the new tab id.
4. Reparents the new shape into the current frame when the current terminal's parent is a frame.
5. Otherwise creates a frame named for the project or workspace, then reparents both the current and new terminal shapes into that frame.

Use `editor.reparentShapes` rather than directly mutating `parentId`, because tldraw preserves page-space coordinates during reparenting.

## Data

No schema change is required. The new shape uses existing `CanvasTerminalShapeProps` fields.

## Routing

Update center-stage terminal store state so closing the canvas reveals the new terminal tab as the active center tab. Keep the canvas overlay open while the user is working.
