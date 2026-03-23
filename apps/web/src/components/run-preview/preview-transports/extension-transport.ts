import type {
  PreviewBridgeCommandMessage,
  PreviewBridgeController,
  PreviewBridgeEventHandlers,
} from '../preview-bridge/types';
import type { PreviewHelperMessage } from '../preview-helper/types';

interface ConnectExtensionPreviewTransportOptions extends PreviewBridgeEventHandlers {
  frameWindow: Window;
  pageUrl: string;
  sessionId: string;
  parentOrigin: string;
  allowedOrigins: string[];
  autoEnterPickMode?: boolean;
}

const HANDSHAKE_TIMEOUT_MS = 1800;
const HANDSHAKE_INTERVAL_MS = 250;

function isPreviewHelperMessage(value: unknown): value is PreviewHelperMessage {
  if (!value || typeof value !== 'object') return false;
  const typed = value as { type?: unknown; sessionId?: unknown };
  return typeof typed.type === 'string' && typeof typed.sessionId === 'string';
}

export function connectExtensionPreviewTransport(
  options: ConnectExtensionPreviewTransportOptions,
): PreviewBridgeController {
  let destroyed = false;
  let ready = false;
  let handshakeInterval: number | null = null;
  let handshakeTimeout: number | null = null;
  let queuedEnterPickMode = options.autoEnterPickMode ?? true;

  const cleanupTimers = () => {
    if (handshakeInterval != null) {
      window.clearInterval(handshakeInterval);
      handshakeInterval = null;
    }
    if (handshakeTimeout != null) {
      window.clearTimeout(handshakeTimeout);
      handshakeTimeout = null;
    }
  };

  const post = (message: PreviewBridgeCommandMessage) => {
    if (destroyed) return;
    options.frameWindow.postMessage(message, '*');
  };

  const sendHostInit = () => {
    post({
      type: 'atmos-preview:host-init',
      sessionId: options.sessionId,
      pageUrl: options.pageUrl,
      parentOrigin: options.parentOrigin,
      allowedOrigins: options.allowedOrigins,
    });
  };

  const handleMessage = (event: MessageEvent) => {
    if (destroyed) return;
    if (event.source !== options.frameWindow) return;
    if (!isPreviewHelperMessage(event.data)) return;
    if (event.data.sessionId !== options.sessionId) return;

    switch (event.data.type) {
      case 'atmos-preview:ready': {
        ready = true;
        cleanupTimers();
        options.onReady?.(event.data.capabilities);
        if (queuedEnterPickMode) {
          queuedEnterPickMode = false;
          post({
            type: 'atmos-preview:enter-pick-mode',
            sessionId: options.sessionId,
          });
        }
        break;
      }
      case 'atmos-preview:selected':
        options.onSelected?.(event.data);
        break;
      case 'atmos-preview:cleared':
        options.onCleared?.();
        break;
      case 'atmos-preview:error':
        options.onError?.(event.data.error);
        break;
      default:
        break;
    }
  };

  window.addEventListener('message', handleMessage);

  sendHostInit();
  handshakeInterval = window.setInterval(sendHostInit, HANDSHAKE_INTERVAL_MS);
  handshakeTimeout = window.setTimeout(() => {
    cleanupTimers();
    if (ready || destroyed) return;
    options.onError?.(
      'Cross-port element selection requires the Atmos Inspector extension. Pages that reject iframe embedding must use the desktop preview.',
    );
  }, HANDSHAKE_TIMEOUT_MS);

  return {
    mode: 'extension',
    enterPickMode() {
      if (!ready) {
        queuedEnterPickMode = true;
        sendHostInit();
        return;
      }
      post({
        type: 'atmos-preview:enter-pick-mode',
        sessionId: options.sessionId,
      });
    },
    clearSelection() {
      if (!ready) return;
      post({
        type: 'atmos-preview:clear-selection',
        sessionId: options.sessionId,
      });
    },
    destroy() {
      cleanupTimers();
      window.removeEventListener('message', handleMessage);
      post({
        type: 'atmos-preview:destroy',
        sessionId: options.sessionId,
      });
      destroyed = true;
    },
  };
}
