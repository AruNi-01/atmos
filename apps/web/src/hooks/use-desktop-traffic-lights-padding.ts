"use client";

import { useEffect, useState } from "react";
import { isTauriRuntime } from "@/lib/desktop-runtime";

/**
 * Detects whether the app is running in macOS desktop mode without fullscreen.
 * In this state, the traffic lights (window controls) overlap with content,
 * so additional top padding is needed.
 */
export function useDesktopTrafficLightsPadding(): boolean {
  const [needsPadding, setNeedsPadding] = useState(false);

  useEffect(() => {
    // Only check in Tauri runtime
    if (!isTauriRuntime()) {
      setNeedsPadding(false);
      return;
    }

    // Check if macOS using userAgent
    const isMac = typeof navigator !== "undefined" && /Macintosh|Mac OS X/i.test(navigator.userAgent);
    if (!isMac) {
      setNeedsPadding(false);
      return;
    }

    // Check fullscreen state
    const checkPaddingNeeded = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const currentWindow = getCurrentWindow();
        const isFullscreen = await currentWindow.isFullscreen();
        setNeedsPadding(!isFullscreen);
      } catch {
        // If any error occurs, default to false
        setNeedsPadding(false);
      }
    };

    checkPaddingNeeded();

    // Listen for window resize events to update fullscreen state
    let unlisten: (() => void) | null = null;
    import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const currentWindow = getCurrentWindow();
      unlisten = await currentWindow.onResized(() => {
        void checkPaddingNeeded();
      });
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  return needsPadding;
}
