# Brainstorm · APP-025: Mobile App

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos already has a Web/Desktop client and an Atmos Computer relay path. A phone cannot realistically host the Atmos Server itself, but it can be a lightweight client that uses a user Access Token, selects a remote Computer, and drives projects, workspaces, and terminal sessions through Relay.

The direction is a real cross-platform mobile app built with Expo / React Native, not a PWA or responsive web adaptation. Standard app chrome, forms, lists, sheets, and controls should use Expo UI native components where they fit, while Atmos-specific surfaces such as the terminal may still need a specialized renderer.

The trigger is both product need and timing: an independent agentic builder wants a phone workflow, and the Atmos Computer / Relay architecture is now mature enough to make a real mobile client plausible.

The immediate product idea is not full Web parity. The useful mobile slice is quick workspace/project operations and a terminal-first development surface: list workspaces, import a project, create a workspace, open a workspace or project, then operate the terminal with mobile-friendly shortcuts.

There is no acceptable current substitute. The existing web app is not suitable for phone operation, and adapting the web shell deeply for mobile would pollute the desktop web product. SSH/mobile terminal apps and desktop remote control do not provide a first-class Atmos workflow.

## Goals (draft)

- Primary: make Atmos usable from a phone for lightweight development actions against a remote Atmos Computer.
- Primary: ship a real Expo / React Native mobile app, not a PWA.
- Primary: keep the MVP terminal-first and small enough to ship without rebuilding the full Web/Desktop shell.
- Primary: use the existing Access Token + Relay model so mobile is a client entry point, not a separate API product.
- Primary: use Expo UI for native-feeling standard controls and app surfaces where practical.
- Secondary: provide mobile-specific terminal ergonomics: modifier keys, common commands, paste/history, quick actions, and session switching.
- Secondary: choose a mobile stack that can move quickly while leaving room for shared API/types with the existing web app.

## Settled inputs

- First persona: independent agentic builder.
- M1 may create a new user Access Token inside the mobile app, then guide the user through starting/registering an Atmos Server. The hosted `app.atmos.land` no-token onboarding flow is the closest existing reference.
- After login, the home screen should show the workspace list first.
- Settings, Computer selection, and Access Token switching belong in a settings drawer, not the primary workspace list.
- New workspace should keep functional parity with the current web flow where the interaction is feasible on mobile; the UI form can be redesigned.
- Import project means selecting a remote server filesystem path, following the web flow conceptually.
- Mobile can create terminal sessions. Users can operate Agent CLIs inside those terminals rather than needing a separate mobile-only agent surface in M1.
- Highest-priority terminal shortcuts: modifier keys, agent interaction commands, and workspace actions.
- M1 terminal shortcuts are fixed built-ins, not user-customizable.
- When Relay/network is unavailable, show a clear disconnected state only. No offline workflow is required.
- Lost-phone security does not require a special M1 device-security feature; users can reset/rotate the Access Token.

## Options

### Option A — Terminal-first Expo MVP

Build a new `apps/mobile` Expo app with a small native navigation stack:

- Access Token entry/creation and stored session.
- Onboarding that guides the user to start/register an Atmos Server, reusing the existing hosted no-token flow as a product reference.
- Workspace list as the home screen.
- Settings drawer for app settings, Computer selection, and Access Token switching.
- Remote-path project import flow.
- Create workspace flow with web-equivalent capability where mobile interaction allows it.
- Full-screen development view centered on terminal rendering.
- Terminal creation and session switching.
- Fixed M1 terminal accessory controls for Esc/Ctrl/Alt/Tab/arrows, paste, agent interaction commands, workspace actions, resize/orientation, and session switching.
- Expo UI native controls for app chrome, forms, lists, menus, sheets, dialogs, and settings.

**Pros**:
- Matches the settled direction: Expo + Expo Router + Expo UI + TanStack Query + React Hook Form + Zustand + Zod + NativeWind.
- Keeps the UX honest for phones instead of forcing the desktop shell into a narrow viewport.
- Lets the MVP focus on terminal operation, which is the core value of mobile Atmos.

**Cons**:
- Requires deciding how to render and drive a terminal well on iOS/Android.
- Duplicates some Web client state and API orchestration unless shared packages are deliberately extracted.
- App-store/mobile release workflow adds product and QA overhead.

**Unknown**:
- Whether terminal rendering should be native, WebView-based, or a custom React Native surface.
- Whether M1 needs both iOS and Android, or can start with one platform.

### Option B — Native app with WebView terminal reuse

Build the real Expo app for all regular UI, but render the terminal through an embedded WebView that can reuse web terminal code or xterm-style behavior.

**Pros**:
- Keeps the product as a real app while reducing terminal renderer risk.
- May reuse proven terminal rendering behavior from the Web/Desktop client.
- Lets Expo UI own the surrounding native shell, forms, sheets, and shortcuts while terminal remains specialized.

**Cons**:
- WebView keyboard behavior, viewport resizing, selection, and clipboard handling can still be fragile.
- Native accessory controls must bridge cleanly into the WebView terminal.
- Risks a split feel if the terminal surface does not visually integrate with the Expo UI shell.

**Unknown**:
- How much terminal code can be reused without pulling in desktop shell assumptions.
- Whether WebView terminal latency is acceptable over Relay on real devices.

### Option C — Full native mobile workspace client

Treat mobile as a first-class Atmos client, not just a terminal companion:

- Rich project/workspace dashboards.
- Terminal session manager with multiple panes/tabs.
- Agent run controls, model/run-config selection, task/note panels, Git status, automation controls, and notifications.
- Phone/tablet-specific layouts, with tablet possibly closer to desktop Center Stage.
- User-customizable terminal shortcut palettes and deeper workspace operations.

**Pros**:
- Best long-term product shape if mobile becomes a real daily client.
- Can expose high-value Atmos features beyond terminal access.
- Tablet support could make remote Atmos development substantially more comfortable.

**Cons**:
- Too large for the first spec if the goal is MVP learning.
- High parity burden with Web/Desktop.
- Risks committing to native abstractions before the terminal and Relay experience is proven.

**Unknown**:
- Which Web/Desktop features users actually need on mobile versus which are desktop-only.
- Whether tablet should be scoped separately from phone.

### Option D — Mobile companion for approvals and quick terminal actions

Solve the adjacent problem: do not make mobile a development client yet. Make it a companion app for quick approvals, status checks, and short terminal commands.

**Pros**:
- Smaller terminal rendering burden.
- Better fit for phones if most serious coding remains on desktop.
- Could pair naturally with automations, GitHub triggers, or agent review/approval flows later.

**Cons**:
- Does not satisfy the explicit desire to open a workspace/project and work in the terminal.
- May feel like a notification utility rather than Atmos mobile.
- Still needs Access Token, Relay sessions, and a reliable connected Computer model.

**Unknown**:
- Whether users primarily want emergency terminal access or a broader mobile development surface.

## Key forks in the road

- **Resolved direction — Real mobile app**: Expo / React Native app, not PWA or mobile-web-first. Use Expo UI for native standard controls where practical.
- **Resolved first user**: independent agentic builders, not broad team/mobile review workflows in M1.
- **Resolved home shape**: workspace list first; settings drawer owns settings, Computer selection, and Access Token switching.
- **Resolved project import**: remote server filesystem path selection, not Git URL clone as the primary import meaning.
- **Resolved terminal capability**: mobile can create terminal sessions; Agent CLI operation happens inside the terminal.
- **Resolved shortcuts**: fixed built-in M1 shortcut set focused on modifiers, agent interaction commands, and workspace actions.
- **Resolved disconnected behavior**: show disconnected state only; no offline cached workflow.
- **Fork 1 — Terminal renderer**: native terminal surface vs WebView/xterm reuse vs custom React Native terminal rendering — decide in TECH after prototyping on real devices.
- **Fork 2 — MVP scope boundary**: workspace list/import/create + terminal vs adding Git/task/note/automation panels — decide in PRD.
- **Fork 3 — Mobile navigation model**: phone-native stack with settings drawer and bottom sheets vs a reduced Center Stage concept — decide in PRD.
- **Fork 4 — Transport shape**: reuse APP-016 Relay client sessions and existing Atmos WS-first flows vs adding mobile-only REST shortcuts — decide in TECH; default should avoid duplicate business transports.
- **Fork 5 — Access Token onboarding**: exact create-token/register-server flow inside mobile and what can be reused from hosted web onboarding — decide in PRD/TECH.
- **Fork 6 — Platform scope**: iOS + Android from M1 vs one platform first vs tablet-specific follow-up — decide in PRD.

## Open questions

- [ ] Which exact web create-workspace capabilities are mandatory in mobile M1, and which are too awkward for phone interaction?
- [ ] What is the first fixed shortcut list for modifiers, agent commands, and workspace actions?
- [ ] Should M1 terminal rendering start with WebView reuse or a native/custom React Native terminal surface?
- [ ] What parts of hosted web onboarding can mobile reuse directly, and what must become native screens?
- [ ] Should iOS and Android both be required for M1 acceptance, or can one platform validate the product first?

## References

- Existing code:
  - `apps/web/src/features/connection/lib/atmos-access-token.ts`
  - `apps/web/src/features/connection/lib/atmos-computer-store.ts`
  - `apps/web/src/features/connection/lib/hosted-connection.ts`
  - `apps/web/src/features/connection/lib/hosted-connection-actions.ts`
  - `apps/web/src/features/connection/hooks/use-websocket.ts`
  - `apps/web/src/features/welcome/components/HostedWelcomeGate.tsx`
  - `apps/web/src/features/atmos-computer/components/AtmosComputerSection.tsx`
  - `apps/web/src/features/atmos-computer/components/RemoteComputerSetupBlock.tsx`
  - `apps/web/src/app-shell/header-action-controls.tsx`
  - `apps/web/src/features/project/store/use-project-store.ts`
  - `apps/web/src/features/project/components/CreateProjectDialog.tsx`
  - `apps/web/src/features/workspace/components/CreateWorkspaceDialog.tsx`
  - `apps/web/src/features/workspace/store/workspace-creation-store.ts`
  - `apps/web/src/app-shell/CenterStage.tsx`
  - `apps/web/src/features/terminal/components/Terminal.tsx`
  - `apps/web/src/features/terminal/hooks/use-terminal-websocket.ts`
  - `apps/web/src/api/rest-api.ts`
  - `apps/web/src/api/relay.ts`
  - `apps/api/src/relay/`
  - `packages/relay/src/index.ts`
  - `packages/relay/src/server-hub.ts`
- Related specs:
  - [APP-016 Atmos Computer](../APP-016_atmos-computer/PRD.md)
  - [APP-020 Relay Stable Tenant Identity](../APP-020_relay-stable-tenant-identity/PRD.md)
  - [APP-022 Canvas Terminal New Tab](../APP-022_canvas-terminal-new-tab/PRD.md)
  - [APP-024 Terminal Agent Run Config](../APP-024_terminal-agent-run-config/PRD.md)
- Chosen baseline stack to evaluate:
  - Expo
  - Expo Router
  - Expo UI for native standard controls
  - TanStack Query
  - React Hook Form
  - Zustand
  - Zod
  - NativeWind

## Ready to promote

- Promote to PRD: mobile is a lightweight client for a remote Atmos Computer; it does not run Atmos Server on the phone.
- Promote to PRD: the product direction is a real Expo / React Native app, not PWA or responsive mobile web.
- Promote to PRD: first persona is the independent agentic builder.
- Promote to PRD: M1 should support mobile-side Access Token creation/entry and guided Atmos Server startup/registration.
- Promote to PRD: the post-login home screen is the workspace list; settings, Computer selection, and Access Token switching live in a settings drawer.
- Promote to PRD: MVP should include remote-path project import, web-equivalent create-workspace capability where mobile interaction allows it, terminal creation, and a terminal-first development view.
- Promote to PRD: standard mobile UI should use Expo UI native controls where practical.
- Promote to PRD: mobile terminal ergonomics are part of the MVP, not polish: fixed built-in modifier/accessory keys, agent interaction commands, workspace actions, paste, and session switching.
- Promote to PRD: Relay/network loss shows a disconnected state only; phone-loss recovery is Access Token reset/rotation, not a special M1 device-security feature.
- Promote to PRD: defer full Web/Desktop parity, multi-pane Canvas, and broad settings management unless user research proves they are required.
- Promote to TECH: create `apps/mobile` with Expo and the proposed React Native stack.
- Promote to TECH: reuse APP-016 Access Token + Relay sessions, and keep Relay as routing/auth/presence rather than mobile-specific business logic.
- Promote to TECH: prototype terminal rendering before locking the final architecture.
- Promote to TECH: use hosted web onboarding/access-token/register-token flows as references for mobile onboarding.
- Promote to TECH: explore shared DTO/schema packages so mobile does not copy Web API contracts by hand.
