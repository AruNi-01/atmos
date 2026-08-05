import { useCallback, useEffect, useRef, useState } from "react";

import {
  desktopInvoke,
  isDesktopRuntime,
  isTauriShell,
} from "@/shared/lib/desktop-bridge";
import { subscribeDesktopFullscreen } from "@/shared/lib/desktop-fullscreen-bus";

export function useHeaderFullscreen() {
  const [isDesktopFullscreen, setIsDesktopFullscreen] = useState(false);
  const [isDesktopFullscreenExiting, setIsDesktopFullscreenExiting] =
    useState(false);
  const desktopFullscreenRef = useRef<boolean | null>(null);
  const desktopFullscreenExitRafRef = useRef<number | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (!isDesktopRuntime()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    const clearDesktopFullscreenExitRaf = () => {
      if (desktopFullscreenExitRafRef.current !== null) {
        window.cancelAnimationFrame(desktopFullscreenExitRafRef.current);
        desktopFullscreenExitRafRef.current = null;
      }
    };

    const applyFullscreenState = (fullscreen: boolean) => {
      const previous = desktopFullscreenRef.current;
      desktopFullscreenRef.current = fullscreen;
      setIsDesktopFullscreen(fullscreen);

      clearDesktopFullscreenExitRaf();

      // Brief exit animation for traffic-light padding restore (Header opacity).
      if (previous === true && !fullscreen) {
        setIsDesktopFullscreenExiting(true);
        desktopFullscreenExitRafRef.current = window.requestAnimationFrame(
          () => {
            if (!disposed) {
              setIsDesktopFullscreenExiting(false);
            }
          },
        );
        return;
      }

      setIsDesktopFullscreenExiting(false);
    };

    const syncFullscreen = async () => {
      try {
        if (isTauriShell()) {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const fullscreen = await getCurrentWindow().isFullscreen();
          if (!disposed) applyFullscreenState(fullscreen);
          return;
        }
        const fullscreen = await desktopInvoke<boolean>("window_is_fullscreen");
        if (!disposed) applyFullscreenState(Boolean(fullscreen));
      } catch {
        if (!disposed) applyFullscreenState(!!document.fullscreenElement);
      }
    };

    void syncFullscreen();

    if (isTauriShell()) {
      void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
        const currentWindow = getCurrentWindow();
        const off = await currentWindow.onResized(() => {
          void syncFullscreen();
        });
        if (disposed) {
          off();
          return;
        }
        unlisten = off;
      });
    } else {
      // Shared bus — one IPC listener for all fullscreen consumers.
      unlisten = subscribeDesktopFullscreen((fs) => {
        if (!disposed) applyFullscreenState(fs);
      });
    }

    return () => {
      disposed = true;
      clearDesktopFullscreenExitRaf();
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullScreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
    };
  }, []);

  const toggleFullScreen = useCallback(async () => {
    if (isTauriShell()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const currentWindow = getCurrentWindow();
      await currentWindow.setFullscreen(!isDesktopFullscreen);
      return;
    }

    if (isDesktopRuntime()) {
      try {
        await desktopInvoke("window_set_fullscreen", {
          fullscreen: !isDesktopFullscreen,
        });
        return;
      } catch {
        // fall through to document fullscreen
      }
    }

    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return;
    }

    if (document.exitFullscreen) {
      await document.exitFullscreen();
    }
  }, [isDesktopFullscreen]);

  return {
    isDesktopFullscreen,
    isDesktopFullscreenExiting,
    // Desktop shells (Tauri + Electron) use native window fullscreen for
    // traffic-light hide/show; plain web uses document fullscreen.
    isFullScreenActive: isDesktopRuntime()
      ? isDesktopFullscreen || isFullScreen
      : isFullScreen,
    toggleFullScreen,
  };
}
