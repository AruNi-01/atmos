# PRD · APP-025: Mobile App

> Product Requirements · WHAT and WHY. Settled direction for a real mobile Atmos client focused on lightweight remote development through an Atmos Computer.

## Context

- **Problem**: Independent agentic builders cannot use Atmos comfortably from a phone today. The Web/Desktop shell is not designed for mobile operation, and forcing the Web app into a phone layout would pollute the desktop product.
- **Why now**: APP-016 Atmos Computer and Relay make it practical for a phone to act as a lightweight client for a remote Atmos Server. The phone does not need to run Atmos itself.
- **Related specs**: Builds on [APP-016 Atmos Computer](../APP-016_atmos-computer/PRD.md), [APP-020 Relay Stable Tenant Identity](../APP-020_relay-stable-tenant-identity/PRD.md), and [APP-024 Terminal Agent Run Config](../APP-024_terminal-agent-run-config/PRD.md) indirectly because Agent CLIs run inside terminals.

## Goals

1. Make Atmos usable from a phone for quick remote development actions against a selected Atmos Computer.
2. Ship a real mobile app experience, not a PWA or responsive variant of `apps/web`.
3. Keep M1 terminal-first while covering the minimum Git workflow: workspace/project access, project import, workspace creation, terminal attach/create, mobile terminal shortcuts, changed-file diff review, and commit/push.
4. Preserve Atmos's existing mental model: Projects, Workspaces, Terminals, Access Tokens, and Computers remain recognizable across Web/Desktop/Mobile.
5. Avoid full Web/Desktop parity in M1 so the mobile app can dogfood quickly and prove the terminal workflow first.

## Users & Scenarios

- **Primary persona**: Independent agentic builder who already uses Atmos on a remote Computer and wants phone access for lightweight work.
- **Scenario 1 · First mobile setup**: The user opens the mobile app, creates or pastes an Access Token, follows guidance to start/register an Atmos Server, selects an online Computer, and reaches the workspace list.
- **Scenario 2 · Continue work from phone**: The user opens the workspace list, selects a workspace, chooses the relevant terminal when multiple exist, and continues an Agent CLI or shell flow.
- **Scenario 3 · Start new work remotely**: The user imports a project by selecting a remote filesystem path, creates a workspace with a mobile-optimized form, and lands in a terminal.
- **Scenario 4 · Review and ship a small change**: The user opens the mobile Changes surface, reviews the changed-file list, inspects a single-file diff, writes a commit message, commits, and pushes without returning to Web/Desktop.
- **Scenario 5 · Recover from network loss**: The user's network drops; the app clearly shows disconnected state and resumes normal operation after reconnection without pretending offline actions succeeded.

## User Stories

- As an independent agentic builder, I want a real mobile Atmos app so that phone usage does not depend on a desktop web layout.
- As a remote Atmos user, I want to enter or create an Access Token on mobile so that I can connect to my Computers without manual credential copying across app surfaces.
- As a user setting up a new Computer, I want mobile onboarding to guide me through starting/registering Atmos Server so that I can reach a connected state without already knowing the Relay setup flow.
- As a user with multiple Computers, I want to list, switch, rename, and revoke Computers so that I can control which remote environment my phone is operating.
- As a builder, I want the post-login home to be my workspace list so that I can resume work immediately.
- As a builder, I want to import a remote project path and create a workspace from mobile so that I can start work without returning to desktop.
- As a terminal-heavy user, I want the workspace screen to focus on exactly one terminal so that the phone UI stays usable.
- As an Agent CLI user, I want fixed mobile shortcuts for terminal modifiers, agent interactions, and workspace actions so that common terminal operations are possible without a hardware keyboard.
- As a builder reviewing agent output, I want the mobile app to show changed files, single-file diffs, and commit actions so that I can approve and ship small changes from my phone.

## Functional Requirements

### Must Have

- **M1**: The deliverable is a real iOS/Android mobile app, not a PWA, responsive mobile Web shell, or embedded `app.atmos.land` client.
- **M2**: Mobile acts only as a client for a remote Atmos Computer. It must not require or attempt to run Atmos Server on the phone.
- **M3**: Users can create or paste an Access Token during onboarding, store it for future launches, switch tokens, and reset/rotate the token from mobile settings.
- **M4**: Onboarding guides users through starting or registering an Atmos Server and blocks normal app entry until at least one selectable Computer is available or the user explicitly stays on setup.
- **M5**: After authentication, the first screen is the workspace list. Settings, Computer selection, Computer rename/revoke, Access Token switching, and developer connection settings live outside the primary workspace list flow.
- **M6**: Users can list available Computers, see which Computer is selected, switch to another Computer, rename a Computer, and revoke a Computer from the mobile settings surface.
- **M7**: Users can import a project by browsing/searching remote server filesystem paths and validating a project path before creation.
- **M8**: Users can create a workspace from mobile with a short primary form: Project when not already scoped, workspace title, and base branch. Advanced fields may expose branch/name editing, GitHub Issue/PR import, auto TODO extraction, priority, status, and labels.
- **M9**: Workspace creation surfaces progress and failure states clearly, then routes users into the created workspace when creation succeeds.
- **M10**: Opening a Project or Workspace enters a terminal-first development surface rather than a desktop Center Stage clone.
- **M11**: The mobile terminal surface shows exactly one active terminal renderer at a time. If multiple terminal candidates exist, users must choose one from a native picker before attaching.
- **M12**: Users can create a new terminal from mobile. Creating a new terminal switches the visible terminal to the new one while keeping previous terminals available through the picker.
- **M13**: M1 includes fixed built-in terminal shortcuts for modifier/chord keys, arrow/navigation keys, common Agent CLI responses, paste/insert behavior, new terminal, terminal switcher, and workspace-list navigation.
- **M14**: M1 includes a mobile Changes & Commit surface reachable from the Project/Workspace development surface. This is the only Web right-sidebar capability included in M1.
- **M15**: The Changes & Commit surface shows the current repo/worktree status and changed files grouped as staged, unstaged, and untracked, with file status and additions/deletions when available.
- **M16**: Users can select a changed file and inspect a readable single-file diff optimized for phone width.
- **M17**: Users can stage/unstage whole files, enter a commit message, commit the current working changes using existing Atmos Git commit behavior, push committed changes, and refresh status from mobile.
- **M18**: Relay or network loss shows a clear disconnected state. M1 does not provide offline workspace workflows and must not queue terminal input while disconnected.
- **M19**: Lost-phone recovery for M1 is Access Token reset/rotation. No biometric gate, device enrollment, remote wipe, or device-level policy is required for M1.
- **M20**: Internal dogfood starts on iOS, but M1 acceptance requires at least one iOS simulator smoke pass and one Android emulator smoke pass.

### Nice to Have

- **N1**: Tablet-specific layout that can expose more context than phone while still avoiding desktop mosaic parity.
- **N2**: Customizable terminal shortcut palettes after the fixed M1 shortcut set proves useful.
- **N3**: Push notifications for long-running agent/session state.
- **N4**: Mobile-native Git history, PR, task, note, or review panels beyond the M1 Changes & Commit surface.
- **N5**: Organization/team Computer sharing and access management.

## Out of Scope

- **PWA / responsive Web adaptation**: M1 is a real mobile app; adapting `apps/web` for phone is explicitly avoided.
- **Running Atmos Server on phone**: Mobile is a client; Atmos Server remains on an Atmos Computer.
- **Full Web/Desktop parity**: Canvas, broad settings, automations management, review UI, and rich side panels are not part of M1. The only right-sidebar-derived M1 capability is Changes & Commit.
- **Web terminal mosaic layout on mobile**: No multiple panes side by side, no mobile equivalent of a Web terminal tab containing multiple mosaic windows.
- **Full right sidebar parity**: Commit history, PR panels, notes, TODOs, review surfaces, AI commit-message generation, chunk-level patch operations, and destructive discard flows are not part of M1 unless separately promoted later.
- **Offline workflows**: No cached editing, queued terminal input, or offline project/workspace operations.
- **Special lost-phone security controls**: Token reset/rotation is sufficient for M1.
- **Mobile-only business API shortcuts**: Product behavior should align with existing Atmos concepts rather than introducing a separate mobile-only product surface.

## Success Metrics

- **Setup completion**: In dogfood, a user can go from fresh app install to connected Computer and visible workspace list without desktop UI assistance after the remote Atmos Server is running.
- **Workspace activation**: From an already connected app, a user can open an existing workspace and reach an interactive terminal in under 10 seconds on a stable connection.
- **Creation flow**: Dogfood users can import a remote project path and create a workspace from mobile without returning to Web/Desktop.
- **Terminal usefulness**: Dogfood users can complete at least one real Agent CLI interaction from the phone using the fixed shortcut bar.
- **Diff and commit usefulness**: Dogfood users can inspect a changed file diff, commit, and push a small real change from mobile without returning to Web/Desktop.
- **Connection clarity**: During Relay/network loss, users can correctly tell that the app is disconnected and do not believe terminal input was accepted.
- **Qualitative**: The first dogfood user reports that the phone app is useful for small remote interventions, not just status checking.

## Risks

- **Risk**: A phone terminal may still be uncomfortable for meaningful development. M1 mitigates this by targeting lightweight interventions and Agent CLI control rather than full desktop parity.
- **Risk**: Users may expect Web/Desktop layout parity. M1 mitigates this by making terminal-first focus explicit and deferring rich panels.
- **Risk**: Diff review on a phone can become unreadable if it copies the desktop view. M1 mitigates this with a single-file, phone-width diff surface instead of multi-file or side-by-side desktop review.
- **Risk**: Onboarding depends on users already being willing to start/register an Atmos Server elsewhere. The app should make this visible rather than hiding the dependency.
- **Risk**: Multiple existing terminals can confuse mobile entry. M1 requires a picker and a single active terminal renderer to keep the phone surface focused.
- **Release gate**: Android emulator smoke is required before M1 acceptance, not for every product PR during early iOS dogfood.

## Milestones

- **Phase 1 · Product shell and onboarding**: Access Token entry/creation, guided Computer registration, Computer list/selection, workspace list home.
- **Phase 2 · Core workspace flows**: Remote-path project import, mobile workspace create, setup progress, workspace open.
- **Phase 3 · Terminal-first workspace**: Single active terminal renderer, terminal picker, new terminal, fixed shortcut bar, disconnected state.
- **Phase 4 · Changes & Commit**: Changed-file list, single-file diff review, whole-file stage/unstage, commit, push, and refresh status.
- **Phase 5 · Dogfood and release gate**: iOS dogfood against a real remote Atmos Computer, Android emulator smoke, PRD/TECH/TEST reconciliation before implementation handoff.
