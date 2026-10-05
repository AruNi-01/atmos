/** Same clock as the metric numerals, so a Tokens/Cost or Agent/Model switch lands together. */
export const METRIC_TWEEN_MS = 480;

/** Strong ease-out. Matches `Easing.bezier(0.23, 1, 0.32, 1)`. */
export function metricEase(t: number) {
  const clamped = Math.min(1, Math.max(0, t));
  return bezierY(clamped, 0.23, 1, 0.32, 1);
}

function bezierY(t: number, x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u;
  const sampleDX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  let u = t;
  for (let step = 0; step < 6; step += 1) {
    const dx = sampleDX(u);
    if (Math.abs(dx) < 1e-6) break;
    u -= (sampleX(u) - t) / dx;
  }
  return sampleY(Math.min(1, Math.max(0, u)));
}

function peakOf(rows: number[][]) {
  let peak = 0;
  for (const row of rows) {
    let sum = 0;
    for (const value of row) sum += value;
    if (sum > peak) peak = sum;
  }
  return Math.max(1, peak);
}

/**
 * Blend two shapes in normalized space, then place the blend on the target scale.
 * Tokens and cost do not share a unit, so lerping the raw numbers would pin the
 * chart to the larger scale until the last frames.
 */
export function morphSeries(from: number[][], to: number[][], t: number) {
  if (t >= 1) return to;
  const fromPeak = peakOf(from);
  const toPeak = peakOf(to);
  const eased = metricEase(t);
  const rows = Math.max(from.length, to.length);
  const out: number[][] = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const left = from[rowIndex] ?? [];
    const right = to[rowIndex] ?? [];
    const width = Math.max(left.length, right.length);
    const row: number[] = [];
    for (let column = 0; column < width; column += 1) {
      const start = ((left[column] ?? 0) / fromPeak) * toPeak;
      const end = right[column] ?? 0;
      row.push(start + (end - start) * eased);
    }
    out.push(row);
  }
  return out;
}
