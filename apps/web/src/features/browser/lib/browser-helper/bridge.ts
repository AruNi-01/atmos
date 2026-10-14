import type {
  PreviewHelperCapability,
  PreviewHelperMessage,
  PreviewHelperPayload,
  PreviewHoverPayload,
} from './types';

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
        type: 'atmos-browser:ready',
        sessionId: options.sessionId,
        pageUrl: options.pageUrl,
        capabilities,
        pageTitle,
        faviconUrl,
      });
    },
    hover(payload: PreviewHoverPayload | null) {
      post({
        type: 'atmos-browser:hover',
        sessionId: options.sessionId,
        pageUrl: options.pageUrl,
        label: payload?.label,
        rect: payload?.rect,
        cursor: payload?.cursor,
      });
    },
    selected(payload: PreviewHelperPayload) {
      post({
        type: 'atmos-browser:selected',
        sessionId: options.sessionId,
        ...payload,
      });
    },
    cleared() {
      post({
        type: 'atmos-browser:cleared',
        sessionId: options.sessionId,
        pageUrl: options.pageUrl,
      });
    },
    error(error: string) {
      post({
        type: 'atmos-browser:error',
        sessionId: options.sessionId,
        pageUrl: options.pageUrl,
        error,
      });
    },
    navigationChanged(pageUrl: string, pageTitle?: string, faviconUrl?: string) {
      post({
        type: 'atmos-browser:navigation-changed',
        sessionId: options.sessionId,
        pageUrl,
        pageTitle,
        faviconUrl,
      });
    },
    titleChanged(pageTitle: string, faviconUrl?: string) {
      post({
        type: 'atmos-browser:title-changed',
        sessionId: options.sessionId,
        pageUrl: win.location.href,
        pageTitle,
        faviconUrl,
      });
    },
    openTab(targetUrl: string) {
      post({
        type: 'atmos-browser:open-tab',
        sessionId: options.sessionId,
        pageUrl: win.location.href,
        targetUrl,
      });
    },
  };
}
