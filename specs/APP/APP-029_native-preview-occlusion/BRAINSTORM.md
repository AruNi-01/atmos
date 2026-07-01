# APP-029 Native Preview Occlusion

## Problem

Atmos desktop uses a Tauri-managed native webview for run preview when the page cannot be safely embedded in a normal iframe. That solves cross-port and iframe-blocked preview, but it creates a stacking problem: the native child webview is not part of the React DOM stacking context. When app dialogs, popovers, menus, or draggable overlays move into the right sidebar preview area, the native preview can visually cover them.

The current workaround hides preview for several known popover states. That does not scale because any new modal, portal, floating panel, or draggable overlay can overlap the preview without being listed.

## Candidate Approaches

### 1. Geometry-based native surface occlusion manager

Track the native preview surface rectangle and compare it against visible app overlays rendered through portals or top-layer UI. If an overlay intersects the native preview bounds, hide the native preview until the intersection is gone.

This keeps the responsibility centralized and avoids enumerating each feature.

Benefits:
- Covers current and future app overlays without feature-specific preview code.
- Preserves the existing Tauri child-webview implementation.
- Uses existing hide/show viewport plumbing.
- Fits the current React architecture.

Risks:
- DOM heuristics must be conservative enough to avoid hiding preview for ordinary layout elements.
- Moving or animating overlays needs low-latency rechecks.

### 2. Static React fallback while the native preview is hidden

When the native webview is temporarily hidden, render a non-interactive React fallback in the preview region. The fallback should make the hidden state intentional rather than leaving a blank panel.

The first version can be a frozen, preview-shaped surface with current page title, URL, and status copy. A true bitmap snapshot can be added later only if it becomes necessary.

Benefits:
- Dialogs and popovers can render above the right sidebar area.
- Users keep spatial context that preview is paused, not closed.
- No native screenshot capture dependency is required for the first fix.

Risks:
- It is not a live preview while occluded.
- It is not pixel-identical to the page unless a future screenshot path is added.

### 3. Native overlay window above native preview

Move React overlays into a separate native always-on-top or sibling overlay window.

Benefits:
- Could preserve the live preview behind overlays.
- Could support native stacking directly.

Rejected for this scope:
- High implementation cost across focus, input routing, accessibility, dragging, window lifecycle, and multi-monitor edge cases.
- High maintenance cost for every overlay primitive.
- More invasive than the current bug requires.

## Decision

Implement approaches 1 and 2 only:

1. Add centralized occlusion detection for the desktop-native preview surface.
2. Hide the native preview while an app overlay intersects it and show a static React fallback.
3. Keep the native overlay-window approach out of scope.
