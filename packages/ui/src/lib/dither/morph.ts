/**
 * Shared value-morph helpers for dither charts.
 * Timed ease-out matches Amicro / DitherFunnel (~480ms).
 */

export const DITHER_MORPH_MS = 560;

/** Cubic ease-out — Amicro stacked/growth period morph. */
export function ditherMorphEase(t: number): number {
  const p = Math.max(0, Math.min(1, t));
  const inv = 1 - p;
  return 1 - inv * inv * inv;
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
 * Resample `from` onto `toLength` by x-position (Amicro DitherGrowthChart).
 * Month↔day (and 7D↔90D) keep the previous silhouette instead of growing
 * every new index from 0.
 */
export function remapSeriesLength(
  from: readonly number[],
  toLength: number,
): number[] {
  if (toLength <= 0) return [];
  if (from.length === 0) return Array.from({ length: toLength }, () => 0);
  if (from.length === toLength) return from.slice();
  if (toLength === 1) return [from[from.length - 1] ?? 0];
  if (from.length === 1) return Array.from({ length: toLength }, () => from[0] ?? 0);
  return Array.from({ length: toLength }, (_, i) => {
    const t = i / (toLength - 1);
    const idx = t * (from.length - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, from.length - 1);
    return lerp(from[i0] ?? 0, from[i1] ?? 0, idx - i0);
  });
}

function seriesPeak(values: readonly number[]): number {
  let peak = 0;
  for (const v of values) {
    if (Number.isFinite(v)) peak = Math.max(peak, Math.abs(v));
  }
  return peak;
}

/** Put `from` into `to`'s amplitude so the silhouette morphs at the new scale. */
export function rescaleSeriesToPeak(
  from: readonly number[],
  to: readonly number[],
): number[] {
  const fromPeak = seriesPeak(from);
  const toPeak = seriesPeak(to);
  if (fromPeak === 0 || toPeak === 0) return from.slice();
  const scale = toPeak / fromPeak;
  return from.map((v) => v * scale);
}

function remapGrid(
  from: readonly (readonly number[])[],
  to: readonly (readonly number[])[],
): number[][] {
  if (to.length === 0) return [];
  if (from.length === 0) return to.map((row) => row.map(() => 0));
  return to.map((toRow, i) => {
    const barT = to.length === 1 ? 0 : i / (to.length - 1);
    const fromBar = barT * Math.max(0, from.length - 1);
    const b0 = Math.floor(fromBar);
    const b1 = Math.min(b0 + 1, from.length - 1);
    const barFrac = fromBar - b0;
    const row0 = from[b0] ?? [];
    const row1 = from[b1] ?? row0;
    return toRow.map((_, j) => {
      const segT = toRow.length === 1 ? 0 : j / Math.max(1, toRow.length - 1);
      return lerp(sampleSeries(row0, segT), sampleSeries(row1, segT), barFrac);
    });
  });
}

function sampleSeries(series: readonly number[], t: number): number {
  if (series.length === 0) return 0;
  if (series.length === 1) return series[0] ?? 0;
  const idx = t * (series.length - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(i0 + 1, series.length - 1);
  return lerp(series[i0] ?? 0, series[i1] ?? 0, idx - i0);
}

/**
 * Peak ratio above which index-aligned morph is treated as a unit/scale jump
 * (e.g. token counts ↔ USD). Cross-scale morph keeps similar *shapes* (axis
 * normalizes) while labels already use the new unit — so axes flash "$XM"
 * and the chart appears not to change.
 */
export const SERIES_SCALE_ENTER_RATIO = 20;

/** True when series peaks differ by ~an order of magnitude or more. */
export function seriesScaleDiscontinuity(
  from: readonly number[],
  to: readonly number[],
  ratioThreshold = SERIES_SCALE_ENTER_RATIO,
): boolean {
  if (from.length === 0 || to.length === 0) return false;
  let fromMax = 0;
  let toMax = 0;
  for (const v of from) {
    if (Number.isFinite(v)) fromMax = Math.max(fromMax, Math.abs(v));
  }
  for (const v of to) {
    if (Number.isFinite(v)) toMax = Math.max(toMax, Math.abs(v));
  }
  if (fromMax === 0 && toMax === 0) return false;
  if (fromMax === 0 || toMax === 0) return true;
  const ratio = toMax / fromMax;
  return ratio >= ratioThreshold || ratio <= 1 / ratioThreshold;
}

/**
 * Mutable morph state for a flat number series.
 * Call `retarget(next)` when data changes; `sample(reducedMotion)` each draw frame.
 */
export type SeriesMorph = {
  /**
   * Morph toward `next`. Same-length series interpolate mid-animation;
   * length changes grow new indices from 0 / drop extras.
   * Large scale jumps (tokens ↔ cost) force grow-in instead.
   */
  retarget: (next: readonly number[]) => void;
  /**
   * Force grow-in from zero (use when structure/semantics change so
   * index-aligned morph would look wrong — e.g. agent→model segments).
   */
  retargetEnter: (next: readonly number[]) => void;
  /** Start a morph from an explicit series (already remapped / rescaled). */
  retargetFrom: (from: readonly number[], next: readonly number[]) => void;
  sample: (reducedMotion: boolean) => number[];
  /** Last sampled values (mid-animation capture uses this). */
  current: () => number[];
  /** Eased 0–1 progress of the active morph (for axis / label lerps). */
  progress: (reducedMotion: boolean) => number;
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
      const lengthChanged = current.length !== to.length;
      let fromAligned = lengthChanged
        ? remapSeriesLength(current, to.length)
        : alignSeries(current, to);
      // Tokens↔cost (and any huge unit jump): keep relative heights, put them
      // on the new amplitude, then lerp. Do not grow from zero — that either
      // pops from the baseline or, if the axis eases too, looks like no motion.
      if (seriesScaleDiscontinuity(fromAligned, to)) {
        fromAligned = rescaleSeriesToPeak(fromAligned, to);
      }
      begin(to, fromAligned);
    },
    retargetEnter(next) {
      const to = next.map((v) => Math.max(0, Number.isFinite(v) ? v : 0));
      begin(to, to.map(() => 0));
    },
    retargetFrom(fromVals, next) {
      const to = next.map((v) => Math.max(0, Number.isFinite(v) ? v : 0));
      let fromA = fromVals.map((v) => Math.max(0, Number.isFinite(v) ? v : 0));
      if (fromA.length !== to.length) {
        fromA = remapSeriesLength(fromA, to.length);
      }
      if (seriesScaleDiscontinuity(fromA, to)) {
        fromA = rescaleSeriesToPeak(fromA, to);
      }
      begin(to, fromA);
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
    progress(reducedMotion) {
      return reducedMotion
        ? 1
        : ditherMorphEase(ditherMorphProgress(startMs, reducedMotion));
    },
  };
}

/**
 * Morph a 2D grid of non-negative numbers (e.g. stacked bar segments).
 * Same shape → index-aligned morph. Shape change → grow-in from zero
 * (avoids scrambled flat-array alignment across agent/model switches).
 */
export type GridMorph = {
  retarget: (next: readonly (readonly number[])[]) => void;
  /** Force grow-in from zero regardless of shape (e.g. tokens↔cost). */
  retargetEnter: (next: readonly (readonly number[])[]) => void;
  sample: (reducedMotion: boolean) => number[][];
  progress: (reducedMotion: boolean) => number;
};

export function createGridMorph(
  initial: readonly (readonly number[])[] = [],
): GridMorph {
  const flat = createSeriesMorph(flattenGrid(initial));
  let rowLens: number[] = initial.map((row) => row.length);
  let rowCount = initial.length;
  let shapeKey = shapeSignature(initial);

  const applyShape = (next: readonly (readonly number[])[]) => {
    rowCount = next.length;
    rowLens = next.map((row) => row.length);
    shapeKey = shapeSignature(next);
  };

  return {
    retarget(next) {
      const nextShape = shapeSignature(next);
      const values = flattenGrid(next);
      if (nextShape !== shapeKey && rowCount > 0) {
        const remapped = remapGrid(
          unflattenGrid(flat.current(), rowCount, rowLens),
          next,
        );
        applyShape(next);
        flat.retargetFrom(flattenGrid(remapped), values);
      } else {
        applyShape(next);
        flat.retarget(values);
      }
    },
    retargetEnter(next) {
      applyShape(next);
      flat.retargetEnter(flattenGrid(next));
    },
    sample(reducedMotion) {
      const values = flat.sample(reducedMotion);
      return unflattenGrid(values, rowCount, rowLens);
    },
    progress(reducedMotion) {
      return flat.progress(reducedMotion);
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
