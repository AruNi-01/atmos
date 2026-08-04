"use client";

/**
 * In-DOM Electron `<webview>` host for transport mode `desktop` (APP-053).
 *
 * Mount order (critical):
 * 1. Measure a host shell until it has non-zero size
 * 2. Mount <webview> with partition + preload + src so will-attach sees a real src
 * 3. Bind guest webContentsId on dom-ready
 *
 * Never leave src empty on first attach when a URL is known — empty src used to
 * be default-denied and produced a permanent black guest.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@workspace/ui";
import { isElectronShell } from "@/shared/lib/desktop-bridge";
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
  /** Inactive tab / fully hidden: remove from layout so guest stops painting. */
  layoutHidden?: boolean;
  onBindGuest?: (webContentsId: number) => void;
  onDomReady?: () => void;
};

type ElectronWebviewElement = HTMLElement & {
  src: string;
  partition: string;
  preload: string;
  getWebContentsId?: () => number;
  loadURL?: (url: string) => Promise<void> | void;
  blur?: () => void;
};

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
}: DesktopBrowserWebviewProps) {
  const isElectron =
    typeof window !== "undefined" ? isElectronShell() : false;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<ElectronWebviewElement | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const boundIdRef = useRef<number | null>(null);
  const lastSrcRef = useRef<string>("");
  const mountedSessionRef = useRef<string | null>(null);

  // Measure host shell (not the webview) so we only mount guest with valid size.
  useEffect(() => {
    if (!isElectron) return;
    const host = hostRef.current;
    if (!host || layoutHidden) {
      setLayoutReady(false);
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width >= 2 && rect.height >= 2) {
        setLayoutReady(true);
      }
    });
    ro.observe(host);
    const rect = host.getBoundingClientRect();
    if (rect.width >= 2 && rect.height >= 2) setLayoutReady(true);
    return () => ro.disconnect();
  }, [isElectron, layoutHidden, attach?.sessionId]);

  const navUrl = normalizeNavUrl(src);
  const shouldMountGuest =
    isElectron &&
    Boolean(attach) &&
    layoutReady &&
    !layoutHidden &&
    Boolean(attach?.partition) &&
    Boolean(attach?.preloadUrl);

  // Wire events + subsequent navigations after guest is mounted.
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
      onDomReady?.();
    };

    const onFail = (event: Event) => {
      const detail = event as Event & {
        errorCode?: number;
        errorDescription?: string;
        validatedURL?: string;
      };
      // -3 = ERR_ABORTED (navigation superseded)
      if (detail.errorCode === -3) return;
      console.error(
        "[browser] webview did-fail-load",
        detail.errorCode,
        detail.errorDescription,
        detail.validatedURL,
      );
    };

    el.addEventListener("dom-ready", onReady as EventListener);
    el.addEventListener("did-fail-load", onFail as EventListener);

    // First mount: src is set via attribute so will-attach sees a real URL.
    // Later navigations: loadURL without remounting the guest.
    const sessionChanged = mountedSessionRef.current !== attach.sessionId;
    if (sessionChanged) {
      mountedSessionRef.current = attach.sessionId;
      lastSrcRef.current = navUrl;
    } else if (navUrl && lastSrcRef.current !== navUrl) {
      lastSrcRef.current = navUrl;
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

    // If already ready when listener attaches, bind immediately.
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
      el.removeEventListener("did-fail-load", onFail as EventListener);
    };
  }, [
    shouldMountGuest,
    attach,
    navUrl,
    onBindGuest,
    onDomReady,
  ]);

  useEffect(() => {
    if (!isElectron || !layoutHidden) return;
    try {
      webviewRef.current?.blur?.();
    } catch {
      /* ignore */
    }
  }, [isElectron, layoutHidden]);

  if (!isElectron) {
    return null;
  }

  return (
    <div
      ref={hostRef}
      className={cn(
        "absolute inset-0 h-full w-full",
        layoutHidden && "hidden",
        className,
      )}
      style={{ zIndex: BROWSER_Z.webview }}
    >
      {shouldMountGuest && attach ? (
        // @ts-expect-error Electron custom element
        <webview
          ref={webviewRef as never}
          key={attach.sessionId}
          className={cn(
            "absolute inset-0 h-full w-full border-0 bg-white",
            pointerEventsNone && "pointer-events-none",
          )}
          // partition + preload + src must be present at first attach.
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
