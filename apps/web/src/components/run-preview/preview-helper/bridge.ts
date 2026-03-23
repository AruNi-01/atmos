import type { PreviewHelperCapability, PreviewHelperMessage, PreviewHelperPayload } from './types';

export interface PreviewBridgeOptions {
  sessionId: string;
  pageUrl: string;
}

export function createPreviewHelperBridge(win: Window, options: PreviewBridgeOptions) {
  const post = (message: PreviewHelperMessage) => {
    win.parent.postMessage(message, '*');
  };

  return {
    ready(capabilities: PreviewHelperCapability[]) {
      post({
        type: 'atmos-preview:ready',
        sessionId: options.sessionId,
        pageUrl: options.pageUrl,
        capabilities,
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
  };
}
