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
   * Opacity only — never `display:none`, which tears down the Electron guest.
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

function applyWebviewColorScheme(
  el: ElectronWebviewElement,
  sessionId: string,
  scheme: "light" | "dark",
): void {
  try {
    void el.insertCSS?.(
      `:root, html { color-scheme: ${scheme} !important; }`,
    );
    void el.executeJavaScript?.(
      `(() => {
        try {
          document.documentElement.style.colorScheme = ${JSON.stringify(scheme)};
          document.documentElement.setAttribute('data-atmos-color-scheme', ${JSON.stringify(scheme)});
        } catch (_) {}
      })();`,
      false,
    );
  } catch {
    /* guest mid-navigation */
  }
  void invokeDesktopBrowserBridge("browser_bridge_set_color_scheme", {
    sessionId,
    scheme,
  }).catch(() => undefined);
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
  const onBindGuestRef = useRef(onBindGuest);
  const onDomReadyRef = useRef(onDomReady);
  const onLoadingChangeRef = useRef(onLoadingChange);
  const guestColorSchemeRef = useRef(guestColorScheme);
  onBindGuestRef.current = onBindGuest;
  onDomReadyRef.current = onDomReady;
  onLoadingChangeRef.current = onLoadingChange;
  guestColorSchemeRef.current = guestColorScheme;
  const attachSessionId = attach?.sessionId ?? null;

  // Measure host until it has size. Do NOT reset layoutReady when layoutHidden —
  // inactive tabs stay opacity-hidden so the guest keeps its layout box.
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

  // Subscribe once per mounted guest. Electron <webview> maps each addEventListener
  // onto the guest WebContents; parent re-renders (workspace hop) must not re-bind.
  useEffect(() => {
    if (!shouldMountGuest || !attachSessionId) return;
    const el = webviewRef.current;
    if (!el) return;

    const onReady = () => {
      try {
        const id = el.getWebContentsId?.();
        if (typeof id === "number" && id > 0 && boundIdRef.current !== id) {
          boundIdRef.current = id;
          onBindGuestRef.current?.(id);
        }
      } catch {
        /* guest not ready */
      }
      onLoadingChangeRef.current?.(false);
      onDomReadyRef.current?.();
    };

    const onStartLoading = () => {
      onLoadingChangeRef.current?.(true);
    };

    const onStopLoading = () => {
      onLoadingChangeRef.current?.(false);
    };

    const onFail = (event: Event) => {
      const detail = event as Event & {
        errorCode?: number;
        errorDescription?: string;
        validatedURL?: string;
        isMainFrame?: boolean;
      };
      // -3 = aborted (navigation superseded); ignore.
      if (detail.errorCode === -3) return;
      console.error(
        "[browser] webview did-fail-load",
        {
          errorCode: detail.errorCode,
          errorDescription: detail.errorDescription,
          validatedURL: detail.validatedURL,
          isMainFrame: detail.isMainFrame,
          sessionId: attachSessionId,
        },
      );
      onLoadingChangeRef.current?.(false);
    };

    el.addEventListener("dom-ready", onReady as EventListener);
    el.addEventListener("did-start-loading", onStartLoading as EventListener);
    el.addEventListener("did-stop-loading", onStopLoading as EventListener);
    el.addEventListener("did-fail-load", onFail as EventListener);

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
  }, [shouldMountGuest, attachSessionId]);

  // Navigate in place. Do not remount the <webview> or re-subscribe loading events.
  useEffect(() => {
    if (!shouldMountGuest || !attachSessionId) return;
    const el = webviewRef.current;
    if (!el) return;

    const sessionChanged = mountedSessionRef.current !== attachSessionId;
    if (sessionChanged) {
      mountedSessionRef.current = attachSessionId;
      lastSrcRef.current = navUrl;
      // Initial src is on the attribute; mark loading until stop-loading/dom-ready.
      if (navUrl && navUrl !== "about:blank") {
        onLoadingChangeRef.current?.(true);
      }
      return;
    }
    if (navUrl && lastSrcRef.current !== navUrl) {
      lastSrcRef.current = navUrl;
      onLoadingChangeRef.current?.(true);
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
  }, [shouldMountGuest, attachSessionId, navUrl]);

  useEffect(() => {
    if (!isElectron || !layoutHidden) return;
    try {
      webviewRef.current?.blur?.();
    } catch {
      /* ignore */
    }
  }, [isElectron, layoutHidden]);

  // Sync Atmos theme → guest color-scheme so scrollbars match system Chrome dark UI.
  // Subscribe once per guest; scheme changes apply without re-binding paint listeners.
  useEffect(() => {
    if (!shouldMountGuest || !attachSessionId) return;
    const el = webviewRef.current;
    if (!el) return;

    const onPaintReady = () => {
      applyWebviewColorScheme(el, attachSessionId, guestColorSchemeRef.current);
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
  }, [shouldMountGuest, attachSessionId]);

  useEffect(() => {
    if (!shouldMountGuest || !attachSessionId) return;
    const el = webviewRef.current;
    if (!el) return;
    applyWebviewColorScheme(el, attachSessionId, guestColorScheme);
  }, [shouldMountGuest, attachSessionId, guestColorScheme]);

  if (!isElectron) {
    return null;
  }

  return (
    <div
      ref={hostRef}
      className={cn(
        "absolute inset-0 h-full w-full",
        // Opacity hide keeps the guest composited and sized. `hidden`/`display:none`
        // destroys the Electron guest and reloads the page on the next show.
        layoutHidden && "pointer-events-none opacity-0",
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
            (pointerEventsNone || layoutHidden) && "pointer-events-none",
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
