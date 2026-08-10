"use client";

import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "../../lib/utils";
import { hash, smoothstep, type DitherTheme } from "../../lib/dither/math";
import {
  createSeriesMorph,
  seriesSignature,
  type SeriesMorph,
} from "../../lib/dither/morph";
import { useDitherCanvas } from "../../lib/dither/use-dither-canvas";

export type DitherHeatmapCell = {
  /** 0–4 intensity; null = out of year / empty padding */
  level: 0 | 1 | 2 | 3 | 4 | null;
};

export type DitherHeatmapMonthLabel = {
  label: string;
  /** Column index (week) where this month first appears. */
  weekIndex: number;
};

export type DitherHeatmapWeekdayLabel = {
  label: string;
  /** Row index 0–6 (Sun→Sat when week starts on Sunday). */
  row: number;
};

export type DitherHeatmapHoverInfo = {
  weekIndex: number;
  dayIndex: number;
  /** Cell bounds in viewport coords (for anchoring if needed). */
  cellRect: DOMRect;
  /** Live pointer position — prefer this for smooth tooltip tracking. */
  clientX: number;
  clientY: number;
};

export type DitherHeatmapProps = {
  /** Columns of weeks, each 7 day cells. */
  weeks: DitherHeatmapCell[][];
  theme?: DitherTheme;
  className?: string;
  /** Month names along the top (x-axis). */
  monthLabels?: DitherHeatmapMonthLabel[];
  /** Weekday names along the left (y-axis). Empty label = skip row. */
  weekdayLabels?: DitherHeatmapWeekdayLabel[];
  onCellHover?: (info: DitherHeatmapHoverInfo) => void;
  onCellLeave?: () => void;
};

/** GitHub-style greens — level 0 empty-ish → 4 max activity. */
const DARK_COLORS = [
  "rgba(34,197,94,0.18)",
  "rgba(34,197,94,0.38)",
  "rgba(34,197,94,0.58)",
  "rgba(74,222,128,0.82)",
  "#4ADE80",
] as const;

const LIGHT_COLORS = [
  "rgba(22,163,74,0.14)",
  "rgba(22,163,74,0.32)",
  "rgba(22,163,74,0.52)",
  "rgba(22,163,74,0.72)",
  "#15803D",
] as const;

const ROWS = 7;
const GAP = 2.5;
const PAD_L_BASE = 4;
const PAD_T_BASE = 2;
const PAD_R = 4;
const PAD_B = 2;
const MONTH_LABEL_H = 14;
const WEEKDAY_LABEL_W = 28;

/** Flatten week×day levels; null → -1 so morph can fade empty cells. */
function flattenLevels(weeks: DitherHeatmapCell[][]): number[] {
  const out: number[] = [];
  for (const col of weeks) {
    for (let d = 0; d < ROWS; d++) {
      const level = col[d]?.level;
      out.push(level === null || level === undefined ? -1 : level);
    }
  }
  return out;
}

type GridLayout = {
  cellSize: number;
  startX: number;
  startY: number;
  padL: number;
  padT: number;
  weeksCount: number;
};

function computeLayout(
  width: number,
  height: number,
  weeksCount: number,
  hasMonthLabels: boolean,
  hasWeekdayLabels: boolean,
): GridLayout | null {
  if (weeksCount <= 0 || width < 2 || height < 2) return null;

  const padL = hasWeekdayLabels ? WEEKDAY_LABEL_W : PAD_L_BASE;
  const padT = hasMonthLabels ? MONTH_LABEL_H : PAD_T_BASE;
  const plotW = Math.max(1, width - padL - PAD_R);
  const plotH = Math.max(1, height - padT - PAD_B);
  const maxCellW = (plotW - GAP * Math.max(0, weeksCount - 1)) / weeksCount;
  const maxCellH = (plotH - GAP * (ROWS - 1)) / ROWS;
  const cellSize = Math.max(4, Math.min(maxCellW, maxCellH));
  const totalW = weeksCount * cellSize + (weeksCount - 1) * GAP;
  // Left-align grid after weekday gutter so months track week columns.
  const startX = padL + Math.max(0, (plotW - totalW) / 2);
  const startY = padT;

  return { cellSize, startX, startY, padL, padT, weeksCount };
}

/**
 * Activity heatmap — Amicro ActivityHeatmap (dense dither).
 * Optional month (x) and weekday (y) axis labels.
 */
export function DitherHeatmap({
  weeks,
  theme = "dark",
  className,
  monthLabels,
  weekdayLabels,
  onCellHover,
  onCellLeave,
}: DitherHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const weeksRef = useRef(weeks);
  weeksRef.current = weeks;
  const monthLabelsRef = useRef(monthLabels);
  monthLabelsRef.current = monthLabels;
  const weekdayLabelsRef = useRef(weekdayLabels);
  weekdayLabelsRef.current = weekdayLabels;
  const morphRef = useRef<SeriesMorph | null>(null);
  if (!morphRef.current) morphRef.current = createSeriesMorph();
  const sigRef = useRef("");

  // Mask of empty padding cells (true = null / out of year).
  const nullMaskRef = useRef<boolean[]>([]);
  const layoutRef = useRef<GridLayout | null>(null);

  // Retarget during render so the first paint already has morph state (ref-only).
  const weeksKey = `${weeks.length}:${seriesSignature(flattenLevels(weeks))}`;
  if (sigRef.current !== weeksKey) {
    // Map -1 → 0 for morph domain; keep a mask for true-null cells separately.
    const levels = flattenLevels(weeks);
    const flat = levels.map((v) => (v < 0 ? 0 : v));
    const prevLen = morphRef.current.current().length;
    // Year switch can change week count — grow-in rather than pad-misalign.
    if (prevLen > 0 && prevLen !== flat.length) {
      morphRef.current.retargetEnter(flat);
    } else {
      morphRef.current.retarget(flat);
    }
    nullMaskRef.current = levels.map((v) => v < 0);
    sigRef.current = weeksKey;
  }

  const draw = useCallback(
    ({
      ctx,
      width,
      height,
      time,
      reducedMotion,
    }: {
      ctx: CanvasRenderingContext2D;
      width: number;
      height: number;
      time: number;
      reducedMotion: boolean;
    }) => {
      const cols = weeksRef.current;
      const months = monthLabelsRef.current;
      const weekdays = weekdayLabelsRef.current;
      if (cols.length === 0 || width < 2 || height < 2) return;

      const layout = computeLayout(
        width,
        height,
        cols.length,
        !!months?.length,
        !!weekdays?.length,
      );
      if (!layout) return;
      layoutRef.current = layout;

      const { cellSize, startX, startY, weeksCount } = layout;
      const colors = theme === "dark" ? DARK_COLORS : LIGHT_COLORS;
      const cell = Math.max(2, Math.round(width / 250));
      const tAnim = reducedMotion ? 0 : time;
      const levels = morphRef.current!.sample(reducedMotion);
      const nullMask = nullMaskRef.current;
      const axisMuted =
        theme === "dark" ? "rgba(255,255,255,0.42)" : "rgba(15,23,42,0.45)";

      // --- Axis labels (month top, weekday left) ---
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = axisMuted;
      ctx.globalAlpha = 1;

      if (months?.length) {
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        // Skip labels that would collide when two months start close together.
        let lastLabelX = -Infinity;
        const minMonthGap = 26;
        for (const month of months) {
          if (month.weekIndex < 0 || month.weekIndex >= weeksCount) continue;
          const x = startX + month.weekIndex * (cellSize + GAP);
          if (x - lastLabelX < minMonthGap) continue;
          ctx.fillText(month.label, x, 1);
          lastLabelX = x;
        }
      }

      if (weekdays?.length) {
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        for (const day of weekdays) {
          if (!day.label || day.row < 0 || day.row >= ROWS) continue;
          const y = startY + day.row * (cellSize + GAP) + cellSize / 2;
          ctx.fillText(day.label, startX - 6, y);
        }
      }

      // --- Cells ---
      for (let w = 0; w < weeksCount; w++) {
        for (let d = 0; d < ROWS; d++) {
          const idx = w * ROWS + d;
          const x = startX + w * (cellSize + GAP);
          const y = startY + d * (cellSize + GAP);
          const isNull = nullMask[idx] ?? cols[w]?.[d]?.level == null;

          if (isNull) {
            ctx.fillStyle =
              theme === "dark" ? "rgba(34,197,94,0.06)" : "rgba(22,163,74,0.06)";
            ctx.fillRect(x, y, cellSize, cellSize);
            continue;
          }

          const rawLevel = levels[idx] ?? 0;
          const level = Math.max(0, Math.min(4, rawLevel));
          // Blend between discrete palette steps for smooth intensity morph.
          const lo = Math.floor(level);
          const hi = Math.min(4, lo + 1);
          const frac = level - lo;
          const colorIdx = frac < 0.5 ? lo : hi;
          // Soften alpha during fractional morph for a fade between bands.
          const alphaBoost = 0.75 + (1 - Math.abs(frac - 0.5) * 2) * 0.1;

          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, cellSize, cellSize);
          ctx.clip();
          ctx.globalAlpha = 0.85 * Math.min(1, alphaBoost);
          ctx.fillStyle = colors[colorIdx as 0 | 1 | 2 | 3 | 4]!;

          for (let tx = Math.floor(x); tx <= Math.ceil(x + cellSize); tx += cell) {
            for (let ty = Math.floor(y); ty <= Math.ceil(y + cellSize); ty += cell) {
              const jx = tx + cell / 2;
              const jy = ty + cell / 2;
              const jit = hash(jx, jy);
              const waveRaw =
                Math.sin(jx * 0.05 + tAnim) + Math.sin(jy * 0.05 + tAnim * 0.7);
              const mod = smoothstep(-1.5, 1.5, waveRaw);
              // Density scales with continuous level so low→high fills grow.
              const density = 0.35 + 0.15 * (level / 4);
              const sz = cell * (density + 0.4 * mod) * (0.8 + 0.4 * jit);
              ctx.fillRect(tx + (cell - sz) / 2, ty + (cell - sz) / 2, sz, sz);
            }
          }
          ctx.restore();
        }
      }
    },
    [theme],
  );

  useDitherCanvas(canvasRef, draw);

  const lastCellRef = useRef<{ w: number; d: number } | null>(null);

  const handlePointer = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!onCellHover) return;
    const cols = weeksRef.current;
    if (cols.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const ly = e.clientY - rect.top;
    const layout =
      layoutRef.current ??
      computeLayout(
        rect.width,
        rect.height,
        cols.length,
        !!monthLabelsRef.current?.length,
        !!weekdayLabelsRef.current?.length,
      );
    if (!layout) {
      lastCellRef.current = null;
      onCellLeave?.();
      return;
    }
    const { cellSize, startX, startY, weeksCount } = layout;
    const step = cellSize + GAP;
    // Snap to nearest cell while still over the grid so gaps don't flicker the tip off.
    let wi = Math.floor((lx - startX) / step);
    let di = Math.floor((ly - startY) / step);
    wi = Math.max(0, Math.min(weeksCount - 1, wi));
    di = Math.max(0, Math.min(ROWS - 1, di));

    const gridRight = startX + weeksCount * step - GAP;
    const gridBottom = startY + ROWS * step - GAP;
    const outside =
      lx < startX - GAP ||
      ly < startY - GAP ||
      lx > gridRight + GAP ||
      ly > gridBottom + GAP;
    if (outside) {
      lastCellRef.current = null;
      onCellLeave?.();
      return;
    }

    const cellRect = new DOMRect(
      rect.left + startX + wi * step,
      rect.top + startY + di * step,
      cellSize,
      cellSize,
    );
    lastCellRef.current = { w: wi, d: di };
    onCellHover({
      weekIndex: wi,
      dayIndex: di,
      cellRect,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  };

  return (
    <canvas
      ref={canvasRef}
      className={cn("block h-full w-full touch-none", className)}
      onPointerMove={handlePointer}
      onPointerLeave={() => {
        lastCellRef.current = null;
        onCellLeave?.();
      }}
      role="img"
      aria-label="Activity heatmap"
    />
  );
}
