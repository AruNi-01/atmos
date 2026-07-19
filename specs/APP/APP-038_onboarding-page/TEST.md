# TEST · APP-038: Onboarding Page

## 1. Test Strategy

We will verify this feature via:
1. **Type Checks**: Run TypeScript type checks using `just typecheck` to ensure the compilation is green.
2. **Backend Compilation**: Run `cargo check` to ensure the new Git check Rust handler compiles successfully.
3. **Manual UX Walkthrough**:
   - Clear `localStorage` to verify the onboarding page shows.
   - Verify step transitions work correctly.
   - Verify environment audit queries system status APIs properly.
   - Select a project using the path picker browser and submit.
   - Confirm it redirects into the main IDE layout.

---

## 2. Scenarios

### Scenario 1: First-time Web Launch
- **Given** the user has cleared their browser's local storage.
- **When** they visit the web app at `localhost:3000`.
- **Then** the full-screen onboarding page is rendered, hiding the main IDE layout.

### Scenario 2: Environment Audit Retry
- **Given** the user has missing dependencies (e.g. `tmux` or `gh` not installed).
- **When** they install the tool manually and click "Re-check".
- **Then** the check changes to successful (green).

### Scenario 3: Complete Onboarding
- **Given** the user is on the "Import Project" step.
- **When** they browse, select a directory, enter a name, and submit.
- **Then** `localStorage` sets `"atmos_onboarding_done"` to `"true"` and they enter the main editor.
