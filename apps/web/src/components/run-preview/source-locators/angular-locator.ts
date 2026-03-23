import type { SourceLocationResult, SourceLocatorAdapter } from './types';

interface AngularDebugGlobals {
  getComponent?: (element: Element) => unknown;
  getOwningComponent?: (elementOrDir: unknown) => unknown;
  getRootComponents?: (elementOrDir: unknown) => unknown[];
  getDirectiveMetadata?: (directiveOrComponentInstance: unknown) => unknown;
}

interface AngularWindow extends Window {
  ng?: AngularDebugGlobals;
}

interface AngularComponentCandidate {
  name: string;
  instance: Record<string, unknown>;
}

interface AngularConfidenceEvaluation {
  confidence: SourceLocationResult['confidence'];
  debug: string[];
}

function getAngularGlobals(win: Window): AngularDebugGlobals | null {
  const angularWindow = win as AngularWindow;
  return angularWindow.ng ?? null;
}

function getAngularComponentName(instance: unknown): string | null {
  if (!instance || typeof instance !== 'object') return null;
  const typed = instance as {
    constructor?: {
      name?: string;
      ɵcmp?: {
        type?: {
          name?: string;
        };
      };
    };
  };

  return (
    typed.constructor?.ɵcmp?.type?.name ||
    typed.constructor?.name ||
    null
  );
}

function getAngularParentInstance(instance: unknown): unknown {
  if (!instance || typeof instance !== 'object') return null;
  const typed = instance as {
    __ngContext__?: unknown[];
  };

  const context = typed.__ngContext__;
  if (!Array.isArray(context)) return null;

  for (const entry of context) {
    if (!entry || typeof entry !== 'object') continue;
    const candidateName = getAngularComponentName(entry);
    if (candidateName && entry !== instance) {
      return entry;
    }
  }

  return null;
}

function normalizeAngularChain(candidates: AngularComponentCandidate[]): string[] {
  return candidates
    .filter((candidate, index) => candidates.findIndex((item) => item.name === candidate.name) === index)
    .slice(0, 5)
    .map((candidate) => candidate.name);
}

function evaluateAngularConfidence(
  candidate: AngularComponentCandidate | null,
  componentChain: string[],
  hasRootComponents: boolean,
  hasDirectiveMetadata: boolean,
): AngularConfidenceEvaluation {
  const debug: string[] = [];
  let score = 0;

  if (candidate?.name) {
    score += 2;
    debug.push('component-name');
  } else {
    debug.push('missing-component-name');
  }

  if (componentChain.length > 1) {
    score += 1;
    debug.push('component-chain');
  }

  if (hasRootComponents) {
    score += 1;
    debug.push('root-components');
  }

  if (hasDirectiveMetadata) {
    score += 1;
    debug.push('directive-metadata');
  }

  debug.push('missing-source-file');

  if (score >= 4) {
    return { confidence: 'medium', debug };
  }

  return { confidence: 'low', debug };
}

export const angularSourceLocator: SourceLocatorAdapter = {
  id: 'angular',
  canHandle: (win) => {
    const ng = getAngularGlobals(win);
    return !!(ng?.getComponent || ng?.getOwningComponent || ng?.getRootComponents);
  },
  locate: (element, win) => {
    const ng = getAngularGlobals(win);
    if (!ng) return null;

    const directComponent = ng.getComponent?.(element) ?? null;
    const owningComponent = ng.getOwningComponent?.(element) ?? null;
    const startingInstance = directComponent || owningComponent;

    if (!startingInstance || typeof startingInstance !== 'object') return null;

    const candidates: AngularComponentCandidate[] = [];
    let current: unknown = startingInstance;
    let depth = 0;

    while (current && depth < 10) {
      const name = getAngularComponentName(current);
      if (name && typeof current === 'object') {
        candidates.push({
          name,
          instance: current as Record<string, unknown>,
        });
      }
      current = getAngularParentInstance(current);
      depth += 1;
    }

    if (candidates.length === 0) return null;

    const componentChain = normalizeAngularChain(candidates);
    const bestCandidate = candidates[0] ?? null;
    const rootComponents = ng.getRootComponents?.(element) ?? [];
    const hasDirectiveMetadata = !!(bestCandidate?.instance && ng.getDirectiveMetadata?.(bestCandidate.instance));
    const confidenceEvaluation = evaluateAngularConfidence(
      bestCandidate,
      componentChain,
      rootComponents.length > 0,
      hasDirectiveMetadata,
    );

    return {
      framework: 'angular',
      componentName: bestCandidate?.name,
      displayName: bestCandidate?.name,
      componentChain,
      confidence: confidenceEvaluation.confidence,
      debug: confidenceEvaluation.debug,
    };
  },
};
