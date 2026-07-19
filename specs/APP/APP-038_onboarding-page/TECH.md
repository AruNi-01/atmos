# TECH · APP-038: Onboarding Page

## 1. Backend Service & Route

### Git Status Check API
We add a Git check API in the Axum system handlers:
- **Path**: `GET /api/system/git-status`
- **Response Structure**:
  ```json
  {
    "success": true,
    "data": {
      "installed": true,
      "version": "2.40.1",
      "username": "AruNi-01",
      "email": "aruni@atmos.land"
    }
  }
  ```

---

## 2. Frontend Components & Routing

### Local Storage Hook
Onboarding state is verified via:
- Key: `"atmos_onboarding_done"`
- Value: `"true"` (done) | not present (not done)

### Intercepting layout
`OnboardingGate` intercepts rendering in `apps/web/src/app/(app)/layout.tsx`:
- It reads `localStorage`. If onboarding is not completed, it displays `<OnboardingPage>` instead of the IDE grid/chrome.
- Employs a state transition once onboarding is finished.

### Dedicated URL Routing
We add a dedicated, standalone page route:
- **Path**: `apps/web/src/app/onboarding/page.tsx` & `OnboardingClientPage.tsx`
- **Route**: `/onboarding`
- **Behavior**: Permits entering/re-doing onboarding directly from this URL path. Upon completion, sets `atmos_onboarding_done` to `"true"` and redirects to `/`. Since it is outside the `(app)` route group, it does not inherit the layout's chrome overlay.

### Step Logic
1. **Intro**: Shows the Atmos title, slogan, and cards explaining three main features:
   - *Agentic Dev*: Let the AI agent do the heavy lifting.
   - *Terminal Multiplexing*: Smoothly managed tmux panes.
   - *Canvas Workspace*: Graphically script and trace work.
2. **Environment Audit**:
   - Queries `useTmuxStatusQuery()`, `useGhCliStatusQuery()`, and the new `useGitStatusQuery()`.
   - Renders checks with green checkmarks or warning status badges.
   - Shows copyable installation instructions if anything is missing.
3. **Import Project**:
   - Render input path and project name.
   - Leverages `FileBrowser` for directory selection.
   - Validates using `wsProjectApi.validatePath`.
   - Triggers `addProject({ name, mainFilePath: path })` upon submission.
4. **Transition**: Sets `atmos_onboarding_done` to `"true"`, triggers the layout rendering, and welcomes the user.

### Particle Human Illustration Widget
On the right column, we render `<ParticleField>`:
- Uses the authentic component downloaded via `npx shadcn@latest add https://www.devl.dev/r/auth/check-email.json`.
- Uses `welcome.png` asset to sample target dot matrices.
- Repels particles dynamically on hover.
- Configured with custom params (`sampleStep={3}`, `threshold={34}`, `dotSize={1}`, `renderScale={1.3}`) to fill the right half of the split layout.
