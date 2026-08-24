import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_RENDER_RANGE,
  DEFAULT_THEMES,
  DiffHunksRenderer,
  parseDiffFromFile,
} from '@pierre/diffs';
import {
  installPierreDiffHunksRendererGuard,
  primePierreFileDiff,
} from './pierre-diff-hunks-guard';

const PIERRE_NULL_LINE_ERROR =
  'DiffHunksRenderer.processDiffResult: deletionLine and additionLine are null';

type ProcessDiffResult = (
  this: DiffHunksRenderer,
  ...args: unknown[]
) => unknown;

function processDiffResult(
  renderer: DiffHunksRenderer,
  ...args: unknown[]
): unknown {
  const proto = DiffHunksRenderer.prototype as unknown as {
    processDiffResult: ProcessDiffResult;
  };
  return proto.processDiffResult.apply(renderer, args);
}

function sampleDiff() {
  return parseDiffFromFile(
    { name: 'rpc.rs', contents: '', cacheKey: 'rpc-old' },
    {
      name: 'rpc.rs',
      contents: 'pub fn rpc() {}\n',
      cacheKey: 'rpc-new',
    },
  );
}

function emptyHighlightResult() {
  return {
    code: { additionLines: [], deletionLines: [] },
    themeStyles: {},
    baseThemeType: 'light' as const,
  };
}

describe('pierre DiffHunksRenderer null-line guard', () => {
  test('recovers from a stale highlight AST without throwing or logging', () => {
    const originalConsoleError = console.error;
    installPierreDiffHunksRendererGuard();
    const errors: unknown[][] = [];
    console.error = ((...msg: unknown[]) => {
      errors.push(msg);
    }) as typeof console.error;

    try {
      const renderer = new DiffHunksRenderer({
        theme: DEFAULT_THEMES,
        diffStyle: 'unified',
      });
      expect(
        processDiffResult(
          renderer,
          sampleDiff(),
          DEFAULT_RENDER_RANGE,
          emptyHighlightResult(),
        ),
      ).toBeUndefined();
      expect(
        errors.some(
          (msg) =>
            typeof msg[0] === 'string' &&
            msg[0].includes(PIERRE_NULL_LINE_ERROR),
        ),
      ).toBe(false);
    } finally {
      console.error = originalConsoleError;
    }
  });

  test('primePierreFileDiff no-ops without a pool and swallows prime failures', async () => {
    primePierreFileDiff(undefined, sampleDiff());
    let called = false;
    primePierreFileDiff(
      {
        primeDiffHighlightCache: async () => {
          called = true;
          throw new Error('pool not ready');
        },
      },
      sampleDiff(),
    );
    await Promise.resolve();
    expect(called).toBe(true);
  });
});
