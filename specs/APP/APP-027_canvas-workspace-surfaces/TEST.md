# TEST - APP-027: Canvas Workspace Surfaces

> Test Plan - how we verify centralized Add Atmos Widget, frame-aware Canvas widgets, and reusable Center Widget tabs. References PRD APP-027 and TECH APP-027.

## Test strategy

- **Unit / integration**: cover source-reference normalization, pin-key generation, Center tab keys, Center widget matching, frame target resolution, and inherited-frame placement.
- **Component tests**: cover Add Atmos Widget dialog steps, widget card rendering, pointer containment, summary vs live state, and scoped presentational surfaces with mocked stores.
- **End-to-end**: cover adding widgets only from Canvas, opening files/diffs into Center Widget tabs, frame selection/inheritance, and reload restore.
- **Manual-only**: desktop-specific focus and scroll checks for CodeMirror and diff tabs inside tldraw, because reliable automation for nested editor focus is limited.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1 |
| M2 | S1, S2 |
| M3 | S1, S3 |
| M4 | S2, S4 |
| M5 | S3 |
| M6 | S5 |
| M7 | S6, S7 |
| M8 | S8, S9 |
| M9 | S10, S11 |
| M10 | S12, S13 |
| M11 | S8, S10, S12 |
| M12 | S9, S11, S13 |
| M13 | S14 |
| M14 | S15 |
| M15 | S16 |
| M16 | S17 |
| M17 | S18 |
| M18 | S19 |
| M19 | S20 |
| M20 | S22, S23 |

## Scenarios

### S1 - Add Atmos Widget opens from Canvas chrome

- **Level**: E2E (Playwright)
- **Given**: Canvas is open.
- **When**: the user clicks Add Atmos Widget.
- **Then**: a dialog opens with Project / Workspace selection as the first required step.
- **Signals**: dialog title visible; component choices are disabled or absent until context is selected.

### S2 - Component choices appear after context selection

- **Level**: Component + E2E
- **Given**: Add Atmos Widget dialog is open.
- **When**: the user selects a Project or Workspace.
- **Then**: Workspace Context, Files, Changes, and Review are available; File, Diff, and Review Diff are not listed as add-menu components.
- **Signals**: expected component labels visible; direct File/Diff labels absent.

### S3 - Add flow places widget in selected frame

- **Level**: E2E (Playwright)
- **Given**: Canvas has an existing frame.
- **When**: the user adds a Files widget and selects that frame in the Add flow.
- **Then**: the Files widget is created as a child of the frame and appears inside it.
- **Signals**: tldraw shape parent id is the frame id; visual placement is inside frame bounds.

### S4 - Add flow can place widget without a frame

- **Level**: E2E (Playwright)
- **Given**: Canvas has frames available.
- **When**: the user chooses "No frame" while adding Workspace Context.
- **Then**: the widget is created on the canvas page, not parented to any frame.
- **Signals**: shape parent is the page id; widget appears outside frame ownership.

### S5 - Existing non-terminal app UI is not polluted

- **Level**: Component / snapshot
- **Given**: right sidebar Files, Changes, Review, center-stage file tabs, and diff views are rendered outside Canvas.
- **When**: the APP-027 feature is enabled.
- **Then**: those surfaces do not show new non-terminal Pin to Canvas or Add to Canvas controls.
- **Signals**: queries for new Canvas action labels/icons in those surfaces return none; existing terminal pin remains covered by terminal tests.

### S6 - Workspace Context widget renders source data

- **Level**: Component + E2E
- **Given**: a workspace with `.atmos/context/note.md`, `.atmos/context/task.md`, and requirement content.
- **When**: a Workspace Context widget is added through Add Atmos Widget.
- **Then**: the widget shows note, task, and requirement sections using the same source data as existing context panels.
- **Signals**: markdown text visible; task status icons match parsed task states.

### S7 - Workspace Context edits use existing save semantics

- **Level**: Integration
- **Given**: a Workspace Context widget with notes visible.
- **When**: the user edits the note and waits for autosave or blurs the editor.
- **Then**: the existing note file is updated and existing workspace context panels would show the same text.
- **Signals**: `fsApi.readFile(.atmos/context/note.md)` returns the new content.

### S8 - Files widget opens file tab in Center Widget

- **Level**: E2E (Playwright)
- **Given**: a Files widget for a workspace and no matching Center Widget.
- **When**: the user opens a text file from the Files widget.
- **Then**: Canvas creates a Center Widget for that workspace and opens a file tab inside it.
- **Signals**: one Center Widget exists; its tab list contains the selected file path.

### S9 - Files widget reuses existing Center Widget

- **Level**: E2E (Playwright)
- **Given**: a Files widget and a matching Center Widget for the same workspace and frame context.
- **When**: the user opens another file from the Files widget.
- **Then**: Canvas adds or focuses a tab in the existing Center Widget instead of creating a second Center Widget.
- **Signals**: Center Widget count remains one for the context/frame; tab count increases or active tab changes.

### S10 - Changes widget opens diff tab in Center Widget

- **Level**: E2E (Playwright)
- **Given**: a Changes widget with staged, unstaged, or untracked files.
- **When**: the user opens a changed file or grouped diff from the Changes widget.
- **Then**: the matching Center Widget gets a changes diff tab.
- **Signals**: Center tab source kind is `changes-file` or `changes-group`; diff content renders when active.

### S11 - Changes widget reuses Center Widget

- **Level**: E2E (Playwright)
- **Given**: a Changes widget and an existing matching Center Widget.
- **When**: the user opens multiple changed files.
- **Then**: all opened diff tabs are added to the existing Center Widget for that context/frame.
- **Signals**: Center Widget count remains stable; tab keys dedupe repeated opens.

### S12 - Review widget opens review diff tab in Center Widget

- **Level**: E2E (Playwright)
- **Given**: a Review widget with a current review session and changed files.
- **When**: the user opens a review file or comment.
- **Then**: the matching Center Widget gets a review diff tab focused on the relevant source.
- **Signals**: Center tab source kind is `review-file` or `review-group`; review context identifiers are present.

### S13 - Review widget creates Center Widget on demand

- **Level**: E2E (Playwright)
- **Given**: a Review widget and no matching Center Widget.
- **When**: the user opens review diff content.
- **Then**: Canvas creates a Center Widget for that context and adds the review diff tab.
- **Signals**: one Center Widget appears with the selected review tab active.

### S14 - Widget-originated Center creation inherits frame

- **Level**: E2E (Playwright)
- **Given**: a Files widget inside a frame and no matching Center Widget in that frame.
- **When**: the user opens a file from the Files widget.
- **Then**: the new Center Widget is created inside the same frame.
- **Signals**: Center Widget parent id equals the source widget's frame id.

### S15 - Matching Center Widget is scoped by context and frame

- **Level**: Unit + E2E
- **Given**: two Center Widgets for the same workspace in different frames.
- **When**: a Files widget in frame A opens a file.
- **Then**: the tab is added to the Center Widget in frame A, not frame B.
- **Signals**: frame A Center tab list changes; frame B Center tab list is unchanged.

### S16 - Canvas stores references, not content

- **Level**: Unit / integration
- **Given**: Canvas contains Workspace Context, Files, Changes, Review, and Center widgets with file and diff tabs.
- **When**: the Canvas document is serialized.
- **Then**: widget props contain source references and tab refs, but not file contents, diff bodies, review bodies, tokens, or note text.
- **Signals**: serialized document search confirms references only.

### S17 - Heavy Center tabs mount only when active

- **Level**: Component
- **Given**: a Center Widget with multiple file and diff tabs.
- **When**: one tab is active and the Center Widget is selected.
- **Then**: only that active tab mounts live CodeMirror or CodeView internals; inactive tabs render summaries or stay unmounted.
- **Signals**: test doubles for FileViewer / Diff renderer mount once for the active tab.

### S18 - Existing terminal cards are not regressed

- **Level**: E2E (Playwright)
- **Given**: Canvas contains a terminal card and multiple new widgets.
- **When**: the user activates the terminal, types input, creates a related terminal, and reveals source.
- **Then**: terminal behavior matches APP-014 / APP-022 behavior.
- **Signals**: terminal receives input, related terminal card appears, source navigation uses existing terminal params.

### S19 - Canvas pointer and scroll behavior stays coherent

- **Level**: Manual + component
- **Given**: a selected Center Widget with a scrollable file or diff tab.
- **When**: the user scrolls, selects text, opens context actions, then clicks outside the widget.
- **Then**: internal interaction does not pan Canvas; outside interaction resumes normal Canvas selection/pan behavior.
- **Signals**: no accidental camera movement while interacting inside the widget; tldraw selection changes only on outside click.

### S20 - Source reveal works from every widget type

- **Level**: E2E (Playwright)
- **Given**: one widget of each first-phase type and a Center Widget with file and diff tabs.
- **When**: the user clicks source reveal on each widget or tab.
- **Then**: the app navigates or focuses the matching Project, Workspace, file, diff, or review context.
- **Signals**: URL params, active sidebar tab, active editor path, or review selection match the source reference.

### S21 - Broken references fail recoverably

- **Level**: Component
- **Given**: a Canvas document with a widget referencing a deleted workspace or missing file.
- **When**: Canvas loads the widget.
- **Then**: the widget shows a broken-reference state with remove and source-relink affordances where possible.
- **Signals**: no unhandled exception; error state text and remove action are visible.

### S22 - Unsupported interaction shows a notice instead of navigating away

- **Level**: Unit + E2E
- **Given**: a Canvas widget that reuses an app panel with a clickable element wired to `useAppRouter` navigation.
- **When**: the user clicks that element inside the widget.
- **Then**: Canvas stays on the board and shows a notice modal explaining the action is not available on the Canvas; the app route does not change.
- **Signals**: `unsupportedInteractionNotice` is set; the navigation interceptor returns `true` so `router.push` is skipped; notice modal text is visible.

### S23 - Supported interactions and chrome navigation are not intercepted

- **Level**: Unit + Component
- **Given**: a widget body wrapped in the Canvas host boundary and card chrome (Reveal Source) outside it.
- **When**: the user opens a file/diff into a Center Widget and separately clicks Reveal Source.
- **Then**: the Center tab opens with no notice; Reveal Source navigates to the source context normally.
- **Signals**: no `unsupportedInteractionNotice` for Center opens; chrome `useAppRouter` push proceeds because it is outside the interceptor provider.

## Performance & load budgets

- Canvas with 10 mixed widgets, 2 Center Widgets, and 3 terminal cards should remain interactable after load.
- Only active Center tabs should mount live editor/diff internals.
- Adding a widget or Center tab should update the Canvas document through the existing save cadence; no separate persistence request should be introduced.
- Files widgets should avoid fetching large recursive trees more often than the existing file tree refresh policy.

## Regression checklist

- [ ] Existing `canvas-terminal` cards still load from old Canvas documents.
- [ ] Existing terminal pin and related-terminal flows still work.
- [ ] Existing right sidebar Files / Changes / Review tabs have no new non-terminal Canvas controls.
- [ ] Existing center-stage file editor and diff views have no new non-terminal Canvas controls.
- [ ] Canvas agent commands for shapes still work with the new shape util present.
- [ ] No file contents, diff contents, review bodies, note contents, or secrets are stored in Canvas widget props.
- [ ] No new REST or WebSocket endpoint is added for this spec.

## Acceptance criteria

- [ ] All PRD Must Have items M1-M20 have passing scenario coverage.
- [ ] Unsupported reused-panel navigation shows the notice modal instead of leaving the Canvas; supported Center/terminal/source interactions are not intercepted.
- [ ] Add Atmos Widget is the only new non-terminal creation entrypoint.
- [ ] File and diff content opens as Center Widget tabs, not standalone File/Diff widgets.
- [ ] Frame selection and inherited frame placement are covered by tests.
- [ ] New widget references and Center tabs persist and restore through the existing Canvas board document.
- [ ] Existing terminal Canvas tests remain green.
- [ ] `bun test` passes for affected `apps/web` feature tests.
- [ ] `bun typecheck` passes for `apps/web`.

## Manual verification steps

1. Start API and web, open Canvas for a workspace with files, git changes, and a review session.
2. Use Add Atmos Widget to add Workspace Context, Files, Changes, and Review widgets; confirm Project / Workspace and frame selection are required where expected.
3. From a Files widget, open multiple files and confirm they appear as tabs in one matching Center Widget.
4. From a Changes widget, open file/group diffs and confirm they appear as tabs in the same Center Widget for the same context/frame.
5. Put a Files widget inside a frame, open a file, and confirm the created Center Widget appears in that frame.
6. Reload the app and confirm frames, widgets, Center tabs, and active tab identity restore.
7. Confirm existing Files / Changes / Review / editor / diff UI outside Canvas has not gained new Canvas controls.
8. Confirm an existing terminal card still accepts input and can create a related terminal.

## Non-coverage

- Mobile Canvas behavior is not covered in this phase.
- Generic iframe/embed cards are not covered because they are out of scope.
- Agent-created widget cards and tabs are deferred to a later phase.
