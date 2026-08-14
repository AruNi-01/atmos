import {
  invokeDesktopBrowserBridge,
  listenDesktopBrowserBridge,
} from '@/shared/lib/desktop-browser-bridge';
import { markBrowserUseActivity } from '../../store/use-browser-use-activity';
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
      const cursor =
        payload.cursor &&
        typeof (payload.cursor as { x?: unknown }).x === "number" &&
        typeof (payload.cursor as { y?: unknown }).y === "number"
          ? {
              x: (payload.cursor as { x: number }).x,
              y: (payload.cursor as { y: number }).y,
            }
          : undefined;
      const viewportRaw = (payload as { viewport?: { width?: unknown; height?: unknown } }).viewport;
      const viewport =
        viewportRaw &&
        typeof viewportRaw.width === "number" &&
        typeof viewportRaw.height === "number" &&
        viewportRaw.width > 0 &&
        viewportRaw.height > 0
          ? { width: viewportRaw.width, height: viewportRaw.height }
          : undefined;
      options.onSelected?.({
        pageUrl: payload.pageUrl,
        rect: payload.rect,
        elementContext: payload.elementContext as never,
        sourceLocation: (payload.sourceLocation as never) ?? null,
        cursor,
        viewport,
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
    listenDesktopBrowserBridge('desktop-browser:viewport-changed', (payload) => {
      if (payload.sessionId !== options.sessionId) return;
      options.onViewportChanged?.();
    }),
    listenDesktopBrowserBridge('desktop-browser:agent-activity', (payload) => {
      if (payload.sessionId !== options.sessionId) return;
      const active = payload.active !== false;
      const status =
        typeof payload.status === "string"
          ? payload.status
          : "Agent is using this page";
      markBrowserUseActivity(payload.sessionId, status, active);
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
      await invokeDesktopBrowserBridge('browser_bridge_exit_pick_mode', {
        sessionId: options.sessionId,
      });
    },
    async clearSelection() {
      if (destroyed) return;
      // Unlock only — keep pick mode while the toolbar button stays pressed.
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
    /**
     * Bookkeeping / detached only. In-panel loads are driven by host webview src.
     * Calling this for in-panel no longer loads (main navigates detached only).
     */
    async navigate(url) {
      if (destroyed) return;
      await invokeDesktopBrowserBridge('browser_bridge_navigate', {
        sessionId: options.sessionId,
        url,
      });
    },
    async setZoom(zoom) {
      if (destroyed) return;
      await invokeDesktopBrowserBridge('browser_bridge_set_zoom', {
        sessionId: options.sessionId,
        zoom,
      });
    },
    async queryElementRects(selectors) {
      if (destroyed) return [];
      const result = await invokeDesktopBrowserBridge<
        Array<{ selector: string; rect: { x: number; y: number; width: number; height: number } | null }>
      >('browser_bridge_query_element_rects', {
        sessionId: options.sessionId,
        selectors,
      });
      return Array.isArray(result) ? result : [];
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
