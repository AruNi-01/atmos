"use client";

/**
 * APP-052: Elevate floating UI above desktop native preview (WebContentsView).
 *
 * Critical lifecycle (bugfix for black screen / silent menus):
 * 1. Never leave portalContainer set while the overlay window is hidden.
 * 2. Show overlay first, then set portal container (so createPortal is never
 *    into a hidden document).
 * 3. On release: clear portalContainer first (portals return to body), then hide.
 * 4. Overlay document must stay visually transparent (no dark theme body fill).
 *
 * Pure web: capability false → PortalContainerProvider null → document body.
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

/** Force transparent chrome after theme class / stylesheet clone (prevents black fill). */
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
/* Floating content must receive clicks; root stays pass-through for empty areas
   once we use ignoreMouseEvents(false) the whole window captures — content still
   needs pointer-events auto for nested interactive nodes. */
#${OVERLAY_ROOT_ID} > * {
  pointer-events: auto !important;
}
`;

function syncThemeToOverlayDocument(doc: Document) {
  try {
    const src = document.documentElement;
    const dst = doc.documentElement;
    // Class for CSS variables / component tokens — backgrounds forced transparent below.
    dst.className = src.className;
    dst.style.colorScheme = src.style.colorScheme || "";
    const theme = src.getAttribute("data-theme");
    if (theme) dst.setAttribute("data-theme", theme);
    else dst.removeAttribute("data-theme");
    // Never inherit opaque page background onto the overlay shell.
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
    // Always re-apply after theme sync / late stylesheet clone.
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
  /** Prepared portal root — only published to store while overlay is shown. */
  const portalRootRef = React.useRef<HTMLElement | null>(null);
  const ensurePromiseRef = React.useRef<Promise<boolean> | null>(null);
  const overlayMoRef = React.useRef<MutationObserver | null>(null);
  const overlayListenerDocRef = React.useRef<Document | null>(null);
  const rafIdsRef = React.useRef<number[]>([]);
  /** True while we intentionally show the overlay and publish portalContainer. */
  const elevationActiveRef = React.useRef(false);

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
   * Prepare overlay window + portal root. Does NOT publish portalContainer
   * and does NOT show the window (avoids portal-into-hidden / black flash).
   */
  const ensureOverlay = React.useCallback(async (): Promise<boolean> => {
    if (!capability || !nativePreviewPresent) return false;
    if (ensurePromiseRef.current) return ensurePromiseRef.current;

    // Already prepared.
    if (
      overlayWindowRef.current &&
      !overlayWindowRef.current.closed &&
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
          return false;
        }

        const started = Date.now();
        const deadline = started + OVERLAY_CREATE_BUDGET_MS * 4;
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
          return false;
        }

        // Surface ready for activation — portal still unpublished until show.
        setSurfaceReady(true);
        setEnsureFailed(false);
        return true;
      } catch {
        setEnsureFailed(true);
        setSurfaceReady(false);
        portalRootRef.current = null;
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
    setSurfaceReady,
  ]);

  const showOverlayWindow = React.useCallback(async () => {
    useDesktopElevationStore.getState().setPointerMode("capture");
    await desktopInvoke("overlay_bridge_set_pointer_mode", {
      mode: "capture",
    }).catch(() => {});
    await desktopInvoke("overlay_bridge_note_activity", {}).catch(() => {});
  }, []);

  /**
   * Activate elevation: show overlay, then publish portal root so Radix
   * re-portals into a visible transparent window.
   */
  const activateElevation = React.useCallback(async (): Promise<boolean> => {
    const ok = await ensureOverlay();
    if (!ok || !portalRootRef.current) return false;

    // Re-assert transparency right before show (theme may have changed).
    const win = overlayWindowRef.current;
    if (win && !win.closed) {
      try {
        forceOverlayTransparent(win.document);
      } catch {
        /* ignore */
      }
    }

    await showOverlayWindow();
    elevationActiveRef.current = true;
    setPortalContainer(portalRootRef.current);
    return true;
  }, [ensureOverlay, setPortalContainer, showOverlayWindow]);

  /**
   * Deactivate: unpublish portal first (menus return to body), then hide overlay.
   */
  const deactivateElevation = React.useCallback(() => {
    elevationActiveRef.current = false;
    setPortalContainer(null);
    setElevatedLayerCount(0);
    void desktopInvoke("overlay_bridge_release", {}).catch(() => {});
  }, [setElevatedLayerCount, setPortalContainer]);

  React.useEffect(() => {
    if (!nativePreviewPresent) {
      elevationActiveRef.current = false;
      portalRootRef.current = null;
      overlayWindowRef.current = null;
      resetElevationRuntime();
      void desktopInvoke("overlay_bridge_release", {}).catch(() => {});
    }
  }, [nativePreviewPresent, resetElevationRuntime]);

  // Recount host/portal layers; drive activate/deactivate.
  React.useEffect(() => {
    if (!capability || !nativePreviewPresent || typeof document === "undefined") {
      return;
    }

    let disposed = false;
    let recountScheduled = false;
    let inFlight = false;

    const applyCounts = (hostCount: number, portalCount: number) => {
      setElevatedLayerCount(portalCount);

      // Any open elevatable layer on host or portal → elevate.
      // Host-only: content is still on body until we activate and re-portal.
      if (hostCount > 0 || portalCount > 0) {
        if (inFlight) return;
        inFlight = true;
        void (async () => {
          try {
            if (elevationActiveRef.current && portalCount > 0) {
              // Already elevated with content in portal — keep shown.
              await showOverlayWindow();
              return;
            }
            const ok = await activateElevation();
            if (disposed || !ok) {
              // Fail closed: clear portal so APP-029 hide can work.
              deactivateElevation();
              return;
            }
            // After re-portal, recount portal occupancy on next frames.
          } finally {
            inFlight = false;
          }
        })();
        return;
      }

      // No open layers — deactivate so menus never stay portaled into a hidden window.
      if (elevationActiveRef.current || useDesktopElevationStore.getState().portalContainer) {
        deactivateElevation();
      } else {
        void desktopInvoke("overlay_bridge_release", {}).catch(() => {});
      }
    };

    const recountNow = () => {
      if (disposed) return;
      const portal = useDesktopElevationStore.getState().portalContainer;
      const hostCount = countOpenLayers([document.body]);
      // Only count portal root children when published (active elevation).
      const portalCount = portal ? countOpenLayers([portal]) : 0;
      // While elevating, also count host body (transition frames during re-portal).
      applyCounts(hostCount, portalCount);
    };

    const scheduleRecount = () => {
      if (recountScheduled) return;
      recountScheduled = true;
      for (const id of rafIdsRef.current) {
        cancelAnimationFrame(id);
      }
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

    scheduleRecount();

    return () => {
      disposed = true;
      hostMo.disconnect();
      overlayMoRef.current?.disconnect();
      detachOverlayListeners();
      unsub();
      for (const id of rafIdsRef.current) cancelAnimationFrame(id);
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
      elevationActiveRef.current = false;
      setPortalContainer(null);
      void desktopInvoke("overlay_bridge_release", {}).catch(() => {});
    };
  }, [
    activateElevation,
    capability,
    deactivateElevation,
    nativePreviewPresent,
    setElevatedLayerCount,
    setPortalContainer,
    showOverlayWindow,
  ]);

  React.useEffect(() => {
    if (!capability) return;
    let unlisten: (() => void) | undefined;
    void desktopListen("desktop-overlay:destroyed", () => {
      overlayWindowRef.current = null;
      portalRootRef.current = null;
      elevationActiveRef.current = false;
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

  // Only publish portal while elevation is active (portalContainer non-null in store).
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
