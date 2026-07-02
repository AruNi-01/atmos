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
    onHover: handlers.onHover,
    onCleared: handlers.onCleared,
    onError: handlers.onError,
    onNavigationChanged: handlers.onNavigationChanged,
    onTitleChanged: handlers.onTitleChanged,
    onOpenTab: handlers.onOpenTab,
  });

  return {
    mode: 'same-origin',
    enterPickMode() {
      helper.enterPickMode();
    },
    exitPickMode() {
      helper.exitPickMode();
    },
    clearSelection(notifyHost = false) {
      helper.clearSelection(notifyHost);
    },
    destroy() {
      helper.destroy();
    },
  };
}
