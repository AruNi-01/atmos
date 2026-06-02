# APP-022 Canvas Terminal New Tab

## Problem

Canvas terminals can currently appear only after a user pins an existing center-stage terminal. When a user is already working from a canvas terminal, creating a related terminal requires leaving the canvas, creating a center terminal, and pinning it back.

## Direction

Add a `New Terminal` action to the canvas terminal header toolbar. The action creates a new center-stage terminal tab for the same project or workspace as the current canvas terminal, then adds the new terminal to the canvas.

## Framing Rule

If the current canvas terminal is already inside a frame, the new terminal should be placed in that frame. If it is not in a frame, create a frame named after the current project or workspace and put both terminals in it. Workspace display names take priority over internal workspace names.
