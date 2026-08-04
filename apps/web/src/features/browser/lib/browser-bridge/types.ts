import type {
  PreviewHelperCapability,
  PreviewHelperMessage,
  PreviewHoverPayload,
  PreviewHelperPayload,
} from '../browser-helper/types';

export type BrowserTransportMode = 'same-origin' | 'extension' | 'desktop';

export interface BrowserTransportViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom?: number;
}

export interface BrowserBridgeHostInitMessage {
  type: 'atmos-browser:host-init';
  sessionId: string;
  pageUrl: string;
  parentOrigin: string;
  allowedOrigins: string[];
}

export type BrowserBridgeCommandMessage =
  | BrowserBridgeHostInitMessage
  | {
      type: 'atmos-browser:ping';
      sessionId: string;
    }
  | {
      type: 'atmos-browser:enter-pick-mode';
      sessionId: string;
    }
  | {
      type: 'atmos-browser:exit-pick-mode';
      sessionId: string;
    }
  | {
      type: 'atmos-browser:clear-selection';
      sessionId: string;
    }
  | {
      type: 'atmos-browser:destroy';
      sessionId: string;
    };

export type BrowserBridgeOutgoingMessage = PreviewHelperMessage;

export interface BrowserBridgeEventHandlers {
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
    selectionSnapshot?: PreviewHelperPayload,
  ) => void;
  onCleared?: () => void;
  onError?: (message: string) => void;
  onNavigationChanged?: (url: string, pageTitle?: string, faviconUrl?: string) => void;
  onTitleChanged?: (pageTitle: string, faviconUrl?: string, pageUrl?: string) => void;
  onOpenTab?: (targetUrl: string, sourceUrl?: string) => void;
  onCursorChange?: (cursor: string) => void;
  /** Guest scrolled/resized — host should re-query annotation rects (desktop). */
  onViewportChanged?: () => void;
}

export interface BrowserElementRectResult {
  selector: string;
  rect: { x: number; y: number; width: number; height: number } | null;
}

export interface BrowserBridgeController {
  mode: BrowserTransportMode;
  enterPickMode: () => Promise<void> | void;
  exitPickMode: () => Promise<void> | void;
  clearSelection: (notifyHost?: boolean) => Promise<void> | void;
  clearAnnotations?: () => Promise<void> | void;
  /**
   * In-panel desktop navigation is host webview–owned. Prefer updating host
   * `src` / committed URL. `navigate` is for detached surfaces or bookkeeping.
   */
  navigate?: (url: string) => Promise<void> | void;
  openDevTools?: () => Promise<void> | void;
  setZoom?: (zoom: number) => Promise<void> | void;
  queryElementRects?: (selectors: string[]) => Promise<BrowserElementRectResult[]>;
  destroy: () => Promise<void> | void;
}
