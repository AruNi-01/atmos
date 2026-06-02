# APP-022 Canvas Terminal New Tab

## User Story

As a user working from a canvas terminal, I can create a related terminal without leaving the canvas, so parallel work stays organized around the same project or workspace.

## Requirements

- Show a `New Terminal` action in each canvas terminal header toolbar.
- Create the new terminal in the same project or workspace context as the current canvas terminal.
- Put the terminal in a new center-stage terminal tab, not a horizontal or vertical split.
- Add a canvas terminal card for the new terminal.
- Preserve canvas organization:
  - If the current canvas terminal is in a frame, add the new terminal to that frame.
  - If the current canvas terminal is not in a frame, create a frame around the current and new terminals.
  - Use `workspace.displayName || workspace.name` for workspace frame names, and project name for project-level terminals.

## Non-Goals

- No new backend endpoint.
- No canvas-global terminal picker.
- No split-orientation prompt.
