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
    }
  | {
      type: 'atmos-preview:hover';
      sessionId: string;
      pageUrl: string;
      rect: PreviewElementRect;
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
    };
