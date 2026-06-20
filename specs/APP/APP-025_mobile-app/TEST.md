# TEST · APP-025: Mobile App

> Test Plan · how we verify the real Expo mobile client for remote Atmos Computer workflows. References PRD APP-025 and TECH APP-025.

## Test strategy

M1 spans a new Expo app plus existing Relay / Atmos WebSocket surfaces. We use unit/integration tests for pure API clients, DTO parsing, stores, and diff view-model logic; service-level tests for additive Relay session and terminal stream behavior; Expo/React Native component tests for mobile screens where practical; and simulator smoke checks for native UI, WebView terminal, SecureStore, and platform behavior.

- **Unit / integration**: mobile access-token storage wrapper, relay client request construction, WS action helpers, Zustand stores, terminal shortcut sequences, changed-file grouping, diff view-model generation.
- **Service-level**: Relay client-session response shape, `/ws/client` mobile kind routing, `/ws/terminal` relay stream routing, existing `apps/api` Git WS action compatibility.
- **End-to-end / scripted**: Expo app launched against a test Atmos Server/Relay, onboarding, workspace list, project import, workspace create, terminal attach/create, Changes & Commit.
- **Manual-only**: real iOS/Android keyboard and IME behavior, Expo UI native feel, WebView terminal rendering on physical devices. These depend on native runtime behavior and should be checked before public release even if simulator smoke passes.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S19, S20 |
| M2 | S1, S18 |
| M3 | S2, S3, S4 |
| M4 | S2, S5, S6 |
| M5 | S7, S8 |
| M6 | S8, S9, S10 |
| M7 | S11, S12 |
| M8 | S13, S14 |
| M9 | S13, S15 |
| M10 | S16 |
| M11 | S16, S17 |
| M12 | S18 |
| M13 | S19 |
| M14 | S20 |
| M15 | S20, S21 |
| M16 | S22 |
| M17 | S23, S24, S25 |
| M18 | S26, S27 |
| M19 | S4 |
| M20 | S28 |

## Scenarios

### S1 — App is a real mobile client, not a web shell

- **Level**: Static integration + simulator smoke
- **Given**: the repository contains `apps/mobile`.
- **When**: the mobile app is installed or started with Expo.
- **Then**: the app entry uses Expo Router / React Native routes, not a PWA or embedded `app.atmos.land`; no local Atmos Server process is started by the mobile app.
- **Signals**: `apps/mobile/package.json` declares Expo, `app/_layout.tsx` owns routing, no route loads the hosted Web app as the primary client, simulator launches the native route tree.

### S2 — First setup creates or saves an Access Token

- **Level**: Component integration
- **Given**: SecureStore has no saved Access Token.
- **When**: the user opens onboarding and creates or pastes a token.
- **Then**: the token is saved through `expo-secure-store`, not AsyncStorage, and onboarding advances to Computer setup.
- **Signals**: SecureStore mock receives the token write, route state advances, no token value appears in logs or rendered debug text.

### S3 — Invalid Access Token is rejected recoverably

- **Level**: Component integration
- **Given**: Relay returns `401` or a typed auth failure for the supplied Access Token.
- **When**: the user submits the token.
- **Then**: the onboarding screen shows a recoverable error and stays on token entry.
- **Signals**: visible error text, no selected Computer, no client session stored.

### S4 — Access Token switch and reset recover lost-phone access

- **Level**: Component integration
- **Given**: a saved Access Token exists.
- **When**: the user opens settings and switches or resets the token.
- **Then**: the old token is removed from SecureStore, active client sessions are cleared, and the app returns to onboarding or reauth state.
- **Signals**: SecureStore delete/write calls, session store reset, selected Computer cleared.

### S5 — Onboarding guides Atmos Server registration

- **Level**: Component integration
- **Given**: an authenticated user has no online Computers.
- **When**: onboarding requests register-token guidance.
- **Then**: the app shows server startup/register instructions and continues polling/listing Computers.
- **Signals**: register-token relay request, setup instruction block visible, Computer list remains empty state.

### S6 — Onboarding blocks normal entry until a Computer is available

- **Level**: Component integration
- **Given**: no selectable Computer is online.
- **When**: the user finishes token entry.
- **Then**: the app does not route to the workspace list unless the user explicitly stays in setup/dev mode.
- **Signals**: route remains onboarding/setup, workspace bootstrap WS action is not sent.

### S7 — Authenticated home is workspace list

- **Level**: Component integration
- **Given**: a valid Access Token and selected online Computer.
- **When**: the app starts.
- **Then**: the first post-auth screen loads `project_workspace_bootstrap` and renders workspace/project rows.
- **Signals**: WS request action `project_workspace_bootstrap`, workspace list visible, no desktop Center Stage layout.

### S8 — Settings drawer owns Computer and token controls

- **Level**: Component integration
- **Given**: the user is on the workspace list.
- **When**: the user opens settings.
- **Then**: Computer selection, Computer rename/revoke, Access Token switching, and relay dev settings are available outside the primary list flow.
- **Signals**: settings route/sheet visible, controls present, workspace list remains the home route.

### S9 — Computer switch creates a new mobile client session

- **Level**: Integration
- **Given**: two online Computers are returned by the relay.
- **When**: the user selects the second Computer.
- **Then**: the app creates a fresh client session for that Computer and reconnects the main app WS using the new `ws_url` / `client_token`.
- **Signals**: `POST /v1/computers/:id/client_sessions`, selected Computer store update, old WS closes, new WS opens.

### S10 — Computer rename and revoke are reflected in settings

- **Level**: Integration
- **Given**: a selected Computer.
- **When**: the user renames it or revokes it from settings.
- **Then**: rename persists in the list, revoke removes the Computer and clears selection if it was active.
- **Signals**: `PATCH /v1/computers/:id` or `POST /v1/computers/:id/revoke`, updated Computer list, selected state cleared on active revoke.

### S11 — Remote project import validates filesystem paths

- **Level**: Component integration
- **Given**: a selected Computer with a remote filesystem.
- **When**: the user opens import project, browses/searches directories, and selects a path.
- **Then**: the app validates the path before creating the project.
- **Signals**: WS actions `fs_get_home_dir`, `fs_list_dir` or `fs_search_dirs`, and `fs_validate_git_path` / `project_validate_path`; validated project preview visible.

### S12 — Invalid project path stays editable

- **Level**: Component integration
- **Given**: validation reports that the selected path is not a usable Git/project path.
- **When**: the user attempts import.
- **Then**: the app shows a recoverable error and leaves the path picker usable.
- **Signals**: validation error visible, no `project_create` action sent, user can choose another path.

### S13 — Mobile workspace creation succeeds and routes into workspace

- **Level**: End-to-end / scripted
- **Given**: a valid project and remote base branch.
- **When**: the user submits the mobile create-workspace form with title and base branch.
- **Then**: `workspace_create` is sent, setup progress is shown, and success routes to the created workspace terminal surface.
- **Signals**: WS action `workspace_create`, progress UI, route `/workspace/[workspaceId]`, workspace id matches the response.

### S14 — Advanced workspace fields are hidden but available

- **Level**: Component integration
- **Given**: the create-workspace form is open.
- **When**: the user expands advanced options.
- **Then**: branch/name editing, GitHub Issue/PR import, priority/status, and labels are available without cluttering the primary form.
- **Signals**: primary form contains project/title/base branch; advanced section reveals optional fields; collapsed submit still sends valid defaults.

### S15 — Workspace creation failure stays recoverable

- **Level**: Component integration
- **Given**: `workspace_create` or setup progress reports an error.
- **When**: creation fails.
- **Then**: the app shows the error, stops loading, and allows retry/edit without navigating to a broken workspace.
- **Signals**: error text, route remains create form, no terminal attach attempted.

### S16 — Opening a workspace enters a terminal-first surface

- **Level**: Component integration
- **Given**: a workspace is selected from the list.
- **When**: the route opens.
- **Then**: the primary visible surface is one terminal renderer with native actions around it.
- **Signals**: `TerminalScreen` visible, no desktop Center Stage/mosaic UI, terminal action bar present.

### S17 — Multiple terminal candidates require picker

- **Level**: Component integration
- **Given**: a workspace has multiple tmux windows or persisted terminal candidates.
- **When**: the user opens the workspace.
- **Then**: the app asks the user to choose one terminal before attaching; it never renders multiple panes side by side.
- **Signals**: terminal picker visible, exactly one active terminal id after selection, only one WebView terminal renderer mounted.

### S18 — Mobile can create and attach a new terminal

- **Level**: Service-level + simulator smoke
- **Given**: a connected workspace.
- **When**: the user taps new terminal.
- **Then**: the native terminal WS sends `terminal_open`, receives `terminal_created`, and switches the active renderer to the new terminal.
- **Signals**: terminal WS messages, active terminal store update, terminal output appears in the single renderer.

### S19 — Fixed shortcut bar sends correct terminal actions

- **Level**: Unit / component integration
- **Given**: the terminal is active.
- **When**: the user taps Esc, Tab, arrows, Ctrl-C, Ctrl-D, Ctrl-L, Ctrl-A, Ctrl-E, and Agent response shortcuts.
- **Then**: modifier/navigation shortcuts send the configured byte sequences, Agent text shortcuts insert or submit according to their metadata, and workspace actions trigger native navigation/action handlers.
- **Signals**: terminal WS input calls, WebView bridge events, workspace action callback invocations.

### S20 — Changes & Commit surface opens from workspace

- **Level**: Component integration
- **Given**: a workspace/project route with a known repo path.
- **When**: the user opens Changes & Commit.
- **Then**: the mobile Git surface loads status and changed files through the main app WS.
- **Signals**: WS actions `git_get_status` and `git_changed_files`, staged/unstaged/untracked sections visible, repo path included in payloads.

### S21 — Changed files are grouped and counted correctly

- **Level**: Unit / component integration
- **Given**: a changed-files response with staged, unstaged, and untracked files.
- **When**: the list renders.
- **Then**: each file appears in the correct group with status and additions/deletions when available.
- **Signals**: list row counts match response arrays, totals shown, empty groups collapse or show an intentional empty state.

### S22 — Single-file diff is readable on phone width

- **Level**: Component integration + simulator visual smoke
- **Given**: a changed file with old and new content.
- **When**: the user taps that file.
- **Then**: `git_file_diff` loads the file and the mobile view renders an inline single-file diff without side-by-side desktop layout.
- **Signals**: WS action `git_file_diff`, file path title, added/removed/context rows visible, text does not require horizontal desktop panes.

### S23 — Whole-file stage and unstage refresh status

- **Level**: Integration
- **Given**: one unstaged file and one staged file.
- **When**: the user stages the unstaged file and unstages the staged file.
- **Then**: mobile sends whole-file `git_stage` / `git_unstage`, then refreshes status and changed files.
- **Signals**: WS payload `{ path, files }`, no chunk-patch actions, updated file groups after refresh.

### S24 — Commit with message succeeds

- **Level**: Integration / scripted
- **Given**: a repo with changed files and a non-empty commit message.
- **When**: the user commits from `CommitSheet`.
- **Then**: the app calls `git_commit`, shows success with commit hash when returned, and refreshes Git status.
- **Signals**: WS action `git_commit`, commit response `success=true`, changed-file list updates, commit loading state clears.

### S25 — Push committed changes succeeds or fails recoverably

- **Level**: Integration
- **Given**: the repo has unpushed commits.
- **When**: the user taps push.
- **Then**: the app calls `git_push`; success refreshes status, failure stays visible without losing the commit message or list state.
- **Signals**: WS action `git_push`, `has_unpushed_commits` status changes on success, error text on failure.

### S26 — Relay/network loss shows disconnected state

- **Level**: Component integration + simulator smoke
- **Given**: the app is connected to a Computer.
- **When**: the main app WS or active terminal WS disconnects.
- **Then**: a disconnected state is visible and terminal input is not queued silently.
- **Signals**: connection banner, disabled terminal input/shortcut actions or explicit rejected-send state, no queued input replay after reconnect.

### S27 — Offline workspace workflows are not pretended

- **Level**: Component integration
- **Given**: the device reports offline or Relay is unavailable.
- **When**: the user attempts import, workspace create, Git refresh, commit, or push.
- **Then**: the app shows an unavailable/disconnected message instead of accepting the action as pending work.
- **Signals**: disabled or rejected mutations, visible disconnected copy, no WS request enqueued.

### S28 — Platform smoke covers iOS first and Android before M1 acceptance

- **Level**: Simulator smoke
- **Given**: the app builds and dependencies are installed.
- **When**: smoke checks run.
- **Then**: iOS simulator can launch the app for dogfood, and Android emulator smoke passes before M1 acceptance.
- **Signals**: recorded commands and outcomes for iOS and Android, launch reaches onboarding/workspace list without red screen.

## Performance & load budgets

- Workspace activation from an already connected app reaches the terminal surface in under 10 seconds on a stable connection.
- Main app WS reconnect after transient Relay loss shows disconnected state within 2 seconds and clears it after successful reconnect.
- Terminal output batching should not freeze the JS thread during a burst of 100 small `terminal_output` messages.
- Changed-file list render remains responsive for 500 changed files; single-file diff opens within 2 seconds for a 1,000-line file on simulator.

## Regression checklist

- [ ] Access Token, `client_token`, register token, and server secrets never appear in logs, visible UI, AsyncStorage, WebView local storage, or thrown errors.
- [ ] The mobile app does not start or require a local Atmos Server on the phone.
- [ ] No mobile-only REST endpoint is added for project/workspace/Git business flows.
- [ ] Switching Computers closes stale WS sessions and clears terminal/Git state tied to the old Computer.
- [ ] The terminal WebView never receives Access Token, `client_token`, or Relay URLs.
- [ ] Opening a workspace with multiple terminals does not render multiple terminal panes.
- [ ] Changes & Commit does not expose commit history, PR panel, notes/TODO/review panels, AI commit generation, discard, or chunk-level patch controls in M1.
- [ ] Relay/network disconnect does not queue terminal input, Git commit, or push actions.
- [ ] iOS dogfood remains the priority path, but Android emulator smoke is not skipped before M1 acceptance.

## Acceptance criteria

- [ ] All PRD Must Have items M1-M20 are covered by scenarios above.
- [ ] `apps/mobile` is a real Expo app with Expo Router routes and no PWA/web-shell primary client.
- [ ] Access Token storage uses `expo-secure-store`; short-lived relay client sessions remain in memory.
- [ ] Workspace list, project import, workspace create, terminal attach/create, terminal shortcuts, and Changes & Commit are reachable from mobile UI.
- [ ] Main app business workflows use existing WS actions; relay bootstrap uses APP-016 REST only.
- [ ] Terminal rendering shows exactly one active terminal at a time.
- [ ] Changes & Commit supports changed-file list, single-file diff, whole-file stage/unstage, commit, push, and refresh only.
- [ ] Disconnected state is visible and prevents silent queued work.
- [ ] iOS simulator smoke and Android emulator smoke are recorded before M1 acceptance.
- [ ] Regression gates for changed packages/apps pass or have documented external-environment blockers.

## Manual verification steps

1. Start a real remote Atmos Server registered through Relay.
2. Launch the mobile app on an iOS simulator or device and create/paste an Access Token.
3. Confirm onboarding shows registration guidance when no Computer is online.
4. Select an online Computer and confirm the first post-auth screen is the workspace list.
5. Import a project from a remote filesystem path.
6. Create a workspace from mobile and confirm setup progress routes into the workspace.
7. Open a workspace with multiple terminal candidates and confirm the terminal picker appears.
8. Attach a terminal, use Esc/Ctrl/arrows/Agent shortcuts, create a new terminal, and switch back.
9. Make a small file change from the terminal, open Changes & Commit, inspect the diff, stage/unstage, commit, and push.
10. Disable network or Relay access and confirm disconnected state appears and terminal/Git actions are not queued.
11. Repeat launch smoke on Android emulator before declaring M1 accepted.

## Non-coverage

- App Store / Play Store packaging, signing, TestFlight, and Play Console release flows are out of M1 verification unless a later deployment spec adds them.
- Physical-device keyboard and IME edge cases are manual-only in this plan because simulator behavior is not authoritative.
- Tablet-specific layout is Nice to Have and not part of M1 acceptance.
- Organization/team Computer sharing is Nice to Have and not part of M1 acceptance.
