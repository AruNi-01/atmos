"use client";

/**
 * APP-052: On Electron desktop with overlay capability + native preview present,
 * ensure a shared overlay surface and provide its document root as the portal
 * container so floating UI paints above WebContentsView previews.
 *
 * Pure web: capability stays false → PortalContainerProvider gets null → body.
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

function syncThemeToOverlayDocument(doc: Document) {
  try {
    const src = document.documentElement;
    const dst = doc.documentElement;
    dst.className = src.className;
    dst.style.colorScheme = src.style.colorScheme || "";
    const theme = src.getAttribute("data-theme");
    if (theme) dst.setAttribute("data-theme", theme);
    else dst.removeAttribute("data-theme");
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
  const ensurePromiseRef = React.useRef<Promise<boolean> | null>(null);
  const overlayMoRef = React.useRef<MutationObserver | null>(null);
  const rafIdsRef = React.useRef<number[]>([]);

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
        let root = doc.getElementById(OVERLAY_ROOT_ID);
        if (!root) {
          root = doc.createElement("div");
          root.id = OVERLAY_ROOT_ID;
          Object.assign(root.style, {
            position: "fixed",
            inset: "0",
            pointerEvents: "auto",
          } as CSSStyleDeclaration);
          doc.body.style.margin = "0";
          doc.body.style.background = "transparent";
          doc.body.appendChild(root);
        }
        if (!doc.head.querySelector("[data-atmos-overlay-pointer-style]")) {
          const style = doc.createElement("style");
          style.setAttribute("data-atmos-overlay-pointer-style", "1");
          style.textContent = `html,body{background:transparent!important}#${OVERLAY_ROOT_ID}{pointer-events:auto}`;
          doc.head.appendChild(style);
        }
        return root;
      } catch {
        return null;
      }
    },
    [],
  );

  /**
   * Prepare portalable overlay window + main registration.
   * Does NOT show/capture — only note_activity shows the surface (B5).
   */
  const ensureOverlay = React.useCallback(async (): Promise<boolean> => {
    if (!capability || !nativePreviewPresent) return false;
    if (ensurePromiseRef.current) return ensurePromiseRef.current;

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
          return false;
        }

        const result = (await desktopInvoke("overlay_bridge_ensure", {})) as {
          ok?: boolean;
          ready?: boolean;
        };
        if (!result?.ok) {
          setEnsureFailed(true);
          setSurfaceReady(false);
          return false;
        }

        setPortalContainer(root);
        setSurfaceReady(true);
        setEnsureFailed(false);
        // Prepare only — do not release/show here (B6). Caller decides
        // note_activity vs release based on portal layer count.
        return true;
      } catch {
        setEnsureFailed(true);
        setSurfaceReady(false);
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

  const showOverlayWithLayers = React.useCallback(async () => {
    useDesktopElevationStore.getState().setPointerMode("capture");
    await desktopInvoke("overlay_bridge_set_pointer_mode", {
      mode: "capture",
    }).catch(() => {});
    await desktopInvoke("overlay_bridge_note_activity", {}).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!nativePreviewPresent) {
      resetElevationRuntime();
      void desktopInvoke("overlay_bridge_release", {}).catch(() => {});
    }
  }, [nativePreviewPresent, resetElevationRuntime]);

  // Recount layers on host + overlay roots; drive ensure/show/release.
  React.useEffect(() => {
    if (!capability || !nativePreviewPresent || typeof document === "undefined") {
      return;
    }

    let disposed = false;

    const applyCounts = (hostCount: number, portalCount: number) => {
      // elevationCovers uses portal-only count.
      setElevatedLayerCount(portalCount);

      if (portalCount > 0) {
        void (async () => {
          const st = useDesktopElevationStore.getState();
          const win = overlayWindowRef.current;
          const alreadyReady =
            st.surfaceReady &&
            st.portalContainer != null &&
            win != null &&
            !win.closed;
          if (!alreadyReady) {
            const ok = await ensureOverlay();
            if (disposed || !ok) return;
          }
          // Show only — never release on this path (B6).
          await showOverlayWithLayers();
          const p = useDesktopElevationStore.getState().portalContainer;
          setElevatedLayerCount(countOpenLayers([p ?? null]));
        })();
        return;
      }

      if (hostCount > 0) {
        // Warm portal root for re-portal; keep surface hidden until portalCount > 0.
        void (async () => {
          const st = useDesktopElevationStore.getState();
          if (!st.surfaceReady || !st.portalContainer) {
            const ok = await ensureOverlay();
            if (disposed || !ok) return;
          }
          const p = useDesktopElevationStore.getState().portalContainer;
          const nextPortal = countOpenLayers([p ?? null]);
          setElevatedLayerCount(nextPortal);
          if (nextPortal > 0) {
            await showOverlayWithLayers();
          } else {
            void desktopInvoke("overlay_bridge_release", {}).catch(() => {});
          }
        })();
        return;
      }

      void desktopInvoke("overlay_bridge_release", {}).catch(() => {});
    };

    const recountNow = () => {
      if (disposed) return;
      const portal = useDesktopElevationStore.getState().portalContainer;
      // Host document only (not portal's ownerDocument which may be same origin
      // but separate) for hostCount; portal root for portalCount.
      const hostCount = countOpenLayers([document.body]);
      const portalCount = countOpenLayers([portal ?? null]);
      applyCounts(hostCount, portalCount);
    };

    /** Mutation + rAF follow-up so fade-in frames still re-evaluate (B5). */
    const scheduleRecount = () => {
      recountNow();
      for (const id of rafIdsRef.current) {
        cancelAnimationFrame(id);
      }
      rafIdsRef.current = [];
      const id1 = requestAnimationFrame(() => {
        recountNow();
        const id2 = requestAnimationFrame(() => {
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

    const attachOverlayMo = (portal: HTMLElement | null) => {
      overlayMoRef.current?.disconnect();
      overlayMoRef.current = null;
      if (!portal?.ownerDocument?.body) return;
      const doc = portal.ownerDocument;
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
      void desktopInvoke("overlay_bridge_release", {}).catch(() => {});
    };
  }, [
    capability,
    ensureOverlay,
    nativePreviewPresent,
    setElevatedLayerCount,
    showOverlayWithLayers,
  ]);

  React.useEffect(() => {
    if (!capability) return;
    let unlisten: (() => void) | undefined;
    void desktopListen("desktop-overlay:destroyed", () => {
      overlayWindowRef.current = null;
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
    const sync = () => syncThemeToOverlayDocument(doc);
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
