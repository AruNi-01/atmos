import { useCallback, useEffect, useRef, useState } from "react";

import { isTauriRuntime } from "@/lib/desktop-runtime";

export function useHeaderFullscreen() {
  const [isDesktopFullscreen, setIsDesktopFullscreen] = useState(false);
  const [isDesktopFullscreenExiting, setIsDesktopFullscreenExiting] = useState(false);
  const desktopFullscreenRef = useRef<boolean | null>(null);
  const desktopFullscreenExitRafRef = useRef<number | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unlistenResize: (() => void) | undefined;

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

      if (previous === true && !fullscreen) {
        setIsDesktopFullscreenExiting(true);
        desktopFullscreenExitRafRef.current = window.requestAnimationFrame(() => {
          if (!disposed) {
            setIsDesktopFullscreenExiting(false);
          }
        });
        return;
      }

      setIsDesktopFullscreenExiting(false);
    };

    const syncFullscreen = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const fullscreen = await getCurrentWindow().isFullscreen();
      if (!disposed) {
        applyFullscreenState(fullscreen);
      }
    };

    void syncFullscreen();

    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const currentWindow = getCurrentWindow();
      const unlisten = await currentWindow.onResized(() => {
        void syncFullscreen();
      });
      if (disposed) {
        unlisten();
        return;
      }
      unlistenResize = unlisten;
    });

    return () => {
      disposed = true;
      clearDesktopFullscreenExitRaf();
      unlistenResize?.();
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
    if (isTauriRuntime()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const currentWindow = getCurrentWindow();
      await currentWindow.setFullscreen(!isDesktopFullscreen);
      return;
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
    isFullScreenActive: isTauriRuntime() ? isDesktopFullscreen : isFullScreen,
    toggleFullScreen,
  };
}
