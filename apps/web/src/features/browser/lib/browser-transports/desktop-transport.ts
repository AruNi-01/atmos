import {
  invokeDesktopBrowserBridge,
  listenDesktopBrowserBridge,
} from '@/shared/lib/desktop-browser-bridge';
import type {
  BrowserBridgeController,
  BrowserBridgeEventHandlers,
} from '../browser-bridge/types';

export type DesktopBrowserAttachConfig = {
  partition: string;
  preloadUrl: string;
  bridgeToken: string;
  sessionId: string;
};

interface ConnectDesktopBrowserTransportOptions extends BrowserBridgeEventHandlers {
  sessionId: string;
  pageUrl: string;
}

export type DesktopBrowserBridgeController = BrowserBridgeController & {
  attach: DesktopBrowserAttachConfig;
  bindGuest: (webContentsId: number) => Promise<void>;
};

export async function connectDesktopBrowserTransport(
  options: ConnectDesktopBrowserTransportOptions,
): Promise<DesktopBrowserBridgeController> {
  const unlisteners = await Promise.all([
    listenDesktopBrowserBridge('desktop-browser:ready', (payload) => {
      if (payload.sessionId !== options.sessionId) return;
      options.onReady?.((payload.capabilities as never[]) ?? [], undefined, payload.pageTitle, payload.faviconUrl, payload.pageUrl);
    }),
    listenDesktopBrowserBridge('desktop-browser:selected', (payload) => {
      if (payload.sessionId !== options.sessionId || !payload.rect || !payload.elementContext) return;
      options.onSelected?.({
        pageUrl: payload.pageUrl,
        rect: payload.rect,
        elementContext: payload.elementContext as never,
        sourceLocation: (payload.sourceLocation as never) ?? null,
      });
    }),
    listenDesktopBrowserBridge('desktop-browser:toolbar-action', (payload) => {
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
    listenDesktopBrowserBridge('desktop-browser:cleared', (payload) => {
      if (payload.sessionId !== options.sessionId) return;
      options.onCleared?.();
    }),
    listenDesktopBrowserBridge('desktop-browser:error', (payload) => {
      if (payload.sessionId !== options.sessionId || !payload.error) return;
      options.onError?.(payload.error);
    }),
    listenDesktopBrowserBridge('desktop-browser:navigation-changed', (payload) => {
      if (payload.sessionId !== options.sessionId) return;
      options.onNavigationChanged?.(payload.pageUrl, payload.pageTitle, payload.faviconUrl);
    }),
    listenDesktopBrowserBridge('desktop-browser:title-changed', (payload) => {
      if (payload.sessionId !== options.sessionId) return;
      const hasTitle = typeof payload.pageTitle === 'string';
      const hasFavicon = typeof payload.faviconUrl === 'string' && payload.faviconUrl.length > 0;
      if (!hasTitle && !hasFavicon) return;
      options.onTitleChanged?.(
        hasTitle ? payload.pageTitle! : '',
        hasFavicon ? payload.faviconUrl : undefined,
        payload.pageUrl,
      );
    }),
    listenDesktopBrowserBridge('desktop-browser:open-tab', (payload) => {
      if (payload.sessionId !== options.sessionId || typeof payload.targetUrl !== 'string') return;
      options.onOpenTab?.(payload.targetUrl, payload.pageUrl);
    }),
    listenDesktopBrowserBridge('desktop-browser:cursor-changed', (payload) => {
      if (payload.sessionId !== options.sessionId) return;
      options.onCursorChange?.((payload as { cursor?: string }).cursor || 'default');
    }),
  ]);

  let destroyed = false;

  let attach: DesktopBrowserAttachConfig;
  try {
    const config = await invokeDesktopBrowserBridge<DesktopBrowserAttachConfig>(
      'browser_bridge_open',
      {
        sessionId: options.sessionId,
        url: options.pageUrl,
      },
    );
    if (!config?.partition || !config?.preloadUrl) {
      throw new Error('browser_bridge_open did not return attach config');
    }
    attach = {
      partition: config.partition,
      preloadUrl: config.preloadUrl,
      bridgeToken: config.bridgeToken,
      sessionId: config.sessionId || options.sessionId,
    };
  } catch (error) {
    unlisteners.forEach((unlisten) => unlisten());
    throw error;
  }

  return {
    mode: 'desktop',
    attach,
    async bindGuest(webContentsId: number) {
      if (destroyed) return;
      await invokeDesktopBrowserBridge('browser_bridge_bind_guest', {
        sessionId: options.sessionId,
        webContentsId,
      });
    },
    async enterPickMode() {
      if (destroyed) return;
      await invokeDesktopBrowserBridge('browser_bridge_enter_pick_mode', {
        sessionId: options.sessionId,
      });
    },
    async exitPickMode() {
      if (destroyed) return;
      await invokeDesktopBrowserBridge('browser_bridge_clear_selection', {
        sessionId: options.sessionId,
      });
    },
    async clearSelection() {
      if (destroyed) return;
      await invokeDesktopBrowserBridge('browser_bridge_clear_selection', {
        sessionId: options.sessionId,
      });
    },
    async clearAnnotations() {
      if (destroyed) return;
      await invokeDesktopBrowserBridge('browser_bridge_clear_annotations', {
        sessionId: options.sessionId,
      });
    },
    async navigate(url) {
      if (destroyed) return;
      await invokeDesktopBrowserBridge('browser_bridge_navigate', {
        sessionId: options.sessionId,
        url,
      });
    },
    async openDevTools() {
      if (destroyed) return;
      await invokeDesktopBrowserBridge('browser_bridge_open_devtools', {
        sessionId: options.sessionId,
      });
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      unlisteners.forEach((unlisten) => unlisten());
      await invokeDesktopBrowserBridge('browser_bridge_close', {
        sessionId: options.sessionId,
      });
    },
  };
}
