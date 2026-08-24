import { DiffHunksRenderer, type FileDiffMetadata } from '@pierre/diffs';

/**
 * @pierre/diffs throws (and console.error's) when the hunk walk's line
 * indices are missing from the highlight AST. That happens when a windowed
 * plain-text AST is reused for a larger render range, or when the worker
 * cache serves a stale result — see pierre#964 and pierre#1052.
 *
 * Next.js 16 treats that console.error as a blocking overlay even though
 * FileDiff later catches the throw. Swallow the known mismatch, drop the
 * stale render cache, and let the next paint recompute a matching AST.
 */
const PIERRE_NULL_LINE_ERROR =
  'DiffHunksRenderer.processDiffResult: deletionLine and additionLine are null';

const GUARD_MARK = '__atmosPierreNullLineGuard';

type GuardedPrototype = {
  processDiffResult: (this: GuardedPrototype, ...args: unknown[]) => unknown;
  clearRenderCache: () => void;
  onRenderUpdate?: () => void;
} & {
  [GUARD_MARK]?: boolean;
};

function isPierreNullLineError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(PIERRE_NULL_LINE_ERROR);
}

function isPierreNullLineConsoleArg(value: unknown): boolean {
  return typeof value === 'string' && value.includes(PIERRE_NULL_LINE_ERROR);
}

export function primePierreFileDiff(
  pool:
    | { primeDiffHighlightCache: (diff: FileDiffMetadata) => Promise<void> }
    | null
    | undefined,
  fileDiff: FileDiffMetadata,
): void {
  if (pool == null || fileDiff.cacheKey == null) return;
  void pool.primeDiffHighlightCache(fileDiff).catch(() => {});
}

export function installPierreDiffHunksRendererGuard(): void {
  const proto = DiffHunksRenderer.prototype as unknown as GuardedPrototype;
  if (proto[GUARD_MARK]) return;
  proto[GUARD_MARK] = true;

  const original = proto.processDiffResult;
  proto.processDiffResult = function processDiffResultGuarded(...args) {
    const consoleError = console.error.bind(console);
    console.error = ((...msg: unknown[]) => {
      if (isPierreNullLineConsoleArg(msg[0])) return;
      consoleError(...(msg as Parameters<typeof console.error>));
    }) as typeof console.error;

    try {
      return original.apply(this, args);
    } catch (error) {
      if (!isPierreNullLineError(error)) throw error;
      this.clearRenderCache();
      const notify = this.onRenderUpdate;
      if (typeof notify === 'function') {
        queueMicrotask(() => notify());
      }
      return undefined;
    } finally {
      console.error = consoleError;
    }
  };
}

installPierreDiffHunksRendererGuard();
