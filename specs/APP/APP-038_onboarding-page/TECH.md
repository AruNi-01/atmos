# TECH · APP-038: Onboarding Page

## 1. Backend Service & Route

### Git Status Check API
We add a Git check API in the Axum system handlers (same pattern as `gh` CLI status — thin handler with `spawn_blocking` around `std::process::Command`):
- **Path**: `GET /api/system/git-status`
- **Response Structure**:
  ```json
  {
    "success": true,
    "data": {
      "installed": true,
      "version": "2.40.1",
      "username": "example-user",
      "email": "user@example.com"
    }
  }
  ```
- Reads `git config --global user.name` / `user.email` so identity is not skewed by the API process cwd.

---

## 2. Frontend Components & Routing

### Local Storage Hook
Onboarding state is verified via:
- Key: `"atmos_onboarding_done"`
- Value: `"true"` (done) | not present (not done)
- Storage access is wrapped in `try/catch` (private browsing / disabled storage).

### Intercepting layout
`OnboardingGate` intercepts rendering in `apps/web/src/app/(app)/layout.tsx`:
- Skipped on hosted Atmos origins (`isHostedAtmosOrigin`) — those users complete Computer connection via `HostedWelcomeGate` instead.
- Otherwise reads `localStorage`. If onboarding is not completed, it displays `<OnboardingPage>` instead of the IDE grid/chrome (lazy-loaded).
- Employs a state transition once onboarding is finished.

### Dedicated URL Routing
We add a dedicated, standalone page route:
- **Path**: `apps/web/src/app/onboarding/page.tsx` & `OnboardingClientPage.tsx`
- **Route**: `/onboarding`
- **Behavior**: Permits entering/re-doing onboarding directly from this URL path (manual re-run). Upon completion, sets `atmos_onboarding_done` to `"true"` and redirects to `/`. Since it is outside the `(app)` route group, it does not inherit the layout's chrome overlay.
- First-run auto-show remains exactly-once via `OnboardingGate` + the storage flag (PRD). `/onboarding` is an explicit re-entry path.

### Step Logic
1. **Intro**: Shows the Atmos title, slogan, and cards explaining three main features.
2. **Environment Audit**:
   - Calls `systemApi.getTmuxStatus()`, `systemApi.getGitStatus()`, and `systemApi.getGhCliStatus()` (also available via `useTmuxStatusQuery` / `useGhCliStatusQuery` / system `useGitStatusQuery` in Settings).
   - Renders checks with green checkmarks or warning status badges.
   - Shows OS-aware copyable installation instructions if anything is missing; surfaces an error if the local API is unreachable.
3. **Import Project**:
   - Render input path and project name.
   - Leverages `FileBrowser` for directory selection.
   - Validates using `wsProjectApi.validatePath` (debounced; ignores stale responses; submit disabled while validating / until a result exists).
   - Triggers `addProject({ name, mainFilePath: path })` upon submission.
4. **Transition**: Sets `atmos_onboarding_done` to `"true"`, triggers the layout rendering, and welcomes the user.

### Particle Human Illustration Widget
On the right column, we render `<ParticleField>`:
- Uses the authentic component downloaded via `npx shadcn@latest add https://www.devl.dev/r/auth/check-email.json` (Vercel-hosted shadcn registry for this pack).
- Uses `welcome.png` asset to sample target dot matrices.
- Repels particles dynamically on hover.
- Configured with custom params (`sampleStep={3}`, `threshold={34}`, `dotSize={1}`, `renderScale={1.3}`) to fill the right half of the split layout.

---

## 3. Risks

| Risk | Mitigation |
|------|------------|
| `localStorage` unavailable (private mode) | Guard get/set; still allow completing the flow without persisting the flag (user may see onboarding again). |
| Hosted users forced through local CLI checks | `OnboardingGate` skips when `isHostedAtmosOrigin()`. |
| Path submit before validation finishes | Disable submit while validating / until `isGitRepo !== null`; sequence token ignores stale responses. |
| Blocking `git` subprocess on Tokio | Run checks inside `spawn_blocking`. |
