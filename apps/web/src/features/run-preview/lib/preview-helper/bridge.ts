import type { PreviewHelperCapability, PreviewHelperMessage, PreviewHelperPayload } from './types';

export interface PreviewBridgeOptions {
  sessionId: string;
  pageUrl: string;
  parentOrigin: string;
}

export function createPreviewHelperBridge(win: Window, options: PreviewBridgeOptions) {
  const targetOrigin = options.parentOrigin || '*';
  const post = (message: PreviewHelperMessage) => {
    win.parent.postMessage(message, targetOrigin);
  };

  return {
    ready(capabilities: PreviewHelperCapability[], pageTitle?: string, faviconUrl?: string) {
      post({
        type: 'atmos-preview:ready',
        sessionId: options.sessionId,
        pageUrl: options.pageUrl,
        capabilities,
        pageTitle,
        faviconUrl,
      });
    },
    hover(rect: PreviewHelperPayload['rect']) {
      post({
        type: 'atmos-preview:hover',
        sessionId: options.sessionId,
        pageUrl: options.pageUrl,
        rect,
      });
    },
    selected(payload: PreviewHelperPayload) {
      post({
        type: 'atmos-preview:selected',
        sessionId: options.sessionId,
        ...payload,
      });
    },
    cleared() {
      post({
        type: 'atmos-preview:cleared',
        sessionId: options.sessionId,
        pageUrl: options.pageUrl,
      });
    },
    error(error: string) {
      post({
        type: 'atmos-preview:error',
        sessionId: options.sessionId,
        pageUrl: options.pageUrl,
        error,
      });
    },
    navigationChanged(pageUrl: string, pageTitle?: string, faviconUrl?: string) {
      post({
        type: 'atmos-preview:navigation-changed',
        sessionId: options.sessionId,
        pageUrl,
        pageTitle,
        faviconUrl,
      });
    },
    titleChanged(pageTitle: string, faviconUrl?: string) {
      post({
        type: 'atmos-preview:title-changed',
        sessionId: options.sessionId,
        pageUrl: win.location.href,
        pageTitle,
        faviconUrl,
      });
    },
    openTab(targetUrl: string) {
      post({
        type: 'atmos-preview:open-tab',
        sessionId: options.sessionId,
        pageUrl: win.location.href,
        targetUrl,
      });
    },
  };
}
