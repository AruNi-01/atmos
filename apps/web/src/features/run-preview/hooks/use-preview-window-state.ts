import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { isTauriRuntime } from '@/shared/lib/desktop-runtime';

interface PreviewWindowStateOptions {
  isMaximized?: boolean;
  reserveDesktopWindowControlsInset?: boolean;
  setIsMaximized?: Dispatch<SetStateAction<boolean>>;
}

export function usePreviewWindowState(options: PreviewWindowStateOptions = {}) {
  const [uncontrolledIsMaximized, setUncontrolledIsMaximized] = useState(false);
  const [isDesktopWindowFullscreen, setIsDesktopWindowFullscreen] = useState(false);
  const isMaximized = options.isMaximized ?? uncontrolledIsMaximized;
  const setIsMaximized = options.setIsMaximized ?? setUncontrolledIsMaximized;
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
    (isMaximized || options.reserveDesktopWindowControlsInset === true) &&
    isMacDesktop &&
    !isDesktopWindowFullscreen;

  return {
    isMaximized,
    needsDesktopPreviewSafeInset,
    setIsMaximized,
  };
}
