import type {
  BrowserBridgeCommandMessage,
  BrowserBridgeController,
  BrowserBridgeEventHandlers,
} from '../browser-bridge/types';
import type { PreviewHelperMessage } from '../browser-helper/types';

interface ConnectExtensionPreviewTransportOptions extends BrowserBridgeEventHandlers {
  frameWindow: Window;
  pageUrl: string;
  sessionId: string;
  parentOrigin: string;
  allowedOrigins: string[];
  autoEnterPickMode?: boolean;
}

const HANDSHAKE_TIMEOUT_MS = 1800;
const HANDSHAKE_INTERVAL_MS = 250;
const KEEP_ALIVE_INTERVAL_MS = 2500;
const KEEP_ALIVE_STALE_MS = 8000;

function isPreviewHelperMessage(value: unknown): value is PreviewHelperMessage {
  if (!value || typeof value !== 'object') return false;
  const typed = value as { type?: unknown; sessionId?: unknown };
  return typeof typed.type === 'string' && typeof typed.sessionId === 'string';
}

export function connectExtensionPreviewTransport(
  options: ConnectExtensionPreviewTransportOptions,
): BrowserBridgeController {
  let destroyed = false;
  let ready = false;
  let handshakeInterval: number | null = null;
  let handshakeTimeout: number | null = null;
  let keepAliveInterval: number | null = null;
  let pickModeDesired = options.autoEnterPickMode ?? true;
  let lastSeenAt = Date.now();

  const cleanupHandshakeTimers = () => {
    if (handshakeInterval != null) {
      window.clearInterval(handshakeInterval);
      handshakeInterval = null;
    }
    if (handshakeTimeout != null) {
      window.clearTimeout(handshakeTimeout);
      handshakeTimeout = null;
    }
  };

  const cleanupKeepAlive = () => {
    if (keepAliveInterval != null) {
      window.clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
  };

  const markAlive = () => {
    lastSeenAt = Date.now();
  };

  const expectedOrigin = new URL(options.pageUrl).origin;

  const post = (message: BrowserBridgeCommandMessage) => {
    if (destroyed) return;
    options.frameWindow.postMessage(message, expectedOrigin);
  };

  const sendHostInit = () => {
    post({
      type: 'atmos-browser:host-init',
      sessionId: options.sessionId,
      pageUrl: options.pageUrl,
      parentOrigin: options.parentOrigin,
      allowedOrigins: options.allowedOrigins,
    });
  };

  const startHandshake = () => {
    if (destroyed) return;
    ready = false;
    cleanupKeepAlive();
    cleanupHandshakeTimers();
    sendHostInit();
    handshakeInterval = window.setInterval(sendHostInit, HANDSHAKE_INTERVAL_MS);
    handshakeTimeout = window.setTimeout(() => {
      cleanupHandshakeTimers();
      if (ready || destroyed) return;
      options.onError?.(
        'Cross-port element selection requires the Atmos Inspector extension. Pages that reject iframe embedding must use the desktop Browser.',
      );
    }, HANDSHAKE_TIMEOUT_MS);
  };

  const startKeepAlive = () => {
    cleanupKeepAlive();
    markAlive();
    keepAliveInterval = window.setInterval(() => {
      if (destroyed || !ready) return;
      if (Date.now() - lastSeenAt > KEEP_ALIVE_STALE_MS) {
        startHandshake();
        return;
      }
      post({
        type: 'atmos-browser:ping',
        sessionId: options.sessionId,
      });
    }, KEEP_ALIVE_INTERVAL_MS);
  };

  const handleMessage = (event: MessageEvent) => {
    if (destroyed) return;
    if (event.source !== options.frameWindow) return;
    if (event.origin !== expectedOrigin) return;
    if (!isPreviewHelperMessage(event.data)) return;
    if (event.data.sessionId !== options.sessionId) return;
    markAlive();

    switch (event.data.type) {
      case 'atmos-browser:ready': {
        ready = true;
        cleanupHandshakeTimers();
        startKeepAlive();
        options.onReady?.(
          event.data.capabilities,
          event.data.extensionVersion,
          event.data.pageTitle,
          event.data.faviconUrl,
          event.data.pageUrl,
        );
        if (pickModeDesired) {
          post({
            type: 'atmos-browser:enter-pick-mode',
            sessionId: options.sessionId,
          });
        }
        break;
      }
      case 'atmos-browser:selected':
        options.onSelected?.(event.data);
        break;
      case 'atmos-browser:hover':
        options.onHover?.(
          event.data.label && event.data.rect && event.data.cursor
            ? {
                label: event.data.label,
                rect: event.data.rect,
                cursor: event.data.cursor,
              }
            : null,
        );
        break;
      case 'atmos-browser:cleared':
        options.onCleared?.();
        break;
      case 'atmos-browser:error':
        options.onError?.(event.data.error);
        break;
      case 'atmos-browser:navigation-changed':
        options.onNavigationChanged?.(event.data.pageUrl, event.data.pageTitle, event.data.faviconUrl);
        break;
      case 'atmos-browser:title-changed':
        options.onTitleChanged?.(event.data.pageTitle, event.data.faviconUrl, event.data.pageUrl);
        break;
      case 'atmos-browser:open-tab':
        options.onOpenTab?.(event.data.targetUrl, event.data.pageUrl);
        break;
      case 'atmos-browser:toolbar-action':
        options.onToolbarAction?.(event.data.action, event.data.note, event.data.annotationId);
        break;
      case 'atmos-browser:pong':
        break;
      default:
        break;
    }
  };

  window.addEventListener('message', handleMessage);

  startHandshake();

  return {
    mode: 'extension',
    enterPickMode() {
      pickModeDesired = true;
      if (!ready) {
        startHandshake();
        return;
      }
      post({
        type: 'atmos-browser:enter-pick-mode',
        sessionId: options.sessionId,
      });
    },
    exitPickMode() {
      pickModeDesired = false;
      if (!ready) return;
      post({
        type: 'atmos-browser:exit-pick-mode',
        sessionId: options.sessionId,
      });
      // Fallback for older extension versions that don't handle exit-pick-mode:
      // clear-selection at least removes the visible overlay.
      post({
        type: 'atmos-browser:clear-selection',
        sessionId: options.sessionId,
      });
    },
    clearSelection() {
      if (!ready) return;
      post({
        type: 'atmos-browser:clear-selection',
        sessionId: options.sessionId,
      });
    },
    destroy() {
      cleanupHandshakeTimers();
      cleanupKeepAlive();
      window.removeEventListener('message', handleMessage);
      post({
        type: 'atmos-browser:destroy',
        sessionId: options.sessionId,
      });
      destroyed = true;
    },
  };
}
