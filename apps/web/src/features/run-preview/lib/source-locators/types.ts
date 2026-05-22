export type SourceLocatorFramework = 'react' | 'vue' | 'angular' | 'svelte' | 'unknown';
export type SourceLocatorConfidence = 'high' | 'medium' | 'low';

export interface SourceLocationResult {
  framework: SourceLocatorFramework;
  componentName?: string;
  displayName?: string;
  filePath?: string;
  line?: number;
  column?: number;
  componentChain?: string[];
  confidence: SourceLocatorConfidence;
  debug?: string[];
}

export interface SourceLocatorAdapter {
  id: string;
  canHandle: (win: Window) => boolean;
  locate: (element: Element, win: Window) => SourceLocationResult | null;
}
