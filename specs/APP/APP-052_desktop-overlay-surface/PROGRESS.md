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

## Next / residual

- Electron headed dogfood of elevation over live preview (harness optional)
- Tight bounds pass-through for non-modal (v1 uses capture while portal layers open)
- Standalone browser presence marking if needed beyond shell attachHost
