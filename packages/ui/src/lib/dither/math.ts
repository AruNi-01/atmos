/** Ordered-dither / micro-chart math helpers.
 *
 * Adapted from Amicro simple-comp dither charts
 * (https://github.com/Subhan-code/Amicro--Micro-transitions-, MIT).
 */

export function smoothstep(min: number, max: number, value: number): number {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Deterministic 0..1 noise for ordered dither sampling. */
export function hash(x: number, y: number): number {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  if (normalized.length !== 6) {
    return `rgba(255, 255, 255, ${alpha})`;
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function niceAxisMax(maxVal: number): number {
  if (maxVal <= 0) return 100;
  const target = maxVal * 1.08;
  const power = 10 ** Math.floor(Math.log10(target));
  const normalized = target / power;
  let multiplier = 10;
  if (normalized <= 1) multiplier = 1;
  else if (normalized <= 2) multiplier = 2;
  else if (normalized <= 5) multiplier = 5;
  return multiplier * power;
}

export type DitherTheme = "dark" | "light";

export function ditherInk(theme: DitherTheme, alpha = 1): string {
  return theme === "dark"
    ? `rgba(255, 255, 255, ${alpha})`
    : `rgba(15, 15, 15, ${alpha})`;
}

export function ditherGrid(theme: DitherTheme): string {
  return theme === "dark"
    ? "rgba(255, 255, 255, 0.035)"
    : "rgba(0, 0, 0, 0.04)";
}

/** 5-level green intensity palette for heatmaps (0 empty → 4 max). */
export function heatmapLevelColor(level: 0 | 1 | 2 | 3 | 4, theme: DitherTheme): string {
  if (theme === "dark") {
    const map = [
      "rgba(34,197,94,0.08)",
      "rgba(34,197,94,0.22)",
      "rgba(34,197,94,0.42)",
      "rgba(74,222,128,0.72)",
      "#4ADE80",
    ] as const;
    return map[level];
  }
  const map = [
    "rgba(22,163,74,0.08)",
    "rgba(22,163,74,0.2)",
    "rgba(22,163,74,0.38)",
    "rgba(22,163,74,0.62)",
    "#15803D",
  ] as const;
  return map[level];
}

export const DITHER_BAND_COLORS_DARK = [
  "#FFFFFF",
  "#E2E8F0",
  "#CBD5E1",
  "#94A3B8",
  "#64748B",
  "#475569",
] as const;

export const DITHER_BAND_COLORS_LIGHT = [
  "#0F172A",
  "#1E293B",
  "#334155",
  "#475569",
  "#64748B",
  "#94A3B8",
] as const;

export function bandColor(index: number, theme: DitherTheme): string {
  const palette = theme === "dark" ? DITHER_BAND_COLORS_DARK : DITHER_BAND_COLORS_LIGHT;
  return palette[index % palette.length]!;
}

/** Rounded stacked-bar path (Amicro DitherStackedChart). */
export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rTop: number,
  rBottom: number,
): void {
  const rt = Math.min(rTop, w / 2, Math.max(0, h));
  const rb = Math.min(rBottom, w / 2, Math.max(0, h));
  ctx.beginPath();
  ctx.moveTo(x + rt, y);
  ctx.lineTo(x + w - rt, y);
  ctx.arcTo(x + w, y, x + w, y + rt, rt);
  ctx.lineTo(x + w, y + h - rb);
  ctx.arcTo(x + w, y + h, x + w - rb, y + h, rb);
  ctx.lineTo(x + rb, y + h);
  ctx.arcTo(x, y + h, x, y + h - rb, rb);
  ctx.lineTo(x, y + rt);
  ctx.arcTo(x, y, x + rt, y, rt);
  ctx.closePath();
}

/**
 * Rounded donut wedge path (Amicro DitherDonutChart).
 * Call after ctx.beginPath().
 */
export function drawRoundedWedge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rIn: number,
  rOut: number,
  aStart: number,
  aEnd: number,
  cr: number,
): void {
  const sweep = aEnd - aStart;
  const maxCr = Math.min(cr, (rOut - rIn) / 2, (sweep * rIn) / 2);
  if (sweep <= 0.001) return;
  const crIn = maxCr;
  const crOut = maxCr;

  const aStartIn = aStart + crIn / rIn;
  const aEndIn = aEnd - crIn / rIn;
  const aStartOut = aStart + crOut / rOut;
  const aEndOut = aEnd - crOut / rOut;

  ctx.moveTo(cx + rIn * Math.cos(aStartIn), cy + rIn * Math.sin(aStartIn));
  ctx.arc(cx, cy, rIn, aStartIn, aEndIn);
  ctx.arcTo(
    cx + rIn * Math.cos(aEnd),
    cy + rIn * Math.sin(aEnd),
    cx + rOut * Math.cos(aEnd),
    cy + rOut * Math.sin(aEnd),
    crIn,
  );
  ctx.arcTo(
    cx + rOut * Math.cos(aEnd),
    cy + rOut * Math.sin(aEnd),
    cx + rOut * Math.cos(aEndOut),
    cy + rOut * Math.sin(aEndOut),
    crOut,
  );
  ctx.arc(cx, cy, rOut, aEndOut, aStartOut, true);
  ctx.arcTo(
    cx + rOut * Math.cos(aStart),
    cy + rOut * Math.sin(aStart),
    cx + rIn * Math.cos(aStart),
    cy + rIn * Math.sin(aStart),
    crOut,
  );
  ctx.arcTo(
    cx + rIn * Math.cos(aStart),
    cy + rIn * Math.sin(aStart),
    cx + rIn * Math.cos(aStartIn),
    cy + rIn * Math.sin(aStartIn),
    crIn,
  );
}
