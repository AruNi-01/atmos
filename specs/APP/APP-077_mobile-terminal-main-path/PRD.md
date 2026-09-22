# PRD · APP-077: Mobile Terminal Main Path

> Product Requirements · WHAT and WHY. Narrow Atmos mobile to an Apple-simple terminal dogfood path.

## Context

- **Problem**: Mobile M1 (APP-025) shipped a wide surface (settings, import, Changes, Overview) before the terminal path felt native. Those screens are not ready.
- **Why now**: The homepage and scan/login already work. The next dogfood cut is Computers → workspace → terminal input.
- **Related specs**: Narrows [APP-025 Mobile App](../APP-025_mobile-app/PRD.md). Does not change Relay/Hub auth (APP-016 / APP-056).

## Goals

1. One phone path from signed-out to typing in a remote terminal.
2. All workspace terminals appear as one top tab strip (tabs + windows flattened).
3. Apple-simple chrome: Expo drawers, `expo-ios-popover` popovers.

## Users & Scenarios

- **Primary persona**: Independent builder with a running Atmos Computer.
- **Scenario 1**: Sign in or scan QR, pick an online Computer, open a workspace, type in the terminal using the shortcut bar.
- **Scenario 2**: Create a workspace from the picker, land in its terminal.
- **Scenario 3**: Switch among every terminal in the workspace from the top tabs, or from the group drawer.

## Functional Requirements

### Must Have

- **M1**: Keep the current homepage (welcome + recent workspaces + Computer / Browse rows). Unauthenticated home stays scan/OAuth.
- **M2**: Keep Hub OAuth and QR pair. No paste Access Token path.
- **M3**: Computers list + connect remains the way to choose a Computer.
- **M4**: Users can list projects/workspaces, open one, and create a workspace.
- **M5**: Workspace development is terminal-only. No Changes, Overview, or import-project routes in this cut.
- **M6**: Every terminal candidate in the workspace — existing web tabs and windows under those tabs — is a sibling in one top tab strip, sorted stably (tmux window index, then label).
- **M7**: Exactly one terminal renderer is visible. Selecting a tab attaches that terminal.
- **M8**: Users can create a new terminal from the tab chrome.
- **M9**: Tabs trailing group button opens an Expo `BottomSheet` drawer with the same flattened list for scanning/selecting.
- **M10**: Popovers (workspace switcher, shortcut menus, account actions) use `expo-ios-popover` on iOS, with a non-drawer overlay fallback on Android.
- **M11**: Keyboard shortcut bar remains above the software keyboard (Ctrl / Esc / Tab / Paste / History / Move / Agent).
- **M12**: Users can switch workspace from the terminal chrome without returning to a settings stack.
- **M13**: Sign-out remains available from the homepage account popover. Settings / Relay / register routes are out of this cut.
- **M14**: Disconnected Computer/Relay state is visible; terminal input is not queued.

### Nice to Have

- **N1**: Theme toggle in the account popover.
- **N2**: Restore a slim settings sheet later for Relay URL overrides.

## Out of Scope

- Git Changes & Commit, import project, Computer rename/revoke settings, Relay URL editor.
- Web mosaic layout, multiple visible panes, Canvas, Agent Chat.
- New WebSocket actions unless flattening requires extra candidate fields (prefer existing `terminal_workspace_candidates`).

## Success Metrics

- Fresh signed-in user can reach an interactive terminal without visiting deleted routes.
- A workspace with multiple tmux windows shows each as a top tab and in the group drawer.
- Popovers do not present as drawers; the group list does.

## Risks

- `expo-ios-popover` is iOS-native; Android must not import the native module.
- Flattening must not collapse distinct windows that share a tmux name/index if they have distinct candidate ids.
- Deleting settings removes Relay URL editing for this cut.

## Milestones

1. Route cut + homepage/account popover.
2. Flattened terminal tabs + Expo group drawer.
3. Workspace switcher popover + shortcut popovers.
4. Typecheck and unit tests for flatten/sort.
