"use client";

import { useEffect, useState } from "react";

import {
  desktopInvoke,
  desktopListen,
  isTauriShell,
} from "@/shared/lib/desktop-bridge";
import { isDesktopRuntime } from "@/shared/lib/desktop-runtime";

/**
 * True when the window shows macOS traffic lights that need content inset
 * (not fullscreen). Used by main Header (pl-[92px]), agent-chat, canvas, etc.
 *
 * Fullscreen: lights hide → padding off. Exit fullscreen → padding back.
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

    const sync = async () => {
      try {
        if (isTauriShell()) {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const fullscreen = await getCurrentWindow().isFullscreen();
          apply(fullscreen);
          return;
        }
        // Electron
        const fullscreen = await desktopInvoke<boolean>("window_is_fullscreen");
        apply(Boolean(fullscreen));
      } catch {
        // Desktop shell but query failed — still reserve lights when not browser-FS.
        apply(!!document.fullscreenElement);
      }
    };

    void sync();

    if (isTauriShell()) {
      void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
        const currentWindow = getCurrentWindow();
        const off = await currentWindow.onResized(() => {
          void sync();
        });
        if (disposed) {
          off();
          return;
        }
        unlisten = off;
      });
    } else {
      void desktopListen(
        "window-fullscreen-changed",
        (payload: unknown) => {
          const fs = Boolean(
            payload &&
              typeof payload === "object" &&
              "fullscreen" in payload &&
              (payload as { fullscreen?: unknown }).fullscreen,
          );
          apply(fs);
        },
      ).then((off) => {
        if (disposed) {
          off();
          return;
        }
        unlisten = off;
      });
    }

    // Browser Fullscreen API (web / electron document FS fallback)
    const onDocFs = () => {
      if (isDesktopRuntime() && !isTauriShell()) {
        void sync();
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
