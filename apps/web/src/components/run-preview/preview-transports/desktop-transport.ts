import {
  getPreviewViewportBounds,
  invokeDesktopPreviewBridge,
  listenDesktopPreviewBridge,
} from '@/lib/desktop-preview-bridge';
import type {
  PreviewBridgeController,
  PreviewBridgeEventHandlers,
  PreviewTransportViewport,
} from '../preview-bridge/types';

interface ConnectDesktopPreviewTransportOptions extends PreviewBridgeEventHandlers {
  sessionId: string;
  pageUrl: string;
  viewport: PreviewTransportViewport;
}

export async function connectDesktopPreviewTransport(
  options: ConnectDesktopPreviewTransportOptions,
): Promise<PreviewBridgeController> {
  const unlisteners = await Promise.all([
    listenDesktopPreviewBridge('desktop-preview:ready', (payload) => {
      if (payload.sessionId !== options.sessionId) return;
      options.onReady?.((payload.capabilities as never[]) ?? []);
    }),
    listenDesktopPreviewBridge('desktop-preview:selected', (payload) => {
      if (payload.sessionId !== options.sessionId || !payload.rect || !payload.elementContext) return;
      options.onSelected?.({
        pageUrl: payload.pageUrl,
        rect: payload.rect,
        elementContext: payload.elementContext as never,
        sourceLocation: (payload.sourceLocation as never) ?? null,
      });
    }),
    listenDesktopPreviewBridge('desktop-preview:cleared', (payload) => {
      if (payload.sessionId !== options.sessionId) return;
      options.onCleared?.();
    }),
    listenDesktopPreviewBridge('desktop-preview:error', (payload) => {
      if (payload.sessionId !== options.sessionId || !payload.error) return;
      options.onError?.(payload.error);
    }),
    listenDesktopPreviewBridge('desktop-preview:navigation-changed', (payload) => {
      if (payload.sessionId !== options.sessionId) return;
      options.onNavigationChanged?.(payload.pageUrl);
    }),
  ]);

  await invokeDesktopPreviewBridge('preview_bridge_open', {
    session_id: options.sessionId,
    url: options.pageUrl,
    bounds: options.viewport,
  });

  return {
    mode: 'desktop-native',
    async enterPickMode() {
      await invokeDesktopPreviewBridge('preview_bridge_enter_pick_mode', {
        session_id: options.sessionId,
      });
    },
    async clearSelection() {
      await invokeDesktopPreviewBridge('preview_bridge_clear_selection', {
        session_id: options.sessionId,
      });
    },
    async updateViewport(viewport) {
      await invokeDesktopPreviewBridge('preview_bridge_update_bounds', {
        bounds: viewport,
      });
    },
    async navigate(url) {
      await invokeDesktopPreviewBridge('preview_bridge_navigate', {
        session_id: options.sessionId,
        url,
      });
    },
    async destroy() {
      unlisteners.forEach((unlisten) => unlisten());
      await invokeDesktopPreviewBridge('preview_bridge_close');
    },
  };
}

export { getPreviewViewportBounds };
