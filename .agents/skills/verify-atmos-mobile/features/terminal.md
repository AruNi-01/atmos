# Terminal

## Sub-features

- Terminal WebView (xterm) per session, testID `terminal-frame-<sessionId>`
- "New terminal" header button; terminal group drawer (testID `terminal-group-drawer`)
- Deep link `?terminal=<id>` focuses an existing terminal

## How to get to it (user POV)

Workspace → terminal. Route `/workspace/<id>/terminal`.

## Driving it with e2e

`tests/terminal.e2e.ts`: `device.openLink('atmos://workspace/<id>/terminal')`, `getByLabel('New terminal')`, then the "Terminal" heading.

## Proof

A new terminal frame renders and the same terminal shows on Desktop for the workspace.

## Charters

`terminal-tabs|ios|explorer|Create several terminals, switch between them through the group drawer, and check each keeps its own output.`

## Gotchas

xterm renders inside a WebView: its text is not in the accessibility tree, so assert on the frame and header, not on shell output.
