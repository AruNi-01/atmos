"use client";

/**
 * In-DOM Electron `<webview>` host for transport mode `desktop` (APP-053).
 * Only renders in Electron; never emitted on pure web SSR paths.
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
  loadURL?: (url: string) => void;
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
          allowpopups?: string;
          webpreferences?: string;
        },
        HTMLElement
      >;
    }
  }
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
  const ref = useRef<ElectronWebviewElement | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const boundIdRef = useRef<number | null>(null);
  const lastSrcRef = useRef<string>("");

  useEffect(() => {
    if (!isElectron) return;
    const el = ref.current;
    if (!el || layoutHidden) {
      setLayoutReady(false);
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width >= 2 && rect.height >= 2) {
        setLayoutReady(true);
      }
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    if (rect.width >= 2 && rect.height >= 2) setLayoutReady(true);
    return () => ro.disconnect();
  }, [isElectron, layoutHidden]);

  useEffect(() => {
    if (!isElectron) return;
    const el = ref.current;
    if (!el || !attach || !layoutReady || layoutHidden) return;

    if (!el.getAttribute("partition")) {
      el.setAttribute("partition", attach.partition);
    }
    if (!el.getAttribute("preload") && attach.preloadUrl) {
      el.setAttribute("preload", attach.preloadUrl);
    }

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

    el.addEventListener("dom-ready", onReady as EventListener);

    if (src && lastSrcRef.current !== src) {
      lastSrcRef.current = src;
      try {
        if (typeof el.loadURL === "function") {
          el.loadURL(src);
        } else {
          el.setAttribute("src", src);
        }
      } catch {
        el.setAttribute("src", src);
      }
    }

    return () => {
      el.removeEventListener("dom-ready", onReady as EventListener);
    };
  }, [isElectron, attach, layoutReady, layoutHidden, src, onBindGuest, onDomReady]);

  useEffect(() => {
    if (!isElectron || !layoutHidden) return;
    const el = ref.current;
    try {
      el?.blur?.();
    } catch {
      /* ignore */
    }
  }, [isElectron, layoutHidden]);

  if (!isElectron) {
    return null;
  }

  if (!attach) {
    return (
      <div
        className={cn(
          "absolute inset-0",
          layoutHidden && "hidden",
          className,
        )}
      />
    );
  }

  return (
    <webview
      ref={ref as never}
      className={cn(
        "absolute inset-0 h-full w-full border-0",
        pointerEventsNone && "pointer-events-none",
        layoutHidden && "hidden",
        className,
      )}
      style={{ zIndex: BROWSER_Z.webview }}
      partition={attach.partition}
      preload={attach.preloadUrl}
      webpreferences="contextIsolation=yes, nodeIntegration=no, sandbox=yes"
    />
  );
}
