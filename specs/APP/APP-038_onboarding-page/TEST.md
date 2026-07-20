# TEST · APP-038: Onboarding Page

## 1. Test Strategy

We will verify this feature via:
1. **Type Checks**: Run TypeScript type checks using `just typecheck` to ensure the compilation is green.
2. **Backend Compilation**: Run `cargo check -p api` to ensure the new Git check Rust handler compiles successfully.
3. **Manual UX Walkthrough** / exploratory agent-browser:
   - Clear `localStorage` to verify the onboarding page shows.
   - Verify step transitions work correctly.
   - Verify environment audit queries system status APIs properly.
   - Select a project using the path picker browser and submit.
   - Confirm it redirects into the main IDE layout.
4. **Playwright E2E**: Not yet automated for APP-038 first-run gate (existing `e2e` onboarding covers hosted `/setup` Computer flow). Tracked as a follow-up.

---

## 2. Coverage map

| PRD item | Scenario |
|----------|----------|
| First-run full-screen onboarding | S1 |
| Environment audit + recheck | S2 |
| Import project + completion flag | S3 |
| Hosted users skip local onboarding | S4 |

---

## 3. Scenarios

### Scenario 1: First-time Web Launch
- **Given** the user has cleared their browser's local storage on a non-hosted origin.
- **When** they visit the web app at `localhost:3030`.
- **Then** the full-screen onboarding page is rendered, hiding the main IDE layout.
- **Signals**:
  - DOM shows onboarding step copy from `onboarding.intro.*` (e.g. “Welcome to Atmos”).
  - IDE chrome (`Header` / sidebars) is not present.
  - `localStorage.getItem('atmos_onboarding_done')` is not `"true"`.

### Scenario 2: Environment Audit Retry
- **Given** the user has missing dependencies (e.g. `tmux` or `gh` not installed).
- **When** they install the tool manually and click “Re-check”.
- **Then** the check changes to successful (green).
- **Signals**:
  - `GET /api/system/tmux-status` (and git/gh peers) return `{ installed: true, ... }`.
  - UI shows `onboarding.check.statusInstalled` with a green check icon for that tool.

### Scenario 3: Complete Onboarding
- **Given** the user is on the “Import Project” step.
- **When** they browse, select a directory, enter a name, and submit.
- **Then** `localStorage` sets `"atmos_onboarding_done"` to `"true"` and they enter the main editor.
- **Signals**:
  - Submit stays disabled while path validation is in flight (`isValidating`).
  - After success, `localStorage.getItem('atmos_onboarding_done') === 'true'`.
  - Main app chrome (`Header`) becomes visible.

### Scenario 4: Hosted origin skips local onboarding
- **Given** the app is served from a hosted Atmos origin and Computer bootstrap is connected.
- **When** the user loads the app shell.
- **Then** `OnboardingGate` does not show the local tmux/git/gh wizard.
- **Signals**:
  - `isHostedAtmosOrigin()` is true.
  - Hosted welcome / connected shell renders without `OnboardingPage`.
