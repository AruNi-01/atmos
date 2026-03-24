import type {
  PreviewHelperCapability,
  PreviewHelperMessage,
  PreviewHelperPayload,
} from '../preview-helper/types';

export type PreviewTransportMode = 'same-origin' | 'extension' | 'desktop-native';

export interface PreviewTransportViewport {
  x: number;
  y: number;
  width: number;
  height: number;
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
  ) => void;
  onSelected?: (payload: PreviewHelperPayload) => void;
  onCleared?: () => void;
  onError?: (message: string) => void;
  onNavigationChanged?: (url: string, pageTitle?: string) => void;
  onTitleChanged?: (pageTitle: string) => void;
}

export interface PreviewBridgeController {
  mode: PreviewTransportMode;
  enterPickMode: () => Promise<void> | void;
  exitPickMode: () => Promise<void> | void;
  clearSelection: (notifyHost?: boolean) => Promise<void> | void;
  updateViewport?: (viewport: PreviewTransportViewport) => Promise<void> | void;
  navigate?: (url: string) => Promise<void> | void;
  show?: () => Promise<void> | void;
  hide?: () => Promise<void> | void;
  destroy: () => Promise<void> | void;
}

