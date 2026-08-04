# PROGRESS · APP-052 Desktop Overlay Surface

## Status

Implementation in progress on `feat/APP-052-desktop-overlay-surface`.

## Done

- Specs: BRAINSTORM / PRD / TECH / TEST
- Electron: `OverlaySurfaceManager`, lifecycle, IPC (`overlay_bridge_*`, `get_desktop_capabilities`)
- Web: elevation policy (pure), store, FloatingElevationProvider, APP-029 suspend gate
- UI: PortalContainerProvider + dialog/popover/menu/select/tooltip/hover-card/sheet/drawer
- Units: 27+ APP-052 unit tests pass (policy, store, layer-count, lifecycle, occlusion tooltips)
  - Evidence: `bun test apps/desktop-electron/src/overlay/overlay-lifecycle.test.ts` and `bun test apps/web/src/shared/lib/desktop-overlay apps/web/src/features/run-preview/hooks/__tests__/use-native-preview-occlusion.test.ts`
- Web e2e: APP-052 web non-regression pass
- Review loop: B1–B4, R1–R4 addressed

## 2026-08-03 · Bug-fix pass (user report: floaters invisible or window blacks out)

Root causes and fixes tracked in [REVIEW.md](./REVIEW.md) (REV-001…REV-005), all fixed:

- REV-001: cross-realm `instanceof HTMLElement` → overlay layer count always 0 → surface never shown (realm-safe `layer-count.ts`).
- REV-002: `window.open` transparency unreliable → opaque black overlay (main now constructs the window via `setWindowOpenHandler` `createWindow`).
- REV-003: unconditional capture for any layer (tooltips!) ate host clicks (pass-through vs capture classification, web owns pointer mode).
- REV-004: host-document layers counted into elevation (overlay-doc-only counting; host floaters = APP-029 hide; chrome gated on `elevationHealthy`).
- REV-005: keyboard focus handoff to overlay on capture, back to host on release.

Also: `elevation-policy.ts` trimmed to the two functions product code uses; overlay style mirror re-syncs on host head changes (HMR / lazy CSS).

Verification: `bun test src/shared/lib/desktop-overlay/` (16 pass), desktop-electron overlay tests (5 pass), `just typecheck` web/ui ✓ (e2e failure pre-existing APP-043), `bun run build` desktop ✓.

## Next / residual

- Electron headed dogfood of elevation over live preview (Esc / typeahead / dialog input focus matrix — REV-005 manual check)
- Tight bounds pass-through for non-modal (v1 uses capture while non-hover portal layers open)
- Standalone browser presence marking if needed beyond shell attachHost
