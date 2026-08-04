"use client";

/**
 * APP-052: Elevate floating UI above desktop native preview (WebContentsView).
 *
 * Stability rules:
 * - While native preview is present, keep portalContainer **fixed** on the
 *   overlay document root. Do **not** flip it null↔root on every open (that
 *   remounts Radix content and causes flash + APP-029 hide thrash).
 * - Only show/hide the overlay BrowserWindow and toggle pointer capture.
 * - Layer counting runs against the **overlay document only**. Floating UI
 *   that stays in the host document is APP-029's job (occlusion hide); the
 *   overlay window must never show/capture for layers it does not contain.
 * - Pointer capture only when a non-hover layer (menu/popover/dialog…) is
 *   open. Tooltip/hover-card–only frames stay click-through so host clicks
 *   keep working.
 *
 * Pure web: capability false → container null → document body.
 */

import * as React from "react";
import { PortalContainerProvider } from "@workspace/ui";
import {
  desktopInvoke,
  desktopListen,
  isDesktopRuntime,
} from "@/shared/lib/desktop-bridge";
import { useDesktopElevationStore } from "./elevation-store";
import { OVERLAY_CREATE_BUDGET_MS } from "./constants";
import { summarizeOpenLayers, type OpenLayerSummary } from "./layer-count";
import type { OverlayPointerMode } from "./elevation-policy";

const OVERLAY_ROOT_ID = "atmos-overlay-root";
const OVERLAY_WINDOW_NAME = "atmos-desktop-overlay";

/** Debounce hide so brief 0-count frames during remount do not thrash. */
const HIDE_DEBOUNCE_MS = 120;

/** Force transparent shell after theme/style clone (prevents black full-window fill). */
const OVERLAY_TRANSPARENT_CSS = `
html, body, #${OVERLAY_ROOT_ID} {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
}
html, body {
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  width: 100% !important;
  height: 100% !important;
}
#${OVERLAY_ROOT_ID} {
  position: fixed !important;
  inset: 0 !important;
  pointer-events: none !important;
}
#${OVERLAY_ROOT_ID} > * {
  pointer-events: auto !important;
}
`;

function syncThemeToOverlayDocument(doc: Document) {
  try {
    const src = document.documentElement;
    const dst = doc.documentElement;
    dst.className = src.className;
    dst.style.colorScheme = src.style.colorScheme || "";
    const theme = src.getAttribute("data-theme");
    if (theme) dst.setAttribute("data-theme", theme);
    else dst.removeAttribute("data-theme");
    dst.style.background = "transparent";
    dst.style.backgroundColor = "transparent";
    if (doc.body) {
      doc.body.style.background = "transparent";
      doc.body.style.backgroundColor = "transparent";
      doc.body.style.margin = "0";
    }
  } catch {
    /* ignore */
  }
}

function hostStyleSignature(): string {
  const nodes = document.querySelectorAll("link[rel='stylesheet'], style");
  let textLength = 0;
  let hrefs = "";
  nodes.forEach((node) => {
    if (node.tagName === "LINK") hrefs += (node as HTMLLinkElement).href + ";";
    else textLength += node.textContent?.length ?? 0;
  });
  return `${nodes.length}:${textLength}:${hrefs}`;
}

/**
 * Mirror host stylesheets into the overlay document. Re-runs when the host
 * head changes (HMR, lazy-loaded chunks) using a cheap signature diff.
 */
function cloneStylesToOverlay(doc: Document) {
  try {
    const head = doc.head;
    if (!head) return;
    const signature = hostStyleSignature();
    if (head.getAttribute("data-atmos-overlay-styles") === signature) return;
    head.setAttribute("data-atmos-overlay-styles", signature);

    head
      .querySelectorAll("[data-atmos-overlay-style-clone]")
      .forEach((node) => node.remove());
    for (const node of Array.from(
      document.querySelectorAll("link[rel='stylesheet'], style"),
    )) {
      const clone = node.cloneNode(true) as HTMLElement;
      clone.setAttribute("data-atmos-overlay-style-clone", "1");
      head.appendChild(clone);
    }
  } catch {
    /* ignore */
  }
}

function forceOverlayTransparent(doc: Document) {
  try {
    let style = doc.head?.querySelector(
      "[data-atmos-overlay-transparent]",
    ) as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement("style");
      style.setAttribute("data-atmos-overlay-transparent", "1");
      doc.head?.appendChild(style);
    }
    style.textContent = OVERLAY_TRANSPARENT_CSS;
    syncThemeToOverlayDocument(doc);
  } catch {
    /* ignore */
  }
}

async function probeOverlayCapability(): Promise<boolean> {
  if (!isDesktopRuntime()) return false;
  try {
    const caps = (await desktopInvoke("get_desktop_capabilities")) as {
      overlaySurface?: boolean;
    };
    return caps?.overlaySurface === true;
  } catch {
    return false;
  }
}

export function FloatingElevationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const capability = useDesktopElevationStore((s) => s.capability);
  const nativePreviewPresent = useDesktopElevationStore(
    (s) => s.nativePreviewPresent,
  );
  const portalContainer = useDesktopElevationStore((s) => s.portalContainer);
  const setCapability = useDesktopElevationStore((s) => s.setCapability);
  const setSurfaceReady = useDesktopElevationStore((s) => s.setSurfaceReady);
  const setEnsureFailed = useDesktopElevationStore((s) => s.setEnsureFailed);
  const setPortalContainer = useDesktopElevationStore(
    (s) => s.setPortalContainer,
  );
  const setElevatedLayerCount = useDesktopElevationStore(
    (s) => s.setElevatedLayerCount,
  );
  const resetElevationRuntime = useDesktopElevationStore(
    (s) => s.resetElevationRuntime,
  );

  const overlayWindowRef = React.useRef<Window | null>(null);
  const portalRootRef = React.useRef<HTMLElement | null>(null);
  const ensurePromiseRef = React.useRef<Promise<boolean> | null>(null);
  const overlayMoRef = React.useRef<MutationObserver | null>(null);
  const overlayListenerDocRef = React.useRef<Document | null>(null);
  const rafIdsRef = React.useRef<number[]>([]);
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await probeOverlayCapability();
      if (!cancelled) setCapability(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [setCapability]);

  const attachPortalRoot = React.useCallback(
    (win: Window): HTMLElement | null => {
      try {
        const doc = win.document;
        syncThemeToOverlayDocument(doc);
        cloneStylesToOverlay(doc);
        forceOverlayTransparent(doc);
        let root = doc.getElementById(OVERLAY_ROOT_ID);
        if (!root) {
          root = doc.createElement("div");
          root.id = OVERLAY_ROOT_ID;
          doc.body.appendChild(root);
        }
        forceOverlayTransparent(doc);
        return root;
      } catch {
        return null;
      }
    },
    [],
  );

  /**
   * Prepare overlay window and **keep portalContainer published** while preview
   * is present so open menus never remount between body ↔ overlay.
   */
  const ensureOverlayReady = React.useCallback(async (): Promise<boolean> => {
    if (!capability || !nativePreviewPresent) return false;
    if (ensurePromiseRef.current) return ensurePromiseRef.current;

    if (
      overlayWindowRef.current &&
      !overlayWindowRef.current.closed &&
      portalRootRef.current &&
      useDesktopElevationStore.getState().portalContainer ===
        portalRootRef.current &&
      useDesktopElevationStore.getState().surfaceReady
    ) {
      return true;
    }

    ensurePromiseRef.current = (async () => {
      setEnsureFailed(false);
      try {
        let win = overlayWindowRef.current;
        if (!win || win.closed) {
          win = window.open("about:blank", OVERLAY_WINDOW_NAME);
          overlayWindowRef.current = win;
        }
        if (!win) {
          setEnsureFailed(true);
          setSurfaceReady(false);
          portalRootRef.current = null;
          setPortalContainer(null);
          return false;
        }

        const deadline = Date.now() + OVERLAY_CREATE_BUDGET_MS * 4;
        while (Date.now() < deadline) {
          try {
            if (win.document?.body) break;
          } catch {
            /* not ready */
          }
          await new Promise((r) => setTimeout(r, 16));
        }

        const root = attachPortalRoot(win);
        if (!root) {
          setEnsureFailed(true);
          setSurfaceReady(false);
          portalRootRef.current = null;
          setPortalContainer(null);
          return false;
        }
        portalRootRef.current = root;

        const result = (await desktopInvoke("overlay_bridge_ensure", {})) as {
          ok?: boolean;
          ready?: boolean;
        };
        if (!result?.ok) {
          setEnsureFailed(true);
          setSurfaceReady(false);
          portalRootRef.current = null;
          setPortalContainer(null);
          return false;
        }

        setSurfaceReady(true);
        setEnsureFailed(false);
        // Stable portal target for the whole preview session (no flip on open).
        setPortalContainer(root);
        // Stay hidden until layers open.
        await desktopInvoke("overlay_bridge_release", {}).catch(() => {});
        return true;
      } catch {
        setEnsureFailed(true);
        setSurfaceReady(false);
        portalRootRef.current = null;
        setPortalContainer(null);
        return false;
      } finally {
        ensurePromiseRef.current = null;
      }
    })();

    return ensurePromiseRef.current;
  }, [
    attachPortalRoot,
    capability,
    nativePreviewPresent,
    setEnsureFailed,
    setPortalContainer,
    setSurfaceReady,
  ]);

  const hideOverlayWindowDebounced = React.useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      // Re-check: if layers reappeared, do not hide.
      const portal = useDesktopElevationStore.getState().portalContainer;
      const summary = portal
        ? summarizeOpenLayers([portal])
        : { open: 0, capture: 0 };
      if (summary.open > 0) return;
      setElevatedLayerCount(0);
      // Main resets to pass-through on release; keep the store in sync.
      useDesktopElevationStore.getState().setPointerMode("pass-through");
      void desktopInvoke("overlay_bridge_release", {}).catch(() => {});
    }, HIDE_DEBOUNCE_MS);
  }, [setElevatedLayerCount]);

  // When preview appears: prepare stable portal. When gone: full teardown.
  React.useEffect(() => {
    if (!capability) return;

    if (!nativePreviewPresent) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      portalRootRef.current = null;
      overlayWindowRef.current = null;
      resetElevationRuntime();
      void desktopInvoke("overlay_bridge_release", {}).catch(() => {});
      return;
    }

    void ensureOverlayReady();
  }, [
    capability,
    ensureOverlayReady,
    nativePreviewPresent,
    resetElevationRuntime,
  ]);

  // Observe open layers in the overlay portal document.
  React.useEffect(() => {
    if (!capability || !nativePreviewPresent || typeof document === "undefined") {
      return;
    }

    let disposed = false;
    let recountScheduled = false;

    const applyLayerSummary = (summary: OpenLayerSummary) => {
      setElevatedLayerCount(summary.open);
      if (summary.open > 0) {
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        const mode: OverlayPointerMode =
          summary.capture > 0 ? "capture" : "pass-through";
        void (async () => {
          const ok = await ensureOverlayReady();
          if (disposed || !ok) return;
          const store = useDesktopElevationStore.getState();
          if (store.pointerMode !== mode) {
            store.setPointerMode(mode);
            await desktopInvoke("overlay_bridge_set_pointer_mode", {
              mode,
            }).catch(() => {});
          }
          // Shows the surface when hidden and keeps the idle timer cancelled.
          await desktopInvoke("overlay_bridge_note_activity", {}).catch(
            () => {},
          );
        })();
      } else {
        hideOverlayWindowDebounced();
      }
    };

    const recountNow = () => {
      if (disposed) return;
      // Overlay document only: host-document floaters are handled by APP-029
      // occlusion hide, never by showing an (empty) capture surface.
      const portal = useDesktopElevationStore.getState().portalContainer;
      applyLayerSummary(
        portal ? summarizeOpenLayers([portal]) : { open: 0, capture: 0 },
      );
    };

    const scheduleRecount = () => {
      if (recountScheduled) return;
      recountScheduled = true;
      for (const id of rafIdsRef.current) cancelAnimationFrame(id);
      rafIdsRef.current = [];
      recountNow();
      const id1 = requestAnimationFrame(() => {
        recountNow();
        const id2 = requestAnimationFrame(() => {
          recountScheduled = false;
          recountNow();
        });
        rafIdsRef.current.push(id2);
      });
      rafIdsRef.current.push(id1);
    };

    const onTransitionOrAnimation = () => scheduleRecount();

    const detachOverlayListeners = () => {
      const prevDoc = overlayListenerDocRef.current;
      if (prevDoc) {
        prevDoc.removeEventListener(
          "transitionend",
          onTransitionOrAnimation,
          true,
        );
        prevDoc.removeEventListener(
          "animationend",
          onTransitionOrAnimation,
          true,
        );
        overlayListenerDocRef.current = null;
      }
    };

    const attachOverlayMo = (portal: HTMLElement | null) => {
      overlayMoRef.current?.disconnect();
      overlayMoRef.current = null;
      detachOverlayListeners();
      if (!portal?.ownerDocument?.body) return;
      const doc = portal.ownerDocument;
      forceOverlayTransparent(doc);
      const mo = new MutationObserver(() => scheduleRecount());
      mo.observe(doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          "data-state",
          "aria-hidden",
          "aria-modal",
          "class",
          "style",
        ],
      });
      overlayMoRef.current = mo;
      doc.addEventListener("transitionend", onTransitionOrAnimation, true);
      doc.addEventListener("animationend", onTransitionOrAnimation, true);
      overlayListenerDocRef.current = doc;
    };

    attachOverlayMo(useDesktopElevationStore.getState().portalContainer);

    const unsub = useDesktopElevationStore.subscribe((s, prev) => {
      if (s.portalContainer !== prev.portalContainer) {
        attachOverlayMo(s.portalContainer);
        scheduleRecount();
      }
    });

    // Ensure portal is ready as soon as preview is present.
    void ensureOverlayReady().then(() => {
      if (!disposed) scheduleRecount();
    });

    return () => {
      disposed = true;
      overlayMoRef.current?.disconnect();
      detachOverlayListeners();
      unsub();
      for (const id of rafIdsRef.current) cancelAnimationFrame(id);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      void desktopInvoke("overlay_bridge_release", {}).catch(() => {});
    };
  }, [
    capability,
    ensureOverlayReady,
    hideOverlayWindowDebounced,
    nativePreviewPresent,
    setElevatedLayerCount,
  ]);

  React.useEffect(() => {
    if (!capability) return;
    let unlisten: (() => void) | undefined;
    void desktopListen("desktop-overlay:destroyed", () => {
      overlayWindowRef.current = null;
      portalRootRef.current = null;
      resetElevationRuntime();
    }).then((u) => {
      unlisten = typeof u === "function" ? u : undefined;
    });
    return () => {
      unlisten?.();
    };
  }, [capability, resetElevationRuntime]);

  // Keep theme + stylesheets mirrored while the portal is live (theme toggle,
  // HMR style injection, lazy-loaded chunk CSS).
  React.useEffect(() => {
    if (!portalContainer) return;
    const doc = portalContainer.ownerDocument;
    const sync = () => {
      forceOverlayTransparent(doc);
      cloneStylesToOverlay(doc);
    };
    sync();
    const themeMo = new MutationObserver(sync);
    themeMo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    const headMo = new MutationObserver(sync);
    if (document.head) {
      headMo.observe(document.head, { childList: true, subtree: true });
    }
    return () => {
      themeMo.disconnect();
      headMo.disconnect();
    };
  }, [portalContainer]);

  const containerForPortals =
    capability && nativePreviewPresent && portalContainer
      ? portalContainer
      : null;

  return (
    <PortalContainerProvider container={containerForPortals}>
      {children}
    </PortalContainerProvider>
  );
}
