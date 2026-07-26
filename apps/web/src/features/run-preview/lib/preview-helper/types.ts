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
      type: 'atmos-preview:ready';
      sessionId: string;
      pageUrl: string;
      capabilities: PreviewHelperCapability[];
      extensionVersion?: string;
      pageTitle?: string;
      faviconUrl?: string;
    }
  | {
      type: 'atmos-preview:hover';
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
      type: 'atmos-preview:selected';
      sessionId: string;
    } & PreviewHelperPayload)
  | {
      type: 'atmos-preview:cleared';
      sessionId: string;
      pageUrl: string;
    }
  | {
      type: 'atmos-preview:error';
      sessionId: string;
      pageUrl: string;
      error: string;
    }
  | {
      type: 'atmos-preview:navigation-changed';
      sessionId: string;
      pageUrl: string;
      pageTitle?: string;
      faviconUrl?: string;
    }
  | {
      type: 'atmos-preview:title-changed';
      sessionId: string;
      pageUrl: string;
      pageTitle: string;
      faviconUrl?: string;
    }
  | {
      type: 'atmos-preview:open-tab';
      sessionId: string;
      pageUrl: string;
      targetUrl: string;
    }
  | {
      type: 'atmos-preview:toolbar-action';
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
      type: 'atmos-preview:pong';
      sessionId: string;
      pageUrl: string;
      pageTitle?: string;
      faviconUrl?: string;
    };
