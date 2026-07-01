# APP-029 Native Preview Occlusion PRD

## Goal

Make Atmos desktop overlays usable when they overlap the right-sidebar native preview webview, without adding one-off hide/show conditions for every modal or popover.

## Users

- Desktop users running preview in the right sidebar.
- Users who open app-level dialogs, popovers, menus, search, or draggable overlays that can move over the preview area.

## Must Haves

1. When the embedded desktop-native preview is visible in the right sidebar, app overlays that intersect the preview area must not be visually blocked by the native webview.
2. The fix must not require enumerating every caller or feature-specific overlay state.
3. When the native preview is hidden due to occlusion, the preview panel must show a static React fallback instead of an empty or broken-looking region.
4. The native preview must restore automatically after the overlapping overlay closes or moves away.
5. Restore should avoid rapid flicker during overlay animation, resize, or drag.
6. The behavior must apply only to the embedded desktop-native preview. Normal iframe preview and the standalone preview window should keep their existing stacking behavior.

## Nice to Haves

- Support an explicit data attribute for future custom overlays that should participate in native-surface occlusion.
- Keep the detection local and cheap enough that it can run on resize, mutation, and pointer movement without visible input lag.

## Non-Goals

- Building a separate native overlay window.
- Pixel-perfect partial clipping of the native webview behind only the covered region.
- Capturing a true live bitmap screenshot of the native preview.
- Mobile or web-browser-only preview changes.
- Refactoring every overlay primitive in the app.

## Success Criteria

- A dialog or popover overlapping the right-sidebar native preview is visible and clickable above the fallback surface.
- Moving or closing the overlay restores the native preview automatically.
- Opening existing preview toolbar popovers continues to suspend and restore the native preview.
- No user-facing success toast is added for this behavior.
