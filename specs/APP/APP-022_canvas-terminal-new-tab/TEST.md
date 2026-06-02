# APP-022 Canvas Terminal New Tab

## Acceptance

- Clicking `New Terminal` from a canvas terminal creates a center-stage terminal tab for the same project or workspace.
- The new canvas terminal card links back to the new center-stage tab through `sourceTerminalTabId`.
- When the current canvas terminal is already in a frame, the new card is added to that frame.
- When the current canvas terminal is not in a frame, a new frame is created and both cards are placed inside it.
- The frame name uses workspace display name first, then workspace name; project-level terminals use project name.

## Regression

- Existing pin-to-canvas behavior still works.
- Existing canvas terminal source and unpin actions still work.
- Terminal store persistence still saves the new center-stage tab.
