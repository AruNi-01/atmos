# APP-029 Native Preview Occlusion Technical Design

## Scope

Code changes live in `apps/web` and reuse existing desktop preview bridge behavior in `apps/desktop`. No backend API or WebSocket protocol changes are required.

## Current Architecture

The desktop-native run preview uses a Tauri child webview positioned over a React placeholder. React can request viewport updates, show, hide, and teardown through the existing preview transport controller. Because the child webview is native, normal CSS z-index cannot place React dialogs or popovers above it.

`Preview` already computes `shouldSuspendDesktopPreview` for known states such as standalone-window handoff, toolbar popovers, header overlays, global search, and right-sidebar collapse. `usePreviewLifecycleEffects` hides or shows the native preview from that single boolean.

## Design

### Occlusion Detection

Add a preview-scoped occlusion hook that:

- Runs only for embedded `desktop-native` preview.
- Reads the preview placeholder bounding rect.
- Finds visible app overlay candidates by stable UI markers such as `data-slot="dialog-content"`, `data-slot="popover-content"`, `data-slot="dropdown-menu-content"`, `data-slot="sheet-content"`, `role="dialog"`, `aria-modal="true"`, and an explicit opt-in attribute for future custom overlays.
- Ignores descendants of the preview surface.
- Treats an overlay as occluding when its client rect intersects the preview surface rect.
- Rechecks on DOM mutations, attribute changes, resize, scroll, pointer movement, transitions, and animations.
- Debounces restoration briefly so closing or moving overlays does not create native webview flicker.

This is not a per-feature registry. It is a geometry-based fallback for DOM overlays rendered above the app shell.

### Native Preview Suspension

Feed the hook result into the existing `shouldSuspendDesktopPreview` calculation. The lifecycle hook already centralizes native hide/show and viewport sync, so occlusion can reuse the same path instead of adding a new Tauri command.

When `shouldSuspendDesktopPreview` becomes true:

- `usePreviewLifecycleEffects` hides the native child webview.
- The React placeholder remains mounted and can be visually covered by dialogs/popovers.

When it becomes false:

- Existing lifecycle effects show the native preview and sync the current viewport.

### Fallback Surface

`PreviewViewport` receives an `isDesktopNativePreviewOccluded` prop. When true, it renders a static fallback state inside the desktop preview placeholder. The fallback includes localized copy and keeps the current transport message visible when present.

The fallback is intentionally non-interactive. It communicates that the preview is temporarily paused behind app UI. A true page screenshot is out of scope for this implementation.

### I18n

Any new visible fallback strings are added under the existing web locale files:

- `apps/web/messages/en.json`
- `apps/web/messages/zh.json`

## Risks and Mitigations

- False positives from hidden or inert DOM nodes: only visible nodes with non-empty rects and active styles count.
- Flicker during overlay animation: restoration is delayed for a short period while occlusion removal stabilizes.
- Missed custom overlays: future overlay code can opt in with the explicit data attribute without changing preview internals.

## Rollout

This is an internal desktop behavior change. It can ship behind the existing desktop-native preview path without a migration.
