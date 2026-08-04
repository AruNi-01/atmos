import type { SourceLocationResult, SourceLocatorAdapter } from './types';

interface VueComponentLike {
  type?: unknown;
  parent?: VueComponentLike | null;
  vnode?: {
    type?: unknown;
  } | null;
  proxy?: {
    $options?: {
      name?: string;
      __file?: string;
      _componentTag?: string;
    };
  } | null;
}

interface VueComponentCandidate {
  name: string;
  instance: VueComponentLike;
  filePath?: string;
}

interface VueConfidenceEvaluation {
  confidence: SourceLocationResult['confidence'];
  debug: string[];
}

function getVueComponentName(type: unknown): string | null {
  if (!type) return null;
  if (typeof type === 'function') {
    const candidate = type as { name?: string; displayName?: string };
    return candidate.displayName || candidate.name || null;
  }
  if (typeof type === 'object') {
    const candidate = type as {
      name?: string;
      __name?: string;
      displayName?: string;
    };
    return candidate.displayName || candidate.name || candidate.__name || null;
  }
  return null;
}

function getVueFilePath(instance: VueComponentLike): string | undefined {
  const type = instance.type as { __file?: string } | undefined;
  const vnodeType = instance.vnode?.type as { __file?: string } | undefined;
  return (
    type?.__file ||
    instance.proxy?.$options?.__file ||
    vnodeType?.__file ||
    undefined
  );
}

function getVueInstanceFromElement(element: Element): VueComponentLike | null {
  let current: Element | null = element;

  while (current) {
    const typed = current as Element & Record<string, unknown>;

    const parentComponent = typed.__vueParentComponent;
    if (parentComponent && typeof parentComponent === 'object') {
      return parentComponent as VueComponentLike;
    }

    const legacyVue = typed.__vue__;
    if (legacyVue && typeof legacyVue === 'object') {
      return legacyVue as VueComponentLike;
    }

    const vnode = typed.__vnode;
    if (vnode && typeof vnode === 'object') {
      const component = (vnode as { component?: unknown }).component;
      if (component && typeof component === 'object') {
        return component as VueComponentLike;
      }
    }

    current = current.parentElement;
  }

  return null;
}

function isLikelyVueNoise(name: string): boolean {
  return /^(Transition|BaseTransition|TransitionGroup|KeepAlive|Teleport|Suspense|RouterView|RouterLink)$/.test(name)
    || name.endsWith('Provider')
    || name.endsWith('Transition');
}

function normalizeVueChain(candidates: VueComponentCandidate[]): string[] {
  const uniqueCandidates = candidates.filter(
    (candidate, index) => candidates.findIndex((item) => item.name === candidate.name) === index,
  );
  const userCandidates = uniqueCandidates.filter((candidate) => !isLikelyVueNoise(candidate.name));
  const preferredCandidates = userCandidates.filter((candidate) => !candidate.filePath?.includes('node_modules'));
  const finalCandidates =
    preferredCandidates.length > 0
      ? preferredCandidates
      : userCandidates.length > 0
        ? userCandidates
        : uniqueCandidates;

  return finalCandidates.slice(0, 5).map((candidate) => candidate.name).reverse();
}

function scoreVueCandidate(candidate: VueComponentCandidate): number {
  let score = 0;
  if (candidate.filePath) score += 4;
  if (candidate.filePath && !candidate.filePath.includes('node_modules')) score += 2;
  if (candidate.filePath && candidate.filePath.includes('node_modules')) score -= 1;
  if (!isLikelyVueNoise(candidate.name)) score += 2;
  return score;
}

function evaluateVueConfidence(
  bestCandidate: VueComponentCandidate,
  componentChain: string[],
): VueConfidenceEvaluation {
  const debug: string[] = [];
  let score = 0;

  if (bestCandidate.name) {
    score += 1;
    debug.push('component-name');
  }

  if (bestCandidate.filePath) {
    score += 2;
    debug.push('source-file');
  } else {
    debug.push('missing-source-file');
  }

  if (bestCandidate.filePath && !bestCandidate.filePath.includes('node_modules')) {
    score += 2;
    debug.push('user-code-path');
  } else if (bestCandidate.filePath) {
    score -= 1;
    debug.push('node-modules-path');
  }

  if (isLikelyVueNoise(bestCandidate.name)) {
    score -= 2;
    debug.push('wrapper-component');
  }

  if (componentChain.length === 0) {
    score -= 1;
    debug.push('empty-component-chain');
  } else if (componentChain.length <= 3) {
    score += 1;
    debug.push('focused-component-chain');
  }

  if (score >= 5) {
    return { confidence: 'high', debug };
  }
  if (score >= 3) {
    return { confidence: 'medium', debug };
  }
  return { confidence: 'low', debug };
}

export const vueSourceLocator: SourceLocatorAdapter = {
  id: 'vue',
  canHandle: (win) => {
    return !!(
      win.document.querySelector('[data-v-app]') ||
      (win as Window & Record<string, unknown>).__VUE__ ||
      (win as Window & Record<string, unknown>).__VUE_DEVTOOLS_GLOBAL_HOOK__
    );
  },
  locate: (element) => {
    const startInstance = getVueInstanceFromElement(element);
    if (!startInstance) return null;

    const candidates: VueComponentCandidate[] = [];
    let current: VueComponentLike | null | undefined = startInstance;
    let depth = 0;

    while (current && depth < 40) {
      const name =
        getVueComponentName(current.type) ||
        getVueComponentName(current.vnode?.type) ||
        current.proxy?.$options?.name ||
        current.proxy?.$options?._componentTag ||
        null;

      if (name) {
        candidates.push({
          name,
          instance: current,
          filePath: getVueFilePath(current),
        });
      }

      current = current.parent;
      depth += 1;
    }

    if (candidates.length === 0) return null;

    const bestCandidate = [...candidates].sort((left, right) => scoreVueCandidate(right) - scoreVueCandidate(left))[0];
    const componentChain = normalizeVueChain(candidates);
    const confidenceEvaluation = evaluateVueConfidence(bestCandidate, componentChain);

    return {
      framework: 'vue',
      componentName: bestCandidate.name,
      displayName: bestCandidate.name,
      filePath: bestCandidate.filePath,
      componentChain,
      confidence: confidenceEvaluation.confidence,
      debug: confidenceEvaluation.debug,
    };
  },
};
