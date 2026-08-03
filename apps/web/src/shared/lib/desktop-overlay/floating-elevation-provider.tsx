"use client";

/**
 * APP-052: Elevate floating UI above desktop native preview (WebContentsView).
 *
 * Stability rule (fixes open/close flicker):
 * - While native preview is present, keep portalContainer **fixed** on the overlay
 *   document root. Do **not** flip it null↔root on every menu open (that remounts
 *   Radix content and causes flash + APP-029 hide thrash).
 * - Only show/hide the overlay BrowserWindow and toggle pointer capture.
 * - When preview goes away, clear portal and release the surface.
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
import { countOpenLayers } from "./layer-count";

const OVERLAY_ROOT_ID = "atmos-overlay-root";
const OVERLAY_WINDOW_NAME = "atmos-desktop-overlay";

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

function cloneStylesToOverlay(doc: Document) {
  try {
    const head = doc.head;
    if (!head) return;
    if (head.querySelector("[data-atmos-overlay-styles]")) return;
    const mark = doc.createElement("meta");
    mark.setAttribute("data-atmos-overlay-styles", "1");
    head.appendChild(mark);

    for (const node of Array.from(
      document.querySelectorAll("link[rel='stylesheet'], style"),
    )) {
      head.appendChild(node.cloneNode(true));
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
  /** Overlay window currently shown + capturing. */
  const windowShownRef = React.useRef(false);
  /** Debounce hide so brief 0-count frames during remount do not thrash. */
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const HIDE_DEBOUNCE_MS = 120;

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
        windowShownRef.current = false;
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

  const showOverlayWindow = React.useCallback(async () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    const win = overlayWindowRef.current;
    if (win && !win.closed) {
      try {
        forceOverlayTransparent(win.document);
      } catch {
        /* ignore */
      }
    }
    useDesktopElevationStore.getState().setPointerMode("capture");
    await desktopInvoke("overlay_bridge_set_pointer_mode", {
      mode: "capture",
    }).catch(() => {});
    await desktopInvoke("overlay_bridge_note_activity", {}).catch(() => {});
    windowShownRef.current = true;
  }, []);

  const hideOverlayWindowDebounced = React.useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      // Re-check: if layers reappeared, do not hide.
      const portal = useDesktopElevationStore.getState().portalContainer;
      const n = portal ? countOpenLayers([portal]) : 0;
      if (n > 0) return;
      windowShownRef.current = false;
      setElevatedLayerCount(0);
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
      windowShownRef.current = false;
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

  // Observe open layers in the **overlay portal** (and host only as bootstrap).
  React.useEffect(() => {
    if (!capability || !nativePreviewPresent || typeof document === "undefined") {
      return;
    }

    let disposed = false;
    let recountScheduled = false;

    const applyLayerCount = (n: number) => {
      setElevatedLayerCount(n);
      if (n > 0) {
        void (async () => {
          const ok = await ensureOverlayReady();
          if (disposed || !ok) return;
          if (!windowShownRef.current) {
            await showOverlayWindow();
          } else {
            // Keep idle timer cancelled while layers stay open.
            await desktopInvoke("overlay_bridge_note_activity", {}).catch(
              () => {},
            );
          }
        })();
      } else {
        hideOverlayWindowDebounced();
      }
    };

    const recountNow = () => {
      if (disposed) return;
      const portal = useDesktopElevationStore.getState().portalContainer;
      // Primary: layers already elevated into portal document.
      let n = portal ? countOpenLayers([portal]) : 0;
      // Bootstrap: first open still paints on body until portal is published;
      // after ensureOverlayReady publishes portal, next open goes straight there.
      // While portal is ready, also count host body layers that use the same
      // markers only if they are NOT already under portal (hostCount for
      // transition). Prefer max so we don't flicker hide.
      if (portal) {
        const hostN = countOpenLayers([document.body]);
        // If portal is set, Radix should target portal — host body should be 0
        // for elevated primitives. If host still has layers, keep shown.
        n = Math.max(n, hostN);
      } else {
        n = countOpenLayers([document.body]);
      }
      applyLayerCount(n);
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

    const hostMo = new MutationObserver(() => scheduleRecount());
    hostMo.observe(document.body, {
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
    document.addEventListener("transitionend", onTransitionOrAnimation, true);
    document.addEventListener("animationend", onTransitionOrAnimation, true);

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
      hostMo.disconnect();
      overlayMoRef.current?.disconnect();
      detachOverlayListeners();
      unsub();
      for (const id of rafIdsRef.current) cancelAnimationFrame(id);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      document.removeEventListener(
        "transitionend",
        onTransitionOrAnimation,
        true,
      );
      document.removeEventListener(
        "animationend",
        onTransitionOrAnimation,
        true,
      );
      windowShownRef.current = false;
      void desktopInvoke("overlay_bridge_release", {}).catch(() => {});
    };
  }, [
    capability,
    ensureOverlayReady,
    hideOverlayWindowDebounced,
    nativePreviewPresent,
    setElevatedLayerCount,
    showOverlayWindow,
  ]);

  React.useEffect(() => {
    if (!capability) return;
    let unlisten: (() => void) | undefined;
    void desktopListen("desktop-overlay:destroyed", () => {
      overlayWindowRef.current = null;
      portalRootRef.current = null;
      windowShownRef.current = false;
      resetElevationRuntime();
    }).then((u) => {
      unlisten = typeof u === "function" ? u : undefined;
    });
    return () => {
      unlisten?.();
    };
  }, [capability, resetElevationRuntime]);

  React.useEffect(() => {
    if (!portalContainer) return;
    const doc = portalContainer.ownerDocument;
    const sync = () => forceOverlayTransparent(doc);
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    return () => mo.disconnect();
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
