> **Beta release.** For dogfooding and regression testing. Please report issues before the next stable cut.

Atmos Desktop 2026.7.31-beta.1 hardens the workbench connection stack with a shared WebSocket session client, surfaces native terminal titles from OSC sequences, and polishes Canvas, composer, onboarding, and desktop-shell reliability since 2026.7.29.

## New Features

- Shared multi-client WebSocket wire types and session kernel (`@atmos/api-types` / `@atmos/api-client`) so web and mobile share one main `/ws` catalog, reconnect policy, and request correlation path — Desktop inherits the web cutover for more consistent connect/request behavior. ([#183](https://github.com/AruNi-01/atmos/pull/183))
- Terminal panes now show native OSC 0/2 titles as a readable suffix (APP-047), with marquee for long titles and filtering of noisy shell-path / agent-command titles. ([#180](https://github.com/AruNi-01/atmos/pull/180))
- Canvas empty marquee selection opens a compact add-widget UI so you can place widgets without hunting the toolbar. ([#178](https://github.com/AruNi-01/atmos/pull/178))
- Onboarding gains an agent detection step with a fixed layout and usage sync for a clearer first-run path.
- Agent automations: YOLO mode, split launch flags, and smarter builtin agent upgrades.
- Project and label colors use the shared ColorPicker; design system adds TabsSubtle, ColorPicker, and shared tokens.

## Bug Fixes

- Fixed terminal reconnect loops on attach errors and offer a clear New-session path when attach fails.
- Restored TUI terminal sessions after app restart. ([#175](https://github.com/AruNi-01/atmos/pull/175))
- Stabilized terminal titles, @ mention search, and canvas reattach after quality follow-ups.
- Composer `@` file search matches by file/folder name more reliably and keeps keyboard navigation peek rows stable. ([#177](https://github.com/AruNi-01/atmos/pull/177))
- Editor breadcrumb siblings load without requiring the sidebar file tree to be open.
- Context menus portal to the document body so they stay viewport-anchored.
- macOS Dock stays visible; Keychain re-prompts for browser cookie helpers are reduced.
- DevTools keyboard shortcuts stay disabled in release desktop builds.
- DMG volume title is product-only; unpacked release internals are no longer uploaded as assets.

## Improvements

- Landing install/download CTA points at the desktop download flow with clearer install UI. ([#176](https://github.com/AruNi-01/atmos/pull/176))
- Terminal toolbar squeeze/marquee polish and project action rail layout cleanup.
- E2E coverage for main `/ws` session cutover (smoke + specs) to catch connection regressions earlier. ([#183](https://github.com/AruNi-01/atmos/pull/183))

## Other Changes

- Release tag: `desktop-electron-2026.7.31-beta.1`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.7.29...desktop-electron-2026.7.31-beta.1
