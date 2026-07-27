import {
  getPreviewViewportBounds,
  invokeDesktopPreviewBridge,
  listenDesktopPreviewBridge,
} from '@/shared/lib/desktop-preview-bridge';
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
      options.onReady?.((payload.capabilities as never[]) ?? [], undefined, payload.pageTitle, payload.faviconUrl, payload.pageUrl);
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
    listenDesktopPreviewBridge('desktop-preview:toolbar-action', (payload) => {
      if (
        payload.sessionId !== options.sessionId ||
        (
          payload.action !== 'copy' &&
          payload.action !== 'add' &&
          payload.action !== 'update' &&
          payload.action !== 'delete'
        )
      ) return;
      const selectionSnapshot =
        payload.rect && payload.elementContext
          ? {
              pageUrl: payload.pageUrl,
              rect: payload.rect,
              elementContext: payload.elementContext as never,
              sourceLocation: (payload.sourceLocation as never) ?? null,
            }
          : undefined;
      options.onToolbarAction?.(
        payload.action,
        payload.note,
        payload.annotationId,
        selectionSnapshot,
      );
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
      options.onNavigationChanged?.(payload.pageUrl, payload.pageTitle, payload.faviconUrl);
    }),
    listenDesktopPreviewBridge('desktop-preview:title-changed', (payload) => {
      if (payload.sessionId !== options.sessionId) return;
      // Accept title and/or favicon. Some shells emit favicon-only native events.
      const hasTitle = typeof payload.pageTitle === 'string';
      const hasFavicon = typeof payload.faviconUrl === 'string' && payload.faviconUrl.length > 0;
      if (!hasTitle && !hasFavicon) return;
      options.onTitleChanged?.(
        hasTitle ? payload.pageTitle! : '',
        hasFavicon ? payload.faviconUrl : undefined,
        payload.pageUrl,
      );
    }),
    listenDesktopPreviewBridge('desktop-preview:open-tab', (payload) => {
      if (payload.sessionId !== options.sessionId || typeof payload.targetUrl !== 'string') return;
      options.onOpenTab?.(payload.targetUrl, payload.pageUrl);
    }),
    listenDesktopPreviewBridge('desktop-preview:cursor-changed', (payload) => {
      if (payload.sessionId !== options.sessionId) return;
      options.onCursorChange?.((payload as { cursor?: string }).cursor || 'default');
    }),
  ]);

  let destroyed = false;

  try {
    await invokeDesktopPreviewBridge('preview_bridge_open', {
      sessionId: options.sessionId,
      url: options.pageUrl,
      bounds: options.viewport,
    });
  } catch (error) {
    unlisteners.forEach((unlisten) => unlisten());
    throw error;
  }

  return {
    mode: 'desktop-native',
    async enterPickMode() {
      if (destroyed) return;
      await invokeDesktopPreviewBridge('preview_bridge_enter_pick_mode', {
        sessionId: options.sessionId,
      });
    },
    async exitPickMode() {
      if (destroyed) return;
      await invokeDesktopPreviewBridge('preview_bridge_clear_selection', {
        sessionId: options.sessionId,
      });
    },
    async clearSelection() {
      if (destroyed) return;
      await invokeDesktopPreviewBridge('preview_bridge_clear_selection', {
        sessionId: options.sessionId,
      });
    },
    async clearAnnotations() {
      if (destroyed) return;
      await invokeDesktopPreviewBridge('preview_bridge_clear_annotations', {
        sessionId: options.sessionId,
      });
    },
    async updateViewport(viewport) {
      if (destroyed) return;
      await invokeDesktopPreviewBridge('preview_bridge_update_bounds', {
        sessionId: options.sessionId,
        bounds: viewport,
      });
    },
    async navigate(url) {
      if (destroyed) return;
      await invokeDesktopPreviewBridge('preview_bridge_navigate', {
        sessionId: options.sessionId,
        url,
      });
    },
    async openDevTools() {
      if (destroyed) return;
      await invokeDesktopPreviewBridge('preview_bridge_open_devtools', {
        sessionId: options.sessionId,
      });
    },
    async show() {
      if (destroyed) return;
      await invokeDesktopPreviewBridge('preview_bridge_show', {
        sessionId: options.sessionId,
      });
    },
    async hide() {
      if (destroyed) return;
      await invokeDesktopPreviewBridge('preview_bridge_hide', {
        sessionId: options.sessionId,
      });
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      unlisteners.forEach((unlisten) => unlisten());
      await invokeDesktopPreviewBridge('preview_bridge_close', {
        sessionId: options.sessionId,
      });
    },
  };
}

export { getPreviewViewportBounds };
