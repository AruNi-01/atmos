# APP-029 Native Preview Occlusion Test Plan

## Automated Checks

- Run web typecheck after implementation.
- Run web lint after implementation.
- Run `git diff --check`.

## Manual Scenarios

### Dialog Over Preview

1. Open Atmos desktop with a run preview in the right sidebar using desktop-native transport.
2. Open an app dialog that overlaps the preview area.
3. Verify the dialog remains visible and clickable over the preview region.
4. Verify the preview region shows the paused React fallback while overlapped.
5. Close the dialog.
6. Verify the native preview restores automatically.

### Popover Over Preview

1. Open a popover or dropdown that extends into the right-sidebar preview area.
2. Verify the native preview hides while the popover overlaps it.
3. Move focus or close the popover.
4. Verify the native preview restores without repeated flashing.

### Draggable Overlay Movement

1. Open a movable overlay or panel.
2. Drag it into the preview area.
3. Verify the native preview hides.
4. Drag it away.
5. Verify the native preview restores after a short stable delay.

### Non-Native Preview

1. Open a preview URL that uses same-origin iframe preview.
2. Open the same overlays.
3. Verify iframe preview behavior is unchanged.

### Standalone Preview Window

1. Open preview in a standalone window.
2. Open app overlays in the main app.
3. Verify the standalone preview does not incorrectly switch to the embedded fallback because of main-app overlay geometry.
