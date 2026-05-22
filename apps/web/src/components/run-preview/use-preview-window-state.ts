import { useEffect, useMemo, useState } from 'react';

import { isTauriRuntime } from '@/lib/desktop-runtime';

export function usePreviewWindowState() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDesktopWindowFullscreen, setIsDesktopWindowFullscreen] = useState(false);
  const isMacDesktop = useMemo(
    () => isTauriRuntime() && typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent),
    [],
  );

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unlistenResize: (() => void) | undefined;

    const syncFullscreen = async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const fullscreen = await getCurrentWindow().isFullscreen();
      if (!disposed) {
        setIsDesktopWindowFullscreen(fullscreen);
      }
    };

    void syncFullscreen();

    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
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
      unlistenResize?.();
    };
  }, []);

  const needsDesktopPreviewSafeInset =
    isMaximized && isMacDesktop && !isDesktopWindowFullscreen;

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMaximized) {
        setIsMaximized(false);
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isMaximized]);

  return {
    isMaximized,
    needsDesktopPreviewSafeInset,
    setIsMaximized,
  };
}
