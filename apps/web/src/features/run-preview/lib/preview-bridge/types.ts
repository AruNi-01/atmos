import type {
  PreviewHelperCapability,
  PreviewHelperMessage,
  PreviewHoverPayload,
  PreviewHelperPayload,
} from '../preview-helper/types';

export type PreviewTransportMode = 'same-origin' | 'extension' | 'desktop-native';

export interface PreviewTransportViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom?: number;
}

export interface PreviewBridgeHostInitMessage {
  type: 'atmos-preview:host-init';
  sessionId: string;
  pageUrl: string;
  parentOrigin: string;
  allowedOrigins: string[];
}

export type PreviewBridgeCommandMessage =
  | PreviewBridgeHostInitMessage
  | {
      type: 'atmos-preview:ping';
      sessionId: string;
    }
  | {
      type: 'atmos-preview:enter-pick-mode';
      sessionId: string;
    }
  | {
      type: 'atmos-preview:exit-pick-mode';
      sessionId: string;
    }
  | {
      type: 'atmos-preview:clear-selection';
      sessionId: string;
    }
  | {
      type: 'atmos-preview:destroy';
      sessionId: string;
    };

export type PreviewBridgeOutgoingMessage = PreviewHelperMessage;

export interface PreviewBridgeEventHandlers {
  onReady?: (
    capabilities: PreviewHelperCapability[],
    extensionVersion?: string,
    pageTitle?: string,
    faviconUrl?: string,
    pageUrl?: string,
  ) => void;
  onSelected?: (payload: PreviewHelperPayload) => void;
  onHover?: (payload: PreviewHoverPayload | null) => void;
  onToolbarAction?: (
    action: 'copy' | 'add' | 'update' | 'delete',
    note?: string,
    annotationId?: string,
  ) => void;
  onCleared?: () => void;
  onError?: (message: string) => void;
  onNavigationChanged?: (url: string, pageTitle?: string, faviconUrl?: string) => void;
  onTitleChanged?: (pageTitle: string, faviconUrl?: string, pageUrl?: string) => void;
  onOpenTab?: (targetUrl: string, sourceUrl?: string) => void;
  onCursorChange?: (cursor: string) => void;
}

export interface PreviewBridgeController {
  mode: PreviewTransportMode;
  enterPickMode: () => Promise<void> | void;
  exitPickMode: () => Promise<void> | void;
  clearSelection: (notifyHost?: boolean) => Promise<void> | void;
  clearAnnotations?: () => Promise<void> | void;
  updateViewport?: (viewport: PreviewTransportViewport) => Promise<void> | void;
  navigate?: (url: string) => Promise<void> | void;
  openDevTools?: () => Promise<void> | void;
  show?: () => Promise<void> | void;
  hide?: () => Promise<void> | void;
  destroy: () => Promise<void> | void;
}
