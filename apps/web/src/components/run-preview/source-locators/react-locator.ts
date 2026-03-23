import type { SourceLocationResult, SourceLocatorAdapter } from './types';

interface ReactFiberLike {
  type?: unknown;
  elementType?: unknown;
  return?: ReactFiberLike | null;
  _debugSource?: unknown;
  _debugOwner?: ReactFiberLike | null;
  memoizedProps?: Record<string, unknown> | null;
}

interface DebugSourceLike {
  fileName?: string;
  filePath?: string;
  lineNumber?: number;
  line?: number;
  columnNumber?: number;
  column?: number;
}

interface FiberCandidate {
  name: string;
  fiber: ReactFiberLike;
  source: DebugSourceLike | null;
}

interface ConfidenceEvaluation {
  confidence: SourceLocationResult['confidence'];
  debug: string[];
}

function getDisplayName(type: unknown): string | null {
  if (!type) return null;
  if (typeof type === 'string') return null;
  if (typeof type === 'function') {
    const candidate = type as { displayName?: string; name?: string };
    return candidate.displayName || candidate.name || null;
  }
  if (typeof type === 'object') {
    const candidate = type as {
      displayName?: string;
      name?: string;
      render?: { displayName?: string; name?: string };
      type?: { displayName?: string; name?: string };
    };
    return (
      candidate.displayName ||
      candidate.name ||
      candidate.render?.displayName ||
      candidate.render?.name ||
      candidate.type?.displayName ||
      candidate.type?.name ||
      null
    );
  }
  return null;
}

function getFiberFromElement(element: Element): ReactFiberLike | null {
  const typed = element as Element & Record<string, unknown>;
  for (const key of Object.keys(typed)) {
    if (
      key.startsWith('__reactFiber$') ||
      key.startsWith('__reactInternalInstance$') ||
      key.startsWith('__reactContainer$')
    ) {
      const value = typed[key];
      if (value && typeof value === 'object') {
        return value as ReactFiberLike;
      }
    }
  }
  return null;
}

function coerceDebugSource(value: unknown): DebugSourceLike | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as DebugSourceLike;
  if (!candidate.fileName && !candidate.filePath) return null;
  return candidate;
}

function findDebugSource(fiber: ReactFiberLike): DebugSourceLike | null {
  const direct = coerceDebugSource(fiber._debugSource);
  if (direct) return direct;

  const memoizedSource = coerceDebugSource(fiber.memoizedProps?.__source);
  if (memoizedSource) return memoizedSource;

  const ownerSource = coerceDebugSource(fiber._debugOwner?._debugSource);
  if (ownerSource) return ownerSource;

  return null;
}

function isLikelyInternalComponent(name: string): boolean {
  return /^(ForwardRef|Memo|Suspense|Offscreen|Fragment|StrictMode)$/.test(name);
}

function isChainNoise(name: string): boolean {
  if (isLikelyInternalComponent(name)) return true;
  if (name.startsWith('forwardRef(') || name.startsWith('memo(')) return true;
  return /(Provider|Context|Boundary|Router|Handler|Template|Segment|ScrollAndMaybeFocusHandler|LayoutRouter|PanelGroupContext)$/.test(name);
}

function normalizeComponentChain(candidates: FiberCandidate[]): string[] {
  const uniqueCandidates = candidates.filter(
    (candidate, index) => candidates.findIndex((item) => item.name === candidate.name) === index,
  );

  const userFacingCandidates = uniqueCandidates.filter((candidate) => !isChainNoise(candidate.name));
  const preferredCandidates = userFacingCandidates.filter((candidate) => {
    const filePath = candidate.source?.filePath || candidate.source?.fileName;
    return !filePath || !filePath.includes('node_modules');
  });

  const finalCandidates =
    preferredCandidates.length > 0
      ? preferredCandidates
      : userFacingCandidates.length > 0
        ? userFacingCandidates
        : uniqueCandidates;

  return finalCandidates.slice(0, 5).map((candidate) => candidate.name);
}

function scoreCandidate(candidate: FiberCandidate): number {
  let score = 0;
  if (candidate.source?.fileName || candidate.source?.filePath) score += 6;
  if (candidate.source?.fileName && candidate.source.fileName.includes('node_modules')) score -= 4;
  if (candidate.source?.filePath && candidate.source.filePath.includes('node_modules')) score -= 4;
  if (!isLikelyInternalComponent(candidate.name)) score += 2;
  return score;
}

function evaluateConfidence(
  bestCandidate: FiberCandidate,
  componentChain: string[],
): ConfidenceEvaluation {
  const debug: string[] = [];
  const filePath = bestCandidate.source?.filePath || bestCandidate.source?.fileName;
  const line = bestCandidate.source?.lineNumber || bestCandidate.source?.line;
  const column = bestCandidate.source?.columnNumber || bestCandidate.source?.column;
  let score = 0;

  if (bestCandidate.name) {
    score += 1;
    debug.push('component-name');
  }

  if (filePath) {
    score += 2;
    debug.push('source-file');
  } else {
    debug.push('missing-source-file');
  }

  if (line != null) {
    score += 1;
    debug.push('source-line');
  }

  if (column != null) {
    score += 1;
    debug.push('source-column');
  }

  if (filePath && !filePath.includes('node_modules')) {
    score += 2;
    debug.push('user-code-path');
  } else if (filePath) {
    score -= 1;
    debug.push('node-modules-path');
  }

  if (isChainNoise(bestCandidate.name)) {
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

  if (score >= 6) {
    return { confidence: 'high', debug };
  }

  if (score >= 3) {
    return { confidence: 'medium', debug };
  }

  return { confidence: 'low', debug };
}

export const reactSourceLocator: SourceLocatorAdapter = {
  id: 'react',
  canHandle: () => true,
  locate: (element) => {
    const startFiber = getFiberFromElement(element);
    if (!startFiber) return null;

    const candidates: FiberCandidate[] = [];
    let fiber: ReactFiberLike | null | undefined = startFiber;
    let depth = 0;

    while (fiber && depth < 60) {
      const name = getDisplayName(fiber.type) || getDisplayName(fiber.elementType);
      if (name) {
        candidates.push({
          name,
          fiber,
          source: findDebugSource(fiber),
        });
      }
      fiber = fiber.return;
      depth += 1;
    }

    if (candidates.length === 0) return null;

    const bestCandidate = [...candidates].sort((left, right) => scoreCandidate(right) - scoreCandidate(left))[0];
    const source = bestCandidate.source;
    const filePath = source?.filePath || source?.fileName;
    const componentChain = normalizeComponentChain(candidates);
    const confidenceEvaluation = evaluateConfidence(bestCandidate, componentChain);

    const result: SourceLocationResult = {
      framework: 'react',
      componentName: bestCandidate.name,
      displayName: bestCandidate.name,
      filePath,
      line: source?.lineNumber || source?.line,
      column: source?.columnNumber || source?.column,
      componentChain,
      confidence: confidenceEvaluation.confidence,
      debug: confidenceEvaluation.debug,
    };

    return result;
  },
};
