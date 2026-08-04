import { installPreviewHelper } from '../browser-helper/bootstrap';
import type { BrowserBridgeController, BrowserBridgeEventHandlers } from '../browser-bridge/types';

export function connectSameOriginPreviewTransport(
  win: Window,
  sessionId: string,
  handlers: BrowserBridgeEventHandlers,
): BrowserBridgeController {
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
