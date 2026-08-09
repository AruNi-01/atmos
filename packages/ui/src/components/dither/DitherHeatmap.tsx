"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "../../lib/utils";
import { hash, smoothstep, type DitherTheme } from "../../lib/dither/math";
import { useDitherCanvas } from "../../lib/dither/use-dither-canvas";

export type DitherHeatmapCell = {
  /** 0–4 intensity; null = out of year / empty padding */
  level: 0 | 1 | 2 | 3 | 4 | null;
};

export type DitherHeatmapProps = {
  /** Columns of weeks, each 7 day cells. */
  weeks: DitherHeatmapCell[][];
  theme?: DitherTheme;
  className?: string;
  onCellHover?: (weekIndex: number, dayIndex: number, rect: DOMRect) => void;
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

/**
 * Activity heatmap — Amicro ActivityHeatmap (dense dither).
 * Cells grow to fill the canvas so a full-year grid can span the container width.
 */
export function DitherHeatmap({
  weeks,
  theme = "dark",
  className,
  onCellHover,
  onCellLeave,
}: DitherHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const weeksRef = useRef(weeks);
  weeksRef.current = weeks;

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
      if (cols.length === 0 || width < 2 || height < 2) return;

      const weeksCount = cols.length;
      const rows = 7;
      const gap = 2.5;
      const maxCellW = (width - gap * Math.max(0, weeksCount - 1)) / weeksCount;
      const maxCellH = (height - gap * (rows - 1)) / rows;
      // Prefer filling width; height constrains only when the box is too short.
      const cellSize = Math.max(4, Math.min(maxCellW, maxCellH));

      const totalW = weeksCount * cellSize + (weeksCount - 1) * gap;
      const totalH = rows * cellSize + (rows - 1) * gap;
      const startX = (width - totalW) / 2;
      // Top-align so chrome above the chart (year select) sits close to the grid.
      const startY = 0;
      const colors = theme === "dark" ? DARK_COLORS : LIGHT_COLORS;
      const cell = Math.max(2, Math.round(width / 250));
      const tAnim = reducedMotion ? 0 : time;

      for (let w = 0; w < weeksCount; w++) {
        for (let d = 0; d < rows; d++) {
          const level = cols[w]?.[d]?.level;
          const x = startX + w * (cellSize + gap);
          const y = startY + d * (cellSize + gap);

          if (level === null || level === undefined) {
            ctx.fillStyle =
              theme === "dark" ? "rgba(34,197,94,0.06)" : "rgba(22,163,74,0.06)";
            ctx.fillRect(x, y, cellSize, cellSize);
            continue;
          }

          const colorIdx = Math.max(0, Math.min(4, level));
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, cellSize, cellSize);
          ctx.clip();
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = colors[colorIdx]!;

          for (let tx = Math.floor(x); tx <= Math.ceil(x + cellSize); tx += cell) {
            for (let ty = Math.floor(y); ty <= Math.ceil(y + cellSize); ty += cell) {
              const jx = tx + cell / 2;
              const jy = ty + cell / 2;
              const jit = hash(jx, jy);
              const waveRaw =
                Math.sin(jx * 0.05 + tAnim) + Math.sin(jy * 0.05 + tAnim * 0.7);
              const mod = smoothstep(-1.5, 1.5, waveRaw);
              const sz = cell * (0.4 + 0.4 * mod) * (0.8 + 0.4 * jit);
              ctx.fillRect(tx + (cell - sz) / 2, ty + (cell - sz) / 2, sz, sz);
            }
          }
          ctx.restore();
        }
      }
    },
    [theme],
  );

  useDitherCanvas(canvasRef, draw, [weeks, theme]);

  const handlePointer = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!onCellHover) return;
    const cols = weeksRef.current;
    if (cols.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const ly = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;
    const weeksCount = cols.length;
    const rows = 7;
    const gap = 2.5;
    const maxCellW = (width - gap * Math.max(0, weeksCount - 1)) / weeksCount;
    const maxCellH = (height - gap * (rows - 1)) / rows;
    const cellSize = Math.max(4, Math.min(maxCellW, maxCellH));
    const totalW = weeksCount * cellSize + (weeksCount - 1) * gap;
    const totalH = rows * cellSize + (rows - 1) * gap;
    const startX = (width - totalW) / 2;
    const startY = 0;
    const wi = Math.floor((lx - startX) / (cellSize + gap));
    const di = Math.floor((ly - startY) / (cellSize + gap));
    if (wi < 0 || di < 0 || wi >= weeksCount || di >= rows) {
      onCellLeave?.();
      return;
    }
    const cellRect = new DOMRect(
      rect.left + startX + wi * (cellSize + gap),
      rect.top + startY + di * (cellSize + gap),
      cellSize,
      cellSize,
    );
    onCellHover(wi, di, cellRect);
  };

  return (
    <canvas
      ref={canvasRef}
      className={cn("block h-full w-full touch-none", className)}
      onPointerMove={handlePointer}
      onPointerLeave={() => onCellLeave?.()}
      role="img"
      aria-label="Activity heatmap"
    />
  );
}
