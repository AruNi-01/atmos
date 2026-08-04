import type { SourceLocationResult } from '../source-locators/types';

export interface PreviewElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreviewElementContext {
  selector: string;
  tagName: string;
  attributesSummary?: string;
  textPreview?: string;
  htmlPreview?: string;
  selectedText: string;
}

export interface PreviewHelperPayload {
  pageUrl: string;
  rect: PreviewElementRect;
  elementContext: PreviewElementContext;
  sourceLocation: SourceLocationResult | null;
  /** Guest click position in guest CSS pixels (desktop popover anchors near mouse). */
  cursor?: { x: number; y: number };
  /** Guest layout viewport size for host scale mapping under CSS transform/zoom. */
  viewport?: { width: number; height: number };
}

export interface PreviewHoverPayload {
  rect: PreviewElementRect;
  label: string;
  cursor: {
    x: number;
    y: number;
  };
}

export type PreviewHelperCapability =
  | 'dom-inspection'
  | 'element-selection'
  | 'source-locator:react'
  | 'source-locator:vue'
  | 'source-locator:angular'
  | 'source-locator:svelte';

export type PreviewHelperMessage =
  | {
      type: 'atmos-browser:ready';
      sessionId: string;
      pageUrl: string;
      capabilities: PreviewHelperCapability[];
      extensionVersion?: string;
      pageTitle?: string;
      faviconUrl?: string;
    }
  | {
      type: 'atmos-browser:hover';
      sessionId: string;
      pageUrl: string;
      label?: string;
      rect?: PreviewElementRect;
      cursor?: {
        x: number;
        y: number;
      };
    }
  | ({
      type: 'atmos-browser:selected';
      sessionId: string;
    } & PreviewHelperPayload)
  | {
      type: 'atmos-browser:cleared';
      sessionId: string;
      pageUrl: string;
    }
  | {
      type: 'atmos-browser:error';
      sessionId: string;
      pageUrl: string;
      error: string;
    }
  | {
      type: 'atmos-browser:navigation-changed';
      sessionId: string;
      pageUrl: string;
      pageTitle?: string;
      faviconUrl?: string;
    }
  | {
      type: 'atmos-browser:title-changed';
      sessionId: string;
      pageUrl: string;
      pageTitle: string;
      faviconUrl?: string;
    }
  | {
      type: 'atmos-browser:open-tab';
      sessionId: string;
      pageUrl: string;
      targetUrl: string;
    }
  | {
      type: 'atmos-browser:toolbar-action';
      sessionId: string;
      pageUrl: string;
      action: 'copy' | 'add' | 'update' | 'delete';
      annotationId?: string;
      note?: string;
      rect?: PreviewElementRect;
      elementContext?: PreviewElementContext;
      sourceLocation?: SourceLocationResult | null;
    }
  | {
      type: 'atmos-browser:pong';
      sessionId: string;
      pageUrl: string;
      pageTitle?: string;
      faviconUrl?: string;
    };
