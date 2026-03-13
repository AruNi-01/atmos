"use client";

import { useEffect } from "react";

import { debugLog } from "@/lib/desktop-logger";
import { isTauriRuntime } from "@/lib/desktop-runtime";

type TauriInternals = {
  invoke?: (cmd: string, payload?: unknown) => Promise<unknown>;
};

function getTauriInvoke() {
  if (typeof window === "undefined") return null;
  const internals = (window as { __TAURI_INTERNALS__?: TauriInternals })
    .__TAURI_INTERNALS__;
  return internals?.invoke ?? null;
}

function isSupportedExternalProtocol(protocol: string) {
  return (
    protocol === "http:" ||
    protocol === "https:" ||
    protocol === "mailto:" ||
    protocol === "tel:"
  );
}

function resolveUrl(url: string) {
  try {
    return new URL(url, window.location.href);
  } catch {
    return null;
  }
}

function shouldOpenExternally(url: URL) {
  if (!isSupportedExternalProtocol(url.protocol)) return false;
  return url.origin !== window.location.origin || url.protocol === "mailto:" || url.protocol === "tel:";
}

async function openExternalUrl(url: string) {
  const invoke = getTauriInvoke();
  const resolved = resolveUrl(url);

  if (!invoke || !resolved || !shouldOpenExternally(resolved)) {
    return false;
  }

  try {
    await invoke("plugin:opener|open_url", { url: resolved.toString() });
    debugLog(`openExternalUrl: opened ${resolved.toString()}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debugLog(`openExternalUrl: failed ${resolved.toString()} err=${message}`);
    return false;
  }
}

function findAnchorFromEventTarget(event: MouseEvent) {
  const path = event.composedPath();
  for (const item of path) {
    if (item instanceof HTMLAnchorElement) {
      return item;
    }
  }
  return null;
}

export function DesktopExternalUrlBridge() {
  useEffect(() => {
    if (!isTauriRuntime()) return;

    const originalWindowOpen = window.open.bind(window);

    window.open = function patchedWindowOpen(
      url?: string | URL,
      target?: string,
      features?: string,
    ) {
      const nextUrl = typeof url === "string" ? url : url?.toString();
      if (nextUrl) {
        void openExternalUrl(nextUrl);
      }

      const resolved = nextUrl ? resolveUrl(nextUrl) : null;
      if (resolved && shouldOpenExternally(resolved)) {
        return null;
      }

      return originalWindowOpen(nextUrl, target, features);
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;

      const anchor = findAnchorFromEventTarget(event);
      if (!anchor || !anchor.href || anchor.hasAttribute("download")) return;

      const resolved = resolveUrl(anchor.href);
      if (!resolved || !shouldOpenExternally(resolved)) return;

      event.preventDefault();
      void openExternalUrl(resolved.toString());
    };

    window.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.open = originalWindowOpen;
      window.removeEventListener("click", handleDocumentClick, true);
    };
  }, []);

  return null;
}
