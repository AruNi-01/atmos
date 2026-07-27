import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { useDesktopTrafficLightsPadding } from '@/shared/hooks/use-desktop-traffic-lights-padding';

interface PreviewWindowStateOptions {
  isMaximized?: boolean;
  reserveDesktopWindowControlsInset?: boolean;
  setIsMaximized?: Dispatch<SetStateAction<boolean>>;
}

export function usePreviewWindowState(options: PreviewWindowStateOptions = {}) {
  const [uncontrolledIsMaximized, setUncontrolledIsMaximized] = useState(false);
  const isMaximized = options.isMaximized ?? uncontrolledIsMaximized;
  const setIsMaximized = options.setIsMaximized ?? setUncontrolledIsMaximized;
  // Shared with main Header / ACP Chat: true when macOS traffic lights are visible
  // (desktop shell + not native fullscreen). Works for Tauri and Electron, including
  // standalone preview-browser windows.
  const needsTrafficLightsPadding = useDesktopTrafficLightsPadding();

  const needsDesktopPreviewSafeInset =
    (isMaximized || options.reserveDesktopWindowControlsInset === true) &&
    needsTrafficLightsPadding;

  return {
    isMaximized,
    needsDesktopPreviewSafeInset,
    setIsMaximized,
  };
}
