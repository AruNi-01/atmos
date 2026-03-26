# Preview Component — Agent Guide

## Architecture

The Preview component (`Preview.tsx`) supports three transport modes:

| Mode | Where | How |
|------|-------|-----|
| `same-origin` | Web | Direct iframe access |
| `extension` | Web | Atmos Inspector browser extension |
| `desktop-native` | Desktop (Tauri) | Tauri child webview overlaid on main window |

The `desktop-native` mode is the most complex. Tauri adds a **child webview** (label `preview-inspector`) to the main window. Both webviews share the **same OS window**, which is the root cause of several subtle bugs.

---

## Tauri Child Webview — Cursor Flickering

### Problem

In Tauri's multi-webview architecture, cursor is managed at the **OS window level**, not per-webview. Both the child webview (preview page) and the parent webview (main app) independently set the window cursor. When they disagree, the cursor flickers rapidly between two values.

The CSS `cursor: auto` is the default for most HTML elements. Browsers internally resolve `auto` to different cursors depending on context:
- Over text glyphs → `text`
- Over buttons/interactive elements → `default`
- Over links → `pointer`

But `getComputedStyle(el).cursor` always returns the literal string `"auto"` — it does not tell you what the browser actually renders.

### Solution: `resolveAutoCursor()`

Located in `apps/desktop/src-tauri/src/preview_bridge/mod.rs` inside `desktop_bridge_script()`.

This function resolves `cursor: auto` to the concrete cursor value the browser would display, so the parent webview's cursor matches the child webview:

```
auto → textarea / contentEditable / text-type input  → "text"
auto → <a href> or inside one                        → "pointer"
auto → <button> / <select> / inside <button>         → "default"
auto → replaced elements (img, video, canvas, etc.)  → "default"
auto → user-select: none                             → "default"
auto → element has direct text node children          → "text"
auto → fallback                                      → "default"
```

### Key rules

1. **Every element under the mouse must report the correct cursor** — including overlay/toolbar elements injected by the preview runtime. Do not skip overlay elements; compute their cursor normally.
2. **Only send `cursor-changed` events when the value actually changes** — use `lastSyncedCursor` deduplication to avoid flooding the IPC channel.
3. **Reset `lastSyncedCursor` on `mousedown`** — but skip the reset for overlay elements (`data-atmos-preview-overlay`) to prevent spurious cursor events when clicking toolbar buttons.

### Common mistakes

- Returning `'default'` for all non-interactive elements. Text-containing elements like `<p>`, `<span>`, `<div>` with text must return `'text'`.
- Skipping overlay elements in the cursor tracker. Both webviews share one OS cursor; skipping an element leaves a stale cursor on the parent webview.
- Forgetting that `include_str!` embeds JS at **Rust compile time**. Changes to `packages/shared/preview/preview-runtime.js` require `cargo build` to take effect in the desktop app.

---

## Overlay Click Handling — Three Layers of Bugs

The overlay toolbar injects interactive buttons (Cancel, Copy, Expand) into the preview page during element selection. Making these buttons actually clickable required fixing three independent event-handling issues. All three must be correct simultaneously; missing any one makes the buttons silently unresponsive.

### Layer 1: Document-level capturing handler swallows overlay clicks

**Root cause.** The runtime registers a capturing click handler on `document` to intercept all clicks during pick mode:

```js
doc.addEventListener('click', handleClick, true);  // capturing phase
```

The original code called `event.preventDefault()` + `event.stopPropagation()` **unconditionally** before checking anything else. This killed overlay button clicks at the document level — the event never reached the button.

**Fix.** Check for overlay elements first and return early (without stopping propagation):

```js
function handleClick(event) {
  if (!state.enabled) return;
  var target = event.target;
  if (target instanceof Element && target.closest
      && target.closest('[data-atmos-preview-overlay="true"]')) return;
  event.preventDefault();
  event.stopPropagation();
  // ... rest of handler
}
```

### Layer 2: Button defensive handlers use capturing — kills child-element clicks

**Root cause.** `createButtonBase()` registers `mousedown` and `click` handlers to prevent page interference. The button DOM structure is: `button > span > svg > path`. When the user clicks the icon, the event target is the SVG `<path>`, not the `<button>`.

With `useCapture: true` on the button's defensive handler:

```
Capturing: document(handleClick→skip) → … → button(stopPropagation!) → span → svg → path
→ Event dies at button during capturing. Never reaches <path> target.
→ Never bubbles back. Action handler (registered in bubbling) never fires.
```

**Fix.** Remove `true` from `createButtonBase()`'s event listeners so they use **bubbling**:

```js
// WRONG — kills events targeting child elements
button.addEventListener('click', function(e) { ... }, true);

// CORRECT — fires during bubbling after child target phase
button.addEventListener('click', function(e) { ... });
```

With bubbling, the event reaches `<path>` (target), then bubbles back through `button` where **all** handlers on the same element fire in registration order. `stopPropagation()` only prevents propagation to **other elements** — it does not suppress other handlers on the same element.

```
Capturing: document → button → span → svg → path (target, no handler)
Bubbling:  path → svg → span → button(defensive handler + action handler) → stops
```

### Layer 3: Parent container capturing handlers block descendants

**Applies to extension runtime only.** The `toolbar` and `detailsCard` elements registered `stopPropagation` handlers with `useCapture: true`. Since `toolbar` is an ancestor of the buttons, the capturing handler on `toolbar` fires **before** the event reaches any button inside it — killing the event.

**Fix.** Use bubbling (no `true`) for container-level defensive handlers:

```js
// WRONG
[toolbar, detailsCard].forEach(node => {
  node.addEventListener('click', stopPropagation, true);
});

// CORRECT
[toolbar, detailsCard].forEach(node => {
  node.addEventListener('click', stopPropagation);
});
```

### Why this is hard to debug

- All three layers fail silently — no errors, no console output.
- The button appears correctly styled and shows hover effects (mouseenter/mouseleave are separate events unaffected by click handling).
- `stopPropagation()` vs `stopImmediatePropagation()` confusion: `stopPropagation` allows other handlers on the **same** element to fire but prevents propagation to **other** elements. This distinction is critical when the button is not the event target.

---

## React Callback Cascade → Tauri Webview Flash

### Problem

In `desktop-native` mode, Tauri's `show()` and `updateViewport()` IPC calls cause a visible full-page flash on the child WKWebView. These calls are triggered by `useEffect` hooks that depend on `showDesktopPreview`, which sits at the end of a long `useCallback` dependency chain:

```
[some state] → useCallback A → useCallback B → ... → syncDesktopPreview → showDesktopPreview → useEffect fires → show() + updateViewport() → FLASH
```

Any state change that causes **any** callback in this chain to be recreated will trigger the effect and flash the preview. This has bitten us twice through different trigger states:

| Trigger | Cascade path | Symptom |
|---------|-------------|---------|
| `normalizedActiveUrl` changed (SPA navigation) | `onNavigationChanged` → `setActiveUrl` → `normalizedActiveUrl` → `createTransportHandlers` recreated → chain fires | Flash on every route click |
| `selectionInfo` changed (element selected) | `setSelectionInfo` → `handleDesktopToolbarCopy` recreated → `createTransportHandlers` recreated → chain fires | Flash on element select click |

### Solution: Ref-based decoupling

For any value that:
1. Is read inside a `useCallback` that feeds into the `syncDesktopPreview` chain, AND
2. Changes frequently during normal user interaction

Use a **ref** to read the value inside the callback body, and remove the state variable from the dependency array:

```typescript
const selectionInfoRef = useRef(selectionInfo);
selectionInfoRef.current = selectionInfo;

const handleDesktopToolbarCopy = useCallback(async (userNote?: string) => {
  const info = selectionInfoRef.current;  // read from ref
  // ...
}, [dismissSelectionPopover]);  // selectionInfo NOT in deps
```

Similarly, `desktopCommittedUrlRef` and `normalizedActiveUrlRef` are used to prevent `onNavigationChanged` from triggering the cascade during SPA navigation.

### Key rules

1. **Never add frequently-changing state to a `useCallback` that feeds `createTransportHandlers`** — trace the full chain: `createTransportHandlers` → `syncDesktopPreview` → `showDesktopPreview` → effect → `show()`. If your state ends up in this chain, the preview will flash.
2. **State for triggering Tauri IPC vs state for reading inside callbacks** — use the state variable in `useEffect` dependency arrays when you *want* to trigger an IPC call (e.g., `desktopCommittedUrl` for probe-initiated navigation). Use refs inside callback bodies for values that change as side effects of user interaction.
3. **Test element selection AND route navigation after any callback dependency change** — both paths share `createTransportHandlers` and can independently trigger the cascade.

### Debugging tip

If the preview flashes on some interaction, add `console.trace('showDesktopPreview called')` inside `showDesktopPreview` to see which effect triggered it, then trace backwards through the dependency arrays to find which state change caused the cascade.

---

## WKWebView Focus Isolation — URL Input Blur Bug

### Problem

In `desktop-native` mode, the child WKWebView is a separate native view, not an HTML iframe. Clicks on the child webview do **not** dispatch `blur` or `focusout` events to the parent webview's DOM. This means:

1. User focuses the URL input → `isUrlInputFocused = true`
2. User clicks on the preview (child WKWebView) → **no blur event fires**
3. `isUrlInputFocused` stays `true` → URL bar stuck showing the `<input>` instead of the page title display
4. SPA route changes in the child webview still fire `onNavigationChanged`, but the URL bar doesn't switch back to display mode

### Solution

Force-blur the URL input programmatically when we detect user interaction with the child webview:

1. **In `onNavigationChanged` and `onCursorChange` handlers** (Preview.tsx):
   ```typescript
   if (document.activeElement === urlInputRef.current) {
     urlInputRef.current?.blur();
   }
   ```

2. **In the injected bridge script** (preview_bridge/mod.rs): reset `lastSyncedCursor` on `mousedown` so that even a click without mouse movement will emit a `cursor-changed` event on the next `mousemove`:
   ```javascript
   document.addEventListener('mousedown', function() {
     lastSyncedCursor = '';
   }, true);
   ```

### Key rules

1. **Never assume DOM focus events cross the native/web boundary** — WKWebView child views are invisible to the parent webview's focus model.
2. **Use IPC events as proxy for "user is interacting with the child webview"** — `cursor-changed` and `navigation-changed` are reliable signals that the user has moved attention to the preview.

---

## Preview Runtime — Always Prevent Default in Pick Mode

### Problem

The `handleClick` function in `preview-runtime.js` had an early return when `state.locked` was truthy (element already selected):

```javascript
function handleClick(event) {
  if (!state.enabled || state.locked) return;  // BUG: no preventDefault!
  event.preventDefault();
  // ...
}
```

When an element was already selected and the user clicked again (e.g., on a link), the click's default action was NOT prevented. If the selected element was a link, the browser would navigate, causing a full page reload → flash → selection overlay destroyed.

### Solution

Always call `preventDefault()` and `stopPropagation()` when pick mode is enabled, then check `state.locked`:

```javascript
function handleClick(event) {
  if (!state.enabled) return;
  event.preventDefault();
  event.stopPropagation();
  if (state.locked) return;
  // ... select element
}
```

### Key rule

**In pick mode, ALL clicks must be intercepted** — regardless of whether an element is already selected. The runtime owns the click lifecycle; never let the browser's default action fire.

---

## File Map

| File | Role |
|------|------|
| `apps/desktop/src-tauri/src/preview_bridge/mod.rs` | Rust-side bridge: opens/manages the child webview, injects `desktop_bridge_script()`, forwards events between child webview and main window |
| `packages/shared/preview/preview-runtime.js` | Canonical runtime shared by desktop bridge (via `include_str!`) and extension. Creates overlay, handles pick mode, emits selection events |
| `extension/preview-runtime.js` | Extension-specific copy of the runtime (rendered inside iframe, has full overlay with `setCursor`) |
| `Preview.tsx` | React component: toolbar UI, transport management, cursor application (`onCursorChange` sets `viewport.style.cursor`) |
| `preview-transports/desktop-transport.ts` | Connects to the desktop child webview via Tauri IPC events |

---

## Checklist for Future Preview Work

### Overlay / event handling
- [ ] Any new interactive element in the overlay must have `data-atmos-preview-overlay="true"` on itself or an ancestor
- [ ] New overlay elements with text content will inherit correct cursor from `resolveAutoCursor` — no special handling needed
- [ ] Event handlers on overlay buttons must use **bubbling** (no `true` third argument) since the click target may be a child SVG element
- [ ] In pick mode, `handleClick` must always call `preventDefault()` before any early return — never let the browser navigate
- [ ] Keep `packages/shared/preview/preview-runtime.js` and `extension/preview-runtime.js` in sync for overlay structure and event handling

### React callback / Tauri IPC
- [ ] Before adding state to a `useCallback` dependency array, trace the full chain to `showDesktopPreview` — if it reaches there, use a ref instead
- [ ] After modifying any `useCallback` in Preview.tsx, test both **route navigation** and **element selection** in desktop-native mode for flash regressions
- [ ] Any new `useCallback` that reads selection/navigation state and feeds into `createTransportHandlers` must use refs for frequently-changing values

### Focus / input
- [ ] DOM focus events do NOT cross the WKWebView boundary — if new UI elements need to lose focus on child webview interaction, add explicit blur logic in `onCursorChange` or `onNavigationChanged`

### Build
- [ ] Test in the desktop app after `cargo build` — JS changes embedded via `include_str!` require recompilation
