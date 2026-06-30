# TECH · APP-028: Runtime Workbench i18n

> Technical Design · HOW. Implements PRD APP-028: Runtime Workbench i18n.

## Scope summary

This doc covers the Web workbench and Desktop-shared language switching model. It addresses M1-M5. It does not change Landing, Docs, Mobile, or old locale-link compatibility.

## Architecture overview

Previous workbench language was coupled to the Next route segment:

```text
apps/web/src/app/[locale]/layout.tsx
  -> NextIntlClientProvider(messages for route locale)
  -> apps/web/src/app/[locale]/(app)/layout.tsx
     -> Header + PanelLayout + LeftSidebar + CenterStage + RightSidebar + Footer
```

Target workbench behavior:

```text
Header language menu
  -> runtime locale store/provider
  -> NextIntlClientProvider locale/messages update
  -> workbench copy rerenders in place
```

Workbench routes live directly under `apps/web/src/app` without a `[locale]`
segment. Locale-prefixed workbench URLs are not supported for this pass.

## Module-by-module design

### packages/i18n

- Keep existing routing helpers for route-based surfaces that still need them.
- Add or expose shared locale constants/types if needed.
- Do not force workbench language changes through `createNavigation`.

### apps/web

- Add a workbench runtime i18n provider under `apps/web/src/providers` or `apps/web/src/shared/i18n`.
- Provider responsibilities:
  - load `en.json` / `zh.json` for the workbench client;
  - persist selected locale to local storage;
  - set `<html lang="...">`;
  - wrap workbench UI with `NextIntlClientProvider` using runtime `locale` and `messages`.
- Update `apps/web/src/app-shell/header-action-controls.tsx`:
  - remove language-switch `router.replace`;
  - call `setLocale(nextLocale)` on the runtime provider;
  - close the menu without navigation.
- Untangle workbench layout from locale remount behavior:
  - move the stateful workbench shell outside the `[locale]` route segment;
  - ensure switching language no longer touches the route.
- Keep Landing and Docs route i18n untouched.

### apps/desktop

- No separate Desktop UI implementation is expected.
- Desktop consumes the `apps/web` static bundle, so the Web workbench runtime locale behavior applies automatically.
- Desktop-specific verification is still required because Tauri/WKWebView exposed the remount failure mode.

## Data model

No backend data model changes.

Initial persistence can be local:

```ts
type WorkbenchLocale = "en" | "zh";
const WORKBENCH_LOCALE_STORAGE_KEY = "atmos:v1:global:locale";
```

## Transport

No new REST APIs and no new WebSocket messages. Locale switching is client UI state for this pass.

## Security & permissions

- Locale does not grant permissions or expose sensitive data.
- Do not log message catalogs or user data while debugging i18n state.

## Rollout plan

1. Add runtime locale provider and hook.
2. Switch header language menu from route navigation to runtime locale update.
3. Adjust workbench provider/layout placement so the shell does not remount on locale change.
4. Remove the temporary locale-preserving navigation workaround if obsolete.
5. Verify Web workbench and Desktop static build.

## Risks & tradeoffs

- **Tradeoff**: Runtime locale is less URL-semantic than `/zh/...`, but it matches a stateful workbench and Desktop app preference model.
- **Risk**: Some utility translators import messages directly and may not update until they read the runtime locale source.
- **Rollback path**: revert the header switcher/provider changes and return to route-based locale switching.

## Dependencies & compatibility

- Depends on current `next-intl` usage in `apps/web`.
- No compatibility for old workbench locale URLs is required by this spec.

## Open questions

- [ ] Whether local storage is enough for v1 or whether settings sync should be included.
- [x] Delete `[locale]/(app)` workbench routes in the first implementation. Decision: yes; no compatibility layer is required for old locale-prefixed workbench URLs.
