# PRD · APP-028: Runtime Workbench i18n

> Product Requirements · WHAT and WHY. Settled direction for in-place language switching in the Atmos workbench.

## Context

- **Problem**: Workbench language switching currently changes the locale route, which can remount the stateful app shell and cause partial blank/black Desktop states.
- **Why now**: The Desktop bug shows the current route-based model is not robust for a persistent workspace UI.
- **Related specs**: Builds on the Desktop app surface in `APP-009_desktop-tauri`; does not change Landing or Docs.

## Goals

1. Users can switch language in the workbench without leaving or reloading the current workspace.
2. Desktop inherits the behavior from the shared `apps/web` implementation.
3. Landing and Docs keep their current i18n behavior.

## Users & Scenarios

- **Primary persona**: Atmos users working inside a long-lived Workspace or Project.
- **Key scenario**: A user changes language from the header menu while a workspace is open; the visible copy updates and the app remains in the same operational state.

## User Stories

- As a workbench user, I want language switching to update labels immediately so that I can keep working without losing context.
- As a Desktop user, I want language switching to behave like an app preference, not like navigation.
- As a maintainer, I want Landing/Docs i18n left untouched so the workbench migration stays scoped.

## Functional Requirements

### Must Have

- **M1**: Switching language in the workbench updates UI copy without changing pathname or query.
- **M2**: Switching language does not remount or reset the app shell: Header, sidebars, center stage, footer, workspace context, and open overlays remain stable.
- **M3**: The selected language persists across workbench reloads.
- **M4**: Desktop receives the same runtime language behavior through the web bundle.
- **M5**: Landing and Docs are out of the workbench migration and keep their existing model.

### Nice to Have

- **N1**: Locale preference can later sync to account/settings storage.
- **N2**: A future migration can remove unused workbench locale routes if the implementation leaves temporary route files in place.

## Out of Scope

- **Landing i18n changes** — keep marketing behavior unchanged.
- **Docs i18n changes** — keep documentation behavior unchanged.
- **Backward compatibility for `/zh/workspace` links** — explicitly not required for this pass.
- **Mobile i18n changes** — mobile has separate routing/runtime concerns.

## Success Metrics

- Leading: language switch does not trigger a route change or WebSocket reconnect in workbench.
- Qualitative: users no longer see Desktop black/blank shell states after switching language.
- Regression: existing workbench routes and query-driven state continue to work.

## Risks & Open Questions

- **Risk**: Some non-React utilities use statically imported message files and may need a small adapter to read the runtime locale.
- **Risk**: The current `[locale]` layout contains both global providers and workbench shell; moving only part of it must avoid breaking static export.
- **Open**: Should locale persistence initially be local-only or written to settings immediately?

## Milestones

- Phase 1 — Add runtime workbench locale provider and header switching.
- Phase 2 — Move/untangle workbench shell from locale route remount behavior.
- Phase 3 — Verify Web and Desktop smoke paths; leave Landing/Docs untouched.
