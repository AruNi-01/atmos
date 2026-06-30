# Brainstorm · APP-028: Runtime Workbench i18n

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos workbench currently uses route-based `next-intl` locale segments under `apps/web/src/app/[locale]`. Switching language changes the route, which can remount the app shell in Web and Desktop. In Desktop this has caused partial black-screen states where the workspace list recovers but the rest of the shell does not.

The requirement is narrow: keep Landing and Docs on their existing i18n model, but make the workbench change language in place without route navigation.

## Goals (draft)

- Switch workbench language instantly without changing route, query, WebSocket connection, workspace context, panel state, or mounted shell components.
- Make the shared Web workbench implementation fix Desktop automatically because Desktop consumes the web static bundle.
- Keep Landing and Docs outside the migration.

## Options

### Option A — Runtime locale for workbench only

Use a client locale store/provider for the app shell and keep workbench routes locale-neutral.

**Pros**: matches desktop-app behavior, avoids shell remounts, simple user model.
**Cons**: requires untangling app-shell i18n from `[locale]` routing.
**Unknown**: exact routing cleanup needed for current `app/[locale]/(app)` structure.

### Option B — Patch current route-based switching

Keep `/zh/...` routes and preserve more state across locale route changes.

**Pros**: smallest local patch.
**Cons**: still treats language as navigation; fragile for Desktop; continues to remount app shell.
**Unknown**: how many state stores need special handling.

### Option C — Global route-based i18n everywhere

Keep all Web routes locale-prefixed and accept remounts.

**Pros**: strongest URL-level localization.
**Cons**: wrong fit for a stateful workbench; does not solve Desktop black-screen class of bugs.
**Unknown**: none for this request; this is rejected for workbench.

## Key forks in the road

- **Fork 1**: Workbench route locale vs runtime locale — decide in PRD. Current direction: runtime locale.
- **Fork 2**: Migrate Landing/Docs now vs leave them alone — decide in PRD. Current direction: leave them alone.
- **Fork 3**: Compatibility redirects for old `/zh/workspace` links — user explicitly said no compatibility needed.

## Open questions

- [ ] Whether the final workbench URL shape should remove locale segments entirely in the same change or in a follow-up cleanup.
- [ ] Whether locale persistence lives only in local storage first or is later synced into settings.

## References

- Existing code: `apps/web/src/app/[locale]/layout.tsx`
- Existing code: `apps/web/src/app/[locale]/(app)/layout.tsx`
- Existing code: `apps/web/src/app-shell/header-action-controls.tsx`
- Existing package: `packages/i18n`

## Ready to promote

- Promote to PRD: workbench language switching must not navigate, reload, or remount the shell.
- Promote to TECH: introduce a client runtime i18n provider for workbench and change the language menu to update that provider instead of calling `router.replace`.
