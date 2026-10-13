# Workspace list

## Sub-features
- List of workspaces with title and branch; status menu per row
- Empty/offline states: "No Workspaces", "Computer offline", "Reconnecting", "Connect first"
- "New Workspace" button → `/create-workspace`

## How to get to it (user POV)
Paired app home `/`. Tap a row → `/workspace/<guid>`.

## Driving it with e2e
`tests/workspace.e2e.ts`: `getByText(ATMOS_E2E_WORKSPACE_TITLE)` then `getByLabel('New terminal')` on the workspace screen. Needs `ATMOS_E2E_PAIRED`, `ATMOS_E2E_WORKSPACE_ID`, `ATMOS_E2E_WORKSPACE_TITLE`.

## Proof
The workspace screen opens with its header actions; same workspace is the one open on Desktop.

## Charters
`workspaces-offline|ios|explorer|Stop the Computer while on the workspace list and check the offline and reconnecting states recover without a restart.`

## Gotchas
Rows are Pressables without testIDs; locate by visible title. A title equal to the branch hides the branch line.
