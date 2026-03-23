import type { SourceLocationResult, SourceLocatorAdapter } from './types';

interface SvelteMetaLocation {
  file?: string;
  line?: number;
  column?: number;
}

interface SvelteMetaLike {
  loc?: SvelteMetaLocation;
}

interface SvelteElementWithMeta extends Element {
  __svelte_meta?: SvelteMetaLike;
}

interface SvelteCandidate {
  filePath: string;
  line?: number;
  column?: number;
  componentName: string;
}

interface SvelteConfidenceEvaluation {
  confidence: SourceLocationResult['confidence'];
  debug: string[];
}

function getSvelteMeta(element: Element | null): SvelteMetaLike | null {
  if (!element) return null;
  const typed = element as SvelteElementWithMeta;
  return typed.__svelte_meta ?? null;
}

function filePathToComponentName(filePath: string): string {
  const normalized = filePath.split('/').pop() || filePath;
  const withoutExtension = normalized.replace(/\.svelte$/i, '');

  switch (withoutExtension) {
    case '+page':
      return 'Page';
    case '+layout':
      return 'Layout';
    case '+error':
      return 'ErrorPage';
    default:
      return withoutExtension || 'SvelteComponent';
  }
}

function hasSvelteMetaInDocument(win: Window): boolean {
  const root = win.document.body;
  if (!root) return false;

  const walker = win.document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const elementCtor = win.document.defaultView?.Element ?? Element;
  let inspected = 0;
  let current: Node | null = walker.currentNode;

  while (current && inspected < 500) {
    if (current instanceof elementCtor && getSvelteMeta(current)) {
      return true;
    }
    current = walker.nextNode();
    inspected += 1;
  }

  return false;
}

function collectSvelteCandidates(element: Element): SvelteCandidate[] {
  const candidates: SvelteCandidate[] = [];
  const seen = new Set<string>();
  let current: Element | null = element;
  let depth = 0;

  while (current && depth < 12) {
    const meta = getSvelteMeta(current);
    const filePath = meta?.loc?.file;
    if (filePath && !seen.has(filePath)) {
      seen.add(filePath);
      candidates.push({
        filePath,
        line: meta.loc?.line,
        column: meta.loc?.column,
        componentName: filePathToComponentName(filePath),
      });
    }
    current = current.parentElement;
    depth += 1;
  }

  return candidates;
}

function evaluateSvelteConfidence(bestCandidate: SvelteCandidate | null, componentChain: string[]): SvelteConfidenceEvaluation {
  const debug: string[] = [];
  let score = 0;

  if (bestCandidate?.componentName) {
    score += 1;
    debug.push('component-name');
    debug.push('inferred-component-name');
  } else {
    debug.push('missing-component-name');
  }

  if (bestCandidate?.filePath) {
    score += 2;
    debug.push('source-file');
  } else {
    debug.push('missing-source-file');
  }

  if (bestCandidate?.line != null) {
    score += 1;
    debug.push('source-line');
  }

  if (bestCandidate?.column != null) {
    score += 1;
    debug.push('source-column');
  }

  if (bestCandidate?.filePath && !bestCandidate.filePath.includes('node_modules')) {
    score += 2;
    debug.push('user-code-path');
  } else if (bestCandidate?.filePath) {
    score -= 1;
    debug.push('node-modules-path');
  }

  if (componentChain.length > 1) {
    score += 1;
    debug.push('component-chain');
  } else {
    debug.push('single-component-chain');
  }

  if (score >= 6) {
    return { confidence: 'high', debug };
  }
  if (score >= 3) {
    return { confidence: 'medium', debug };
  }
  return { confidence: 'low', debug };
}

export const svelteSourceLocator: SourceLocatorAdapter = {
  id: 'svelte',
  canHandle: (win) => hasSvelteMetaInDocument(win),
  locate: (element) => {
    const candidates = collectSvelteCandidates(element);
    if (candidates.length === 0) return null;

    const bestCandidate = candidates[0] ?? null;
    const componentChain = candidates.slice(0, 5).map((candidate) => candidate.componentName);
    const confidenceEvaluation = evaluateSvelteConfidence(bestCandidate, componentChain);

    return {
      framework: 'svelte',
      componentName: bestCandidate?.componentName,
      displayName: bestCandidate?.componentName,
      filePath: bestCandidate?.filePath,
      line: bestCandidate?.line,
      column: bestCandidate?.column,
      componentChain,
      confidence: confidenceEvaluation.confidence,
      debug: confidenceEvaluation.debug,
    };
  },
};
