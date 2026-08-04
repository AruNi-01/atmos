# Desktop Floating UI Over Native Preview (APP-052)

> **When to load**: Adding or changing **dialogs, modals, sheets, drawers, popovers, dropdowns, selects, tooltips, hover-cards, command palettes, or any portaled/floating chrome** that can appear over **desktop native preview** (`WebContentsView`). Also when changing preview occlusion, portal roots, or desktop overlay IPC.

> **Do not load** for pure web layout work with no floating surface, or mobile-only UI.

---

## Why CSS z-index is not enough

On production desktop (Electron), run/browser preview is a **main-process `WebContentsView`**, not a DOM node. It paints **above** the host shell WebContents.

- Host React `z-index` **cannot** stack above the guest view.
- Happy path: elevate floating UI into a **shared overlay surface** (one engine per host window).
- Fallback: **APP-029** geometry occlusion → temporarily **hide** native preview + static React placeholder.

Spec: [specs/APP/APP-052_desktop-overlay-surface/](../../specs/APP/APP-052_desktop-overlay-surface/)  
Related: [specs/APP/APP-029_native-preview-occlusion/](../../specs/APP/APP-029_native-preview-occlusion/)

---

## Non-negotiables

| Rule | Detail |
|------|--------|
| **Web must not change behavior** | Pure browser sessions: portals stay on `document.body` (or existing roots). No overlay engine, no hide-of-iframe for this reason. |
| **One shared overlay engine** | At most **one** overlay surface per host `BrowserWindow`. Never spawn one WebContentsView/window per popover. |
| **Lazy + idle reclaim** | Create on first need; tear down after idle with no elevated layers. Do not keep a permanent idle overlay process from app launch. |
| **Hide is fallback only** | Healthy elevation must not blank live preview solely because a menu/dialog opened. |
| **All host windows** | Main workbench **and** standalone/detached browser hosts that embed native preview. |

---

## Where the code lives

| Layer | Path / symbol |
|-------|----------------|
| Electron overlay manager | `apps/desktop-electron/src/overlay/overlay-surface-manager.ts` |
| Lifecycle (pure) | `apps/desktop-electron/src/overlay/overlay-lifecycle.ts` |
| IPC | `overlay_bridge_ensure` / `note_activity` / `release` / `set_pointer_mode` / `destroy`; capability via `get_desktop_capabilities` → `overlaySurface` |
| Web provider | `apps/web/src/shared/lib/desktop-overlay/floating-elevation-provider.tsx` (mounted in app layout) |
| Policy (pure, unit-tested) | `apps/web/src/shared/lib/desktop-overlay/elevation-policy.ts` |
| Layer open detection | `apps/web/src/shared/lib/desktop-overlay/layer-count.ts` |
| Runtime store | `apps/web/src/shared/lib/desktop-overlay/elevation-store.ts` |
| Portal container | `packages/ui` → `PortalContainerProvider` / `usePortalContainer` |
| Occlusion fallback | `apps/web/.../use-native-preview-occlusion.ts` + Preview suspend composition |

---

## Checklist when adding a floating UI primitive

### 1. Prefer `@workspace/ui` portals

Existing primitives (dialog, sheet, drawer, popover, dropdown-menu, select, tooltip, hover-card) already call `usePortalContainer()`.

- **New** Radix/Base UI floating primitive in `packages/ui`: wire **Portal** through `usePortalContainer()` the same way.
- Default context is unset → document body (web-safe).

### 2. Do not hardcode `document.body` for app chrome that can cover preview

If a feature uses `createPortal(..., document.body)` (or a fixed full-screen root **outside** the portal context):

- Prefer mounting under the shared portal context, **or**
- Mark with `data-atmos-native-surface-overlay` so APP-029 occlusion can still hide preview when elevation cannot cover it, **or**
- Use `data-atmos-ignore-native-surface-occlusion` only when the surface must never participate (rare; document why).

Host-only portals that stay on the shell document will remain **under** `WebContentsView` unless elevated or preview is hidden.

### 3. Markers and roles (occlusion + elevation recount)

Stable selectors used by both APP-029 and APP-052 layer counting include:

- `data-slot` values: `dialog-content`, `dialog-overlay`, `sheet-*`, `drawer-*`, `popover-content`, `dropdown-menu-content`, `select-content`, `tooltip-content`, `hover-card-content`, …
- `role="dialog"`, `aria-modal="true"`, `role="tooltip"`
- Opt-in: `data-atmos-native-surface-overlay`
- Opt-out: `data-atmos-ignore-native-surface-occlusion`

**Lifecycle open** (elevation refcount) treats `data-state !== "closed"` without requiring `opacity > 0` (fade-in).  
**Exception**: permanent markers like peek shells with `data-atmos-native-surface-overlay` still require visible opacity so they do not pin the overlay forever.

**Cross-realm footgun**: layer counting runs against the **overlay document** (a different window realm). Never use host-realm `instanceof HTMLElement` or host `window.getComputedStyle` on overlay nodes — use `nodeType === 1` and `el.ownerDocument.defaultView.getComputedStyle(el)` (`layer-count.ts`).

**Pointer classification**: tooltip / hover-card–only frames keep the overlay window `pass-through` (click-through, `showInactive`); any menu / popover / dialog layer switches to `capture` (+ keyboard focus moves to the overlay window; returned to host on release).

### 4. Suspend / hide composition (do not re-hardcode force-hide)

Preview suspend is composed in `shouldSuspendDesktopNativePreview` (`elevation-policy.ts`):

- **Always suspend**: loading, standalone handoff (embedded → detached).
- **Host occlusion**: geometry intersect against **host-document** floaters always suspends — elevated layers live in the overlay document and never appear as host occlusion candidates, so anything the geometry check still sees is by definition not covered.
- **Elevatable chrome** (favorites / header / global search, etc.): suspend **only if** `!elevationHealthy` (capability + surface ready + portal published; deliberately no layer-count so opening a popover cannot race a hide flash).

When adding a new “chrome open” flag that used to force-hide preview, **gate it on `!elevationHealthy`** (or rely on occlusion + markers). Do not OR unconditional force-hide for elevatable popovers.

### 5. Presence of native preview

Desktop-native active preview instances use **refcount** (`acquireNativePreviewSurface` / `releaseNativePreviewSurface`) so multi-preview and standalone hosts do not clear each other. Include standalone browser windows when the surface is desktop-native and active.

### 6. Electron shell (only when changing overlay behavior)

- Attach overlay host handling on **every** product window that can host preview (`main-window`, `secondary`, etc.).
- `ensure` prepares; **show/capture only when portal has open layers**; `release` hides, stops capturing input, and refocuses the host (empty overlay must not steal clicks or keyboard focus).
- The overlay `BrowserWindow` **must be constructed by main** via the `setWindowOpenHandler` `createWindow` callback — `transparent: true` through `overrideBrowserWindowOptions` alone is unreliable for renderer-initiated windows (electron#22281: paints opaque black).
- Do not reintroduce per-widget native windows as the default path.

---

## Web vs desktop matrix

| Runtime | Floating UI stacking |
|---------|----------------------|
| Browser web | Normal document stack; portal default body |
| Desktop, no native preview | Portal default body; no overlay ensure |
| Desktop + native preview | Elevate via portal container when capability on; APP-029 hide if elevation unavailable |

Capability: Electron `get_desktop_capabilities().overlaySurface === true` and `isDesktopRuntime()`.

---

## Anti-patterns

- Tuning `z-index` expecting to cover `WebContentsView`
- One `BrowserWindow` / `WebContentsView` per menu
- `createPortal` to `document.body` for large chrome over preview without markers or elevation
- Unconditional `shouldSuspendDesktopPreview ||= myPopoverOpen` for elevatable UI
- Loading this entire file for every UI tweak — only when floating surfaces or preview stacking are in scope

---

## Verification (lightweight)

- Unit: `apps/web/src/shared/lib/desktop-overlay/__tests__/*`, desktop `overlay-lifecycle.test.ts`
- Web e2e non-regression: `e2e/tests/specs/APP-052_desktop-overlay-surface.web.e2e.ts`
- Manual desktop: open dialog/menu/tooltip over live native preview — preview stays live when elevation healthy; hide fallback if overlay fails

---

## Related

- Spec APP-052 / APP-029 under `specs/APP/`
- Keyboard focus when opening overlays from terminal: [keyboard-shortcuts.md](./keyboard-shortcuts.md)
- Desktop package map: [apps/desktop-electron/AGENTS.md](../../apps/desktop-electron/AGENTS.md)
