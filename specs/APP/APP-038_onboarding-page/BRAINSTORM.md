# Brainstorm · APP-038: Onboarding Page

> Exploration of the user onboarding experience for Atmos. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

When users first download and run Atmos, they need to be introduced to its capabilities (local-first agentic coding, terminal multiplexing, canvas workspace) and check if their local environment meets the required dependencies (`tmux`, `Git`, `GitHub CLI`). If these tools are missing, the agent execution or terminal window multiplexing features will fail.

Currently, Atmos lacks a unified first-time onboarding flow. The local version immediately shows the dense IDE interface, which can be overwhelming. We need a full-screen, minimalist, high-design onboarding page that runs only once on web.

## Goals (draft)

- **Primary Goal**: Introduce Atmos's unique selling points elegantly.
- **Dependency Audit**: Audit the user's local machine for tmux, Git, and GitHub CLI, providing install commands if missing.
- **Frictionless Onboarding**: Let the user choose/import their first project as part of the flow.
- **Single Run**: Only run once per client (cached in `localStorage`).

## Options

### Option A — Modal Overlay
Show a modal popup on top of the main IDE.
- **Pros**: Easy to implement without changing layout rendering.
- **Cons**: Visual clutter behind the modal; does not feel premium or immersive.

### Option B — Immersive Full-Screen Page (Selected)
Completely replace the main IDE layout with a full-screen, minimal dark onboarding screen until setup is finished.
- **Pros**: High-impact visuals, zero distraction, guides step-by-step.
- **Cons**: Requires layout interception.

## Key forks in the road

- **Fork 1**: Should we auto-install dependencies?
  - *Decision*: No, auto-installing dev tools requires sudo and can be insecure/brittle. We will display commands (like `brew install tmux git gh`) that users can copy and run.
- **Fork 2**: How to persist onboarding completion?
  - *Decision*: Store `atmos_onboarding_done` in `localStorage` for simplicity and web-level caching.

## References
- Core layout: `apps/web/src/app/(app)/layout.tsx`
- Tmux check: `apps/web/src/shared/hooks/use-tmux-check.ts`
- Gh CLI check: `apps/web/src/features/system/hooks/use-system-status-queries.ts`
