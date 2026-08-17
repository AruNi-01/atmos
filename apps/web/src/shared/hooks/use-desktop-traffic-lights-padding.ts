"use client";

import { useEffect, useState } from "react";

import { isTauriShell } from "@/shared/lib/desktop-bridge";
import { isDesktopRuntime } from "@/shared/lib/desktop-runtime";
import { subscribeDesktopFullscreen } from "@/shared/lib/desktop-fullscreen-bus";

/**
 * True when the window shows macOS traffic lights that need content inset
 * (not fullscreen). Used by LeftSidebar (h-12 top spacer), Header
 * (pl-[92px] only when the sidebar is collapsed), agent-chat, canvas, etc.
 *
 * Fullscreen: lights hide → padding off. Exit fullscreen → padding back.
 *
 * Electron path shares one IPC listener via desktop-fullscreen-bus (avoids
 * MaxListenersExceededWarning when many components mount this hook).
 */
export function useDesktopTrafficLightsPadding(): boolean {
  const [needsPadding, setNeedsPadding] = useState(false);

  useEffect(() => {
    const isMac =
      typeof navigator !== "undefined" &&
      /Macintosh|Mac OS X/i.test(navigator.userAgent);

    if (!isMac || !isDesktopRuntime()) {
      setNeedsPadding(false);
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;

    const apply = (fullscreen: boolean) => {
      if (!disposed) setNeedsPadding(!fullscreen);
    };

    if (isTauriShell()) {
      void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
        const currentWindow = getCurrentWindow();
        try {
          apply(await currentWindow.isFullscreen());
        } catch {
          apply(!!document.fullscreenElement);
        }
        const off = await currentWindow.onResized(async () => {
          try {
            apply(await currentWindow.isFullscreen());
          } catch {
            apply(!!document.fullscreenElement);
          }
        });
        if (disposed) {
          off();
          return;
        }
        unlisten = off;
      });
    } else {
      unlisten = subscribeDesktopFullscreen(apply);
    }

    const onDocFs = () => {
      if (isDesktopRuntime() && !isTauriShell()) {
        apply(!!document.fullscreenElement);
      }
    };
    document.addEventListener("fullscreenchange", onDocFs);

    return () => {
      disposed = true;
      unlisten?.();
      document.removeEventListener("fullscreenchange", onDocFs);
    };
  }, []);

  return needsPadding;
}
