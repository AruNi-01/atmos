import { installPreviewHelper } from '../preview-helper/bootstrap';
import type { PreviewBridgeController, PreviewBridgeEventHandlers } from '../preview-bridge/types';

export function connectSameOriginPreviewTransport(
  win: Window,
  sessionId: string,
  handlers: PreviewBridgeEventHandlers,
): PreviewBridgeController {
  const helper = installPreviewHelper(win, {
    sessionId,
    onReady: handlers.onReady,
    onSelected: handlers.onSelected,
    onCleared: handlers.onCleared,
    onError: handlers.onError,
  });

  return {
    mode: 'same-origin',
    enterPickMode() {
      // Same-origin mode is active as soon as the helper is installed.
    },
    clearSelection(notifyHost = false) {
      helper.clearSelection(notifyHost);
    },
    destroy() {
      helper.destroy();
    },
  };
}

