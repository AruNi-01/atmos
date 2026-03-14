"use client";

import { useEffect } from "react";

import {
  isSupportedExternalProtocol,
  openDesktopExternalUrl,
  resolveExternalUrl,
} from "@/lib/desktop-external-url";
import { isTauriRuntime } from "@/lib/desktop-runtime";

function shouldOpenExternally(url: URL) {
  if (!isSupportedExternalProtocol(url.protocol)) return false;
  return url.origin !== window.location.origin || url.protocol === "mailto:" || url.protocol === "tel:";
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
        const resolved = resolveExternalUrl(nextUrl);
        if (resolved && shouldOpenExternally(resolved)) {
          void openDesktopExternalUrl(resolved.toString());
          return null;
        }
      }

      return originalWindowOpen(nextUrl, target, features);
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;

      const anchor = findAnchorFromEventTarget(event);
      if (!anchor || !anchor.href || anchor.hasAttribute("download")) return;

      const resolved = resolveExternalUrl(anchor.href);
      if (!resolved || !shouldOpenExternally(resolved)) return;

      event.preventDefault();
      void openDesktopExternalUrl(resolved.toString());
    };

    window.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.open = originalWindowOpen;
      window.removeEventListener("click", handleDocumentClick, true);
    };
  }, []);

  return null;
}
