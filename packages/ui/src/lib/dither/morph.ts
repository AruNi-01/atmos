/**
 * Shared value-morph helpers for dither charts.
 * Timed ease-out matches Amicro / DitherFunnel (~480ms).
 */

export const DITHER_MORPH_MS = 480;

/** Exponential ease-out (same curve as DitherFunnel). */
export function ditherMorphEase(t: number): number {
  const p = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(2, -10 * p);
}

export function ditherMorphProgress(
  startMs: number,
  reducedMotion: boolean,
  durationMs = DITHER_MORPH_MS,
): number {
  if (reducedMotion) return 1;
  if (durationMs <= 0) return 1;
  return Math.min(1, (performance.now() - startMs) / durationMs);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Pad with 0 / truncate so `from` matches `to.length`. */
export function alignSeries(from: readonly number[], to: readonly number[]): number[] {
  if (from.length === to.length) return from.slice();
  return to.map((_, i) => from[i] ?? 0);
}

/**
 * Mutable morph state for a flat number series.
 * Call `retarget(next)` when data changes; `sample(reducedMotion)` each draw frame.
 */
export type SeriesMorph = {
  /**
   * Morph toward `next`. Same-length series interpolate mid-animation;
   * length changes grow new indices from 0 / drop extras.
   */
  retarget: (next: readonly number[]) => void;
  /**
   * Force grow-in from zero (use when structure/semantics change so
   * index-aligned morph would look wrong — e.g. agent→model segments).
   */
  retargetEnter: (next: readonly number[]) => void;
  sample: (reducedMotion: boolean) => number[];
  /** Last sampled values (mid-animation capture uses this). */
  current: () => number[];
};

export function createSeriesMorph(initial: readonly number[] = []): SeriesMorph {
  let from = initial.map((v) => Math.max(0, v));
  let target = from.slice();
  let current = from.slice();
  let startMs = 0;
  let hasRetargeted = false;

  const begin = (to: number[], fromValues: number[]) => {
    from = fromValues;
    target = to;
    current = from.slice();
    startMs = performance.now();
    hasRetargeted = true;
  };

  return {
    retarget(next) {
      const to = next.map((v) => Math.max(0, Number.isFinite(v) ? v : 0));
      if (!hasRetargeted) {
        // First target: grow in from zero (echarts-style enter).
        begin(to, to.map(() => 0));
        return;
      }
      // Capture mid-animation position so rapid tab switches stay smooth.
      begin(to, alignSeries(current, to));
    },
    retargetEnter(next) {
      const to = next.map((v) => Math.max(0, Number.isFinite(v) ? v : 0));
      begin(to, to.map(() => 0));
    },
    sample(reducedMotion) {
      if (target.length === 0) {
        current = [];
        return current;
      }
      if (from.length !== target.length) {
        from = alignSeries(from, target);
      }
      const prog = ditherMorphProgress(startMs, reducedMotion);
      const ease = reducedMotion ? 1 : ditherMorphEase(prog);
      current = target.map((t, i) => lerp(from[i] ?? 0, t, ease));
      return current;
    },
    current: () => current,
  };
}

/**
 * Morph a 2D grid of non-negative numbers (e.g. stacked bar segments).
 * Same shape → index-aligned morph. Shape change → grow-in from zero
 * (avoids scrambled flat-array alignment across agent/model switches).
 */
export type GridMorph = {
  retarget: (next: readonly (readonly number[])[]) => void;
  sample: (reducedMotion: boolean) => number[][];
};

export function createGridMorph(
  initial: readonly (readonly number[])[] = [],
): GridMorph {
  const flat = createSeriesMorph(flattenGrid(initial));
  let rowLens: number[] = initial.map((row) => row.length);
  let rowCount = initial.length;
  let shapeKey = shapeSignature(initial);

  return {
    retarget(next) {
      const nextShape = shapeSignature(next);
      rowCount = next.length;
      rowLens = next.map((row) => row.length);
      const values = flattenGrid(next);
      if (nextShape !== shapeKey) {
        shapeKey = nextShape;
        flat.retargetEnter(values);
      } else {
        flat.retarget(values);
      }
    },
    sample(reducedMotion) {
      const values = flat.sample(reducedMotion);
      return unflattenGrid(values, rowCount, rowLens);
    },
  };
}

function shapeSignature(grid: readonly (readonly number[])[]): string {
  return `${grid.length}:${grid.map((row) => row.length).join(",")}`;
}

function flattenGrid(grid: readonly (readonly number[])[]): number[] {
  const out: number[] = [];
  for (const row of grid) {
    for (const v of row) out.push(Math.max(0, v));
  }
  return out;
}

function unflattenGrid(
  values: readonly number[],
  rowCount: number,
  rowLens: readonly number[],
): number[][] {
  const out: number[][] = [];
  let offset = 0;
  for (let r = 0; r < rowCount; r++) {
    const len = rowLens[r] ?? 0;
    const row: number[] = [];
    for (let c = 0; c < len; c++) {
      row.push(values[offset + c] ?? 0);
    }
    offset += len;
    out.push(row);
  }
  return out;
}

/**
 * Signature helpers — stable enough to skip no-op retargets.
 */
export function seriesSignature(values: readonly number[]): string {
  return values.map((v) => (Number.isFinite(v) ? String(v) : "0")).join(",");
}

export function gridSignature(grid: readonly (readonly number[])[]): string {
  return grid.map((row) => seriesSignature(row)).join("|");
}
