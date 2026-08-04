"use client";

/**
 * In-DOM Electron `<webview>` host for transport mode `desktop` (APP-053).
 *
 * Mount order:
 * 1. Measure host shell until non-zero size (once)
 * 2. Mount <webview> with partition + preload + src (will-attach must see real src)
 * 3. Keep guest mounted across tab hide/show — CSS hide only, never remount on tab switch
 * 4. Bind guest webContentsId on dom-ready
 */

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@workspace/ui";
import { isElectronShell } from "@/shared/lib/desktop-bridge";
import { invokeDesktopBrowserBridge } from "@/shared/lib/desktop-browser-bridge";
import type { DesktopBrowserAttachConfig } from "../lib/browser-transports/desktop-transport";

/** z-index tokens within the browser viewport stacking context. */
export const BROWSER_Z = {
  webview: 0,
  insetChrome: 20,
  selection: 30,
} as const;

type DesktopBrowserWebviewProps = {
  attach: DesktopBrowserAttachConfig | null;
  src: string;
  className?: string;
  /** When true, native pointer events must not reach the guest. */
  pointerEventsNone?: boolean;
  /**
   * Hide without destroying the guest (tab switch / suspend).
   * Uses layout-removing CSS; React keeps the <webview> mounted so page state is preserved.
   */
  layoutHidden?: boolean;
  onBindGuest?: (webContentsId: number) => void;
  onDomReady?: () => void;
  /** Fired when the document finishes a navigation (for host loading chrome). */
  onLoadingChange?: (loading: boolean) => void;
};

type ElectronWebviewElement = HTMLElement & {
  src: string;
  partition: string;
  preload: string;
  getWebContentsId?: () => number;
  loadURL?: (url: string) => Promise<void> | void;
  blur?: () => void;
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>;
  insertCSS?: (css: string) => Promise<string>;
};

/** Resolve Atmos host theme → guest color-scheme (default dark matches app). */
function resolveGuestColorScheme(resolvedTheme: string | undefined): "light" | "dark" {
  return resolvedTheme === "light" ? "light" : "dark";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          partition?: string;
          preload?: string;
          allowpopups?: string | boolean;
          webpreferences?: string;
        },
        HTMLElement
      >;
    }
  }
}

function normalizeNavUrl(url: string): string {
  const t = url.trim();
  return t.length > 0 ? t : "about:blank";
}

export function DesktopBrowserWebview({
  attach,
  src,
  className,
  pointerEventsNone = false,
  layoutHidden = false,
  onBindGuest,
  onDomReady,
  onLoadingChange,
}: DesktopBrowserWebviewProps) {
  const isElectron =
    typeof window !== "undefined" ? isElectronShell() : false;
  const { resolvedTheme } = useTheme();
  const guestColorScheme = resolveGuestColorScheme(resolvedTheme);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<ElectronWebviewElement | null>(null);
  /** Once true for a session, stay true so hide/show never remounts the guest. */
  const [layoutReady, setLayoutReady] = useState(false);
  const boundIdRef = useRef<number | null>(null);
  const lastSrcRef = useRef<string>("");
  const mountedSessionRef = useRef<string | null>(null);

  // Measure host until it has size. Do NOT reset layoutReady when layoutHidden —
  // inactive tabs use display:none but must keep the guest mounted.
  useEffect(() => {
    if (!isElectron) return;
    const host = hostRef.current;
    if (!host) return;

    if (layoutReady) return;

    const markReady = (width: number, height: number) => {
      if (width >= 2 && height >= 2) setLayoutReady(true);
    };

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) markReady(rect.width, rect.height);
    });
    ro.observe(host);
    const rect = host.getBoundingClientRect();
    markReady(rect.width, rect.height);
    return () => ro.disconnect();
  }, [isElectron, layoutReady, attach?.sessionId]);

  // Reset layout readiness only when the session identity changes (new tab surface).
  useEffect(() => {
    if (!attach?.sessionId) return;
    if (mountedSessionRef.current && mountedSessionRef.current !== attach.sessionId) {
      setLayoutReady(false);
      boundIdRef.current = null;
      lastSrcRef.current = "";
    }
  }, [attach?.sessionId]);

  const navUrl = normalizeNavUrl(src);
  // Keep guest mounted across tab switches (layoutHidden). Only require layout once.
  const shouldMountGuest =
    isElectron &&
    Boolean(attach) &&
    layoutReady &&
    Boolean(attach?.partition) &&
    Boolean(attach?.preloadUrl);

  useEffect(() => {
    if (!shouldMountGuest || !attach) return;
    const el = webviewRef.current;
    if (!el) return;

    const onReady = () => {
      try {
        const id = el.getWebContentsId?.();
        if (typeof id === "number" && id > 0 && boundIdRef.current !== id) {
          boundIdRef.current = id;
          onBindGuest?.(id);
        }
      } catch {
        /* guest not ready */
      }
      onLoadingChange?.(false);
      onDomReady?.();
    };

    const onStartLoading = () => {
      onLoadingChange?.(true);
    };

    const onStopLoading = () => {
      onLoadingChange?.(false);
    };

    const onFail = (event: Event) => {
      const detail = event as Event & {
        errorCode?: number;
        errorDescription?: string;
        validatedURL?: string;
      };
      if (detail.errorCode === -3) return;
      console.error(
        "[browser] webview did-fail-load",
        detail.errorCode,
        detail.errorDescription,
        detail.validatedURL,
      );
      onLoadingChange?.(false);
    };

    el.addEventListener("dom-ready", onReady as EventListener);
    el.addEventListener("did-start-loading", onStartLoading as EventListener);
    el.addEventListener("did-stop-loading", onStopLoading as EventListener);
    el.addEventListener("did-fail-load", onFail as EventListener);

    const sessionChanged = mountedSessionRef.current !== attach.sessionId;
    if (sessionChanged) {
      mountedSessionRef.current = attach.sessionId;
      lastSrcRef.current = navUrl;
      // Initial src is on the attribute; mark loading until stop-loading/dom-ready.
      if (navUrl && navUrl !== "about:blank") {
        onLoadingChange?.(true);
      }
    } else if (navUrl && lastSrcRef.current !== navUrl) {
      lastSrcRef.current = navUrl;
      onLoadingChange?.(true);
      try {
        if (typeof el.loadURL === "function") {
          void el.loadURL(navUrl);
        } else {
          el.setAttribute("src", navUrl);
        }
      } catch (err) {
        console.error("[browser] webview loadURL failed", err);
        el.setAttribute("src", navUrl);
      }
    }

    try {
      const id = el.getWebContentsId?.();
      if (typeof id === "number" && id > 0) {
        onReady();
      }
    } catch {
      /* not ready */
    }

    return () => {
      el.removeEventListener("dom-ready", onReady as EventListener);
      el.removeEventListener("did-start-loading", onStartLoading as EventListener);
      el.removeEventListener("did-stop-loading", onStopLoading as EventListener);
      el.removeEventListener("did-fail-load", onFail as EventListener);
    };
  }, [
    shouldMountGuest,
    attach,
    navUrl,
    onBindGuest,
    onDomReady,
    onLoadingChange,
  ]);

  useEffect(() => {
    if (!isElectron || !layoutHidden) return;
    try {
      webviewRef.current?.blur?.();
    } catch {
      /* ignore */
    }
  }, [isElectron, layoutHidden]);

  // Sync Atmos theme → guest color-scheme so scrollbars match system Chrome dark UI.
  useEffect(() => {
    if (!shouldMountGuest || !attach) return;
    const el = webviewRef.current;
    if (!el) return;

    const applyLocal = () => {
      try {
        void el.insertCSS?.(
          `:root, html { color-scheme: ${guestColorScheme} !important; }`,
        );
        void el.executeJavaScript?.(
          `(() => {
            try {
              document.documentElement.style.colorScheme = ${JSON.stringify(guestColorScheme)};
              document.documentElement.setAttribute('data-atmos-color-scheme', ${JSON.stringify(guestColorScheme)});
            } catch (_) {}
          })();`,
          false,
        );
      } catch {
        /* guest mid-navigation */
      }
    };

    const pushToMain = () => {
      void invokeDesktopBrowserBridge("browser_bridge_set_color_scheme", {
        sessionId: attach.sessionId,
        scheme: guestColorScheme,
      }).catch(() => undefined);
    };

    const onPaintReady = () => {
      applyLocal();
      pushToMain();
    };

    el.addEventListener("dom-ready", onPaintReady as EventListener);
    el.addEventListener("did-finish-load", onPaintReady as EventListener);
    el.addEventListener("did-navigate-in-page", onPaintReady as EventListener);
    onPaintReady();

    return () => {
      el.removeEventListener("dom-ready", onPaintReady as EventListener);
      el.removeEventListener("did-finish-load", onPaintReady as EventListener);
      el.removeEventListener("did-navigate-in-page", onPaintReady as EventListener);
    };
  }, [shouldMountGuest, attach, guestColorScheme]);

  if (!isElectron) {
    return null;
  }

  return (
    <div
      ref={hostRef}
      className={cn(
        "absolute inset-0 h-full w-full",
        // display:none stops guest paint but keeps the node mounted (no reparent/destroy).
        layoutHidden && "hidden",
        className,
      )}
      style={{ zIndex: BROWSER_Z.webview }}
    >
      {shouldMountGuest && attach ? (
        <webview
          ref={webviewRef as never}
          key={attach.sessionId}
          className={cn(
            // Match app chrome: avoid pure white flash under loading overlay.
            "absolute inset-0 h-full w-full border-0 bg-transparent",
            pointerEventsNone && "pointer-events-none",
          )}
          // color-scheme on the frame element influences guest preferred scheme
          // (same idea as iframe colorScheme) so Chromium paints dark scrollbars.
          style={{
            colorScheme: guestColorScheme,
            backgroundColor: guestColorScheme === "dark" ? "#0a0a0a" : "#ffffff",
          }}
          // partition + preload + src + session id must be present at first attach.
          // data-atmos-session lets main will-attach bind uniquely under multi-tab races.
          {...{
            "data-atmos-session": attach.sessionId,
          }}
          partition={attach.partition}
          preload={attach.preloadUrl}
          src={navUrl}
          webpreferences="contextIsolation=yes, nodeIntegration=no, sandbox=yes"
          allowpopups={"false" as never}
        />
      ) : null}
    </div>
  );
}
