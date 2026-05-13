# TEST · APP-014: Canvas

> Test Plan · how we verify the global Canvas experience across backend persistence, frontend canvas behavior, and live terminal attachment. References PRD `APP-014` and TECH `APP-014`.

## Test strategy

- **Unit / integration**: validate backend default-board creation, schema validation, and save/load round-trips for the persisted canvas document.
- **Frontend integration**: validate URL mode switching, document hydration, import parsing, and canvas store persistence behavior.
- **End-to-end / browser smoke**: validate the visible `/terminals` manager/canvas switch, note creation, terminal import, source reveal, and persistence across reload.
- **Manual-only**:
  - live terminal interaction quality inside a tldraw custom shape, because focus, resize, and xterm rendering are hard to prove cheaply without a dedicated browser harness
  - performance with many cards on a realistic machine, because this depends on real browser and tmux behavior

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1 |
| M2 | S2, S3 |
| M3 | S4 |
| M4 | S5 |
| M5 | S2, S6 |
| M6 | S7, S8 |
| M7 | S6 |
| M8 | S9, S10 |
| M9 | S11 |
| M10 | S8, S12 |
| N1 | S13 (deferred) |

## Scenarios

### S1 — Happy path: user opens Canvas from the global terminals destination

- **Level**: Frontend integration / browser smoke
- **Given**: the user navigates to `/terminals`
- **When**: the user switches from `manager` mode to `canvas` mode
- **Then**: the canvas view renders inside the existing terminals destination, without creating a second top-level route
- **Signals**: mode switch visible, canvas container rendered, URL state reflects `terminalView=canvas`

### S2 — Happy path: import terminal panes from more than one source context

- **Level**: Browser smoke
- **Given**: at least one project terminal layout and one workspace terminal layout exist with persisted panes
- **When**: the user imports panes from both contexts into Canvas
- **Then**: two or more terminal cards appear on the same canvas and each card shows the correct source identity
- **Signals**: terminal cards rendered, source badges visible, imported card count matches selection

### S3 — Edge: source context has no persisted terminal panes

- **Level**: Frontend integration
- **Given**: a selected workspace or project has no persisted pane entries
- **When**: the user opens the terminal import picker for that context
- **Then**: the picker shows an empty state and does not create broken canvas objects
- **Signals**: empty-state message visible, no new shapes added, no uncaught client error

### S4 — Happy path: user repositions and resizes terminal cards on the canvas

- **Level**: Browser smoke
- **Given**: one or more terminal cards already exist on the canvas
- **When**: the user drags and resizes a card
- **Then**: the card geometry updates and remains in its new position
- **Signals**: shape bounds change, persisted document changes after debounce, reload restores the new geometry

### S5 — Happy path: user creates and edits plain text notes

- **Level**: Browser smoke
- **Given**: the canvas is open
- **When**: the user inserts a note and edits its text
- **Then**: the note is visible on the canvas and persists after reload
- **Signals**: tldraw text shape exists, note text visible before and after reload

### S6 — Happy path: user reveals the source workspace/project from a terminal card

- **Level**: Frontend integration / browser smoke
- **Given**: a terminal card references either a project or a workspace context
- **When**: the user chooses the reveal-source action
- **Then**: the app navigates to `/project?id=...` or `/workspace?id=...` correctly
- **Signals**: route change, context params update, destination screen renders

### S7 — Happy path: active terminal card attaches to the existing tmux-backed runtime

- **Level**: Manual + targeted integration
- **Given**: a terminal card references an existing context id and tmux window name
- **When**: the card becomes active
- **Then**: the embedded terminal attaches through the existing terminal websocket and becomes interactive
- **Signals**: websocket connection opened to `/ws/terminal/:sessionId`, terminal output appears, keyboard input reaches the session

### S8 — Performance safeguard: only the active card mounts a live terminal

- **Level**: Frontend integration
- **Given**: multiple terminal cards exist on the canvas
- **When**: one card is active and the others are inactive
- **Then**: only the active card mounts the live terminal body; inactive cards remain lightweight placeholders
- **Signals**: active-card marker in runtime store, only one mounted terminal subtree, inactive cards render placeholder UI

### S9 — Happy path: backend lazily creates the default board on first access

- **Level**: Rust integration
- **Given**: no `canvas_board` row exists
- **When**: the client requests `GET /api/canvas/default`
- **Then**: the backend returns a valid default board document and persists it
- **Signals**: HTTP 200, response body contains `schema=canvas.v1`, database row created with `slug=default`

### S10 — Failure: backend rejects malformed document payloads

- **Level**: Rust integration
- **Given**: the client sends invalid JSON or the wrong schema wrapper
- **When**: the client saves the board
- **Then**: the request is rejected with a client-visible validation error and the stored board is unchanged
- **Signals**: non-200 response, validation message, database value unchanged

### S11 — Happy path: user creates grouping frames around terminals and notes

- **Level**: Browser smoke
- **Given**: the canvas contains notes and terminal cards
- **When**: the user creates a frame/group around them
- **Then**: the frame is visible and persists with the canvas document
- **Signals**: frame shape visible before and after reload

### S12 — Edge: canvas remains usable with several cards

- **Level**: Manual
- **Given**: a board with at least 6–10 terminal cards and notes
- **When**: the user pans, zooms, selects cards, and activates different cards
- **Then**: interaction remains responsive enough for normal use and card activation does not lock the page
- **Signals**: visible interaction remains smooth, no browser crash, no runaway terminal mounts, no repeated websocket churn for inactive cards

### S13 — Deferred nice-to-have: fast add from existing terminal UI

- **Level**: Browser smoke
- **Given**: the user is in a workspace/project terminal surface
- **When**: the user uses a future quick-add action
- **Then**: the selected pane appears in Canvas without opening the import picker
- **Signals**: new terminal card added to the default board

## Performance & load budgets

- Activating one terminal card must not cause every visible card to mount a live xterm instance.
- Saving ordinary canvas edits should be debounced; repeated drag updates should not trigger one request per pointer move.
- Reloading the default board should restore the canvas without blocking indefinitely on terminal attachments.

## Regression checklist

- [ ] Existing `/terminals` manager view still renders and remains the default mode unless canvas is explicitly selected.
- [ ] Existing workspace/project terminal layouts are untouched by canvas persistence.
- [ ] Canvas persistence stores layout/object state only; no terminal output transcript is persisted.
- [ ] Broken or deleted source terminals do not crash the canvas screen.
- [ ] Notes, frames, and terminal cards survive reload in the same saved board.

## Acceptance criteria

- [ ] Every PRD Must Have (M1–M10) is covered by at least one scenario.
- [ ] Default board creation, load, and save work end-to-end.
- [ ] Canvas mode is reachable from `/terminals` without breaking Terminal Manager.
- [ ] User can import terminals from multiple source contexts into the same board.
- [ ] User can create notes and grouping frames and see them persisted after reload.
- [ ] User can reveal source workspace/project for a terminal card.
- [ ] Live terminal interaction works from the active card.
- [ ] Inactive cards do not all mount live terminals simultaneously.

## Manual verification steps

1. Open `/terminals` and switch to Canvas mode.
2. Import one workspace terminal and one project terminal.
3. Move/resize both cards and add a text note plus one frame.
4. Activate each card once and confirm terminal interaction works.
5. Use reveal-source on both cards and confirm routing is correct.
6. Reload the page and confirm the board, note, frame, and card positions persist.
7. Return to manager mode and confirm the existing Terminal Manager still works.

## Non-coverage

- Multi-user collaborative canvas editing — out of scope for v1.
- Multiple named boards — deferred by TECH in favor of a single `default` board.
- Rich note styling / tags / saved templates — deferred nice-to-have work.
