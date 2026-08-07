import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import {
  acquireBrowserMacChrome,
  releaseBrowserMacChrome,
} from '@/features/browser/lib/browser-mac-chrome';
import { useDesktopTrafficLightsPadding } from '@/shared/hooks/use-desktop-traffic-lights-padding';

interface PreviewWindowStateOptions {
  isMaximized?: boolean;
  reserveDesktopWindowControlsInset?: boolean;
  setIsMaximized?: Dispatch<SetStateAction<boolean>>;
}

export function useBrowserWindowState(options: PreviewWindowStateOptions = {}) {
  const [uncontrolledIsMaximized, setUncontrolledIsMaximized] = useState(false);
  const isMaximized = options.isMaximized ?? uncontrolledIsMaximized;
  const setIsMaximized = options.setIsMaximized ?? setUncontrolledIsMaximized;
  // Shared with main Header / ACP Chat: true when macOS traffic lights are visible
  // (desktop shell + not native fullscreen). Works for Tauri and Electron, including
  // standalone browser windows.
  const needsTrafficLightsPadding = useDesktopTrafficLightsPadding();

  const usesDenseBrowserChrome =
    isMaximized || options.reserveDesktopWindowControlsInset === true;

  const needsDesktopPreviewSafeInset =
    usesDenseBrowserChrome && needsTrafficLightsPadding;

  // Main-window maximize only: raise traffic lights to the dense tab rail.
  // Standalone browser windows are created with `browser` chrome already and
  // must not be reset to `primary` on React unmount/remount.
  useEffect(() => {
    if (options.reserveDesktopWindowControlsInset) return;
    if (!isMaximized) return;
    acquireBrowserMacChrome();
    return () => {
      releaseBrowserMacChrome();
    };
  }, [isMaximized, options.reserveDesktopWindowControlsInset]);

  return {
    isMaximized,
    needsDesktopPreviewSafeInset,
    setIsMaximized,
  };
}
