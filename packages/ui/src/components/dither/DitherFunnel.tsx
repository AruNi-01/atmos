"use client";

import { useCallback, useEffect, useRef } from "react";
import { cn } from "../../lib/utils";
import {
  bandColor,
  hash,
  smoothstep,
  type DitherTheme,
} from "../../lib/dither/math";
import { useDitherCanvas } from "../../lib/dither/use-dither-canvas";

export type DitherFunnelStage = {
  label: string;
  /** Absolute or relative value — width is value / maxValue. */
  value: number;
  color?: string;
};

export type DitherFunnelProps = {
  stages: DitherFunnelStage[];
  /**
   * Scale for stage widths. Defaults to the max stage value
   * (so the longest bar fills the canvas).
   */
  maxValue?: number;
  theme?: DitherTheme;
  className?: string;
  /** Vertical gap between stages in CSS pixels. Default 6. */
  gap?: number;
};

type MorphStage = {
  value: number;
  color: string;
};

/**
 * Conversion-funnel dither bars (Amicro DitherFunnelChart).
 * Horizontal stages, each width proportional to value — use one stage for a
 * compact progress bar, or several for a ranked/share funnel.
 */
export function DitherFunnel({
  stages,
  maxValue,
  theme = "dark",
  className,
  gap = 6,
}: DitherFunnelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stagesRef = useRef(stages);
  stagesRef.current = stages;
  const maxRef = useRef(maxValue);
  maxRef.current = maxValue;
  const gapRef = useRef(gap);
  gapRef.current = gap;

  const targetRef = useRef<MorphStage[]>([]);
  const fromRef = useRef<MorphStage[]>([]);
  const morphStartRef = useRef(0);

  const resolveStages = useCallback(
    (input: DitherFunnelStage[]): MorphStage[] =>
      input.map((stage, index) => ({
        value: Math.max(0, stage.value),
        color: stage.color ?? bandColor(index, theme),
      })),
    [theme],
  );

  // Stable signature so identity-only re-renders don't restart the morph.
  const stagesKey = stages
    .map((s) => `${s.label}\0${s.value}\0${s.color ?? ""}`)
    .join("|");

  // Morph when stage values/colors change (not on every parent re-render).
  useEffect(() => {
    const next = resolveStages(stagesRef.current);
    fromRef.current =
      targetRef.current.length === next.length
        ? targetRef.current.map((s) => ({ ...s }))
        : next.map((s) => ({ value: 0, color: s.color }));
    targetRef.current = next;
    morphStartRef.current = performance.now();
  }, [stagesKey, resolveStages]);

  const draw = useCallback(
    ({
      ctx,
      width: w,
      height: h,
      time,
      reducedMotion,
    }: {
      ctx: CanvasRenderingContext2D;
      width: number;
      height: number;
      time: number;
      reducedMotion: boolean;
    }) => {
      const target = targetRef.current;
      const from = fromRef.current;
      if (target.length === 0 || w < 2 || h < 2) return;

      const count = target.length;
      const stageGap = Math.max(0, gapRef.current);
      const rowH = Math.max(2, (h - stageGap * Math.max(0, count - 1)) / count);
      const cell = Math.max(2, Math.round(w / 200));
      // Do not floor at 1 — cost USD (and other fractional metrics) is often < $1.
      // Prefer explicit maxValue; otherwise use the largest stage value.
      const explicitMax = maxRef.current;
      const stageMax = Math.max(0, ...target.map((s) => s.value));
      const scaleMax =
        explicitMax != null && Number.isFinite(explicitMax) && explicitMax > 0
          ? explicitMax
          : stageMax > 0
            ? stageMax
            : 1;

      let prog = 1;
      if (!reducedMotion) {
        prog = Math.min(1, (performance.now() - morphStartRef.current) / 500);
      }
      // Exponential ease-out (matches Amicro funnel morph).
      const ease = reducedMotion ? 1 : 1 - Math.pow(2, -10 * prog);
      const tAnim = reducedMotion ? 0 : time;

      for (let i = 0; i < count; i++) {
        const to = target[i]!;
        const fr = from[i] ?? { value: 0, color: to.color };
        const val = fr.value + (to.value - fr.value) * ease;
        const stageW = Math.max(0, Math.min(w, (val / scaleMax) * w));
        const yTop = i * (rowH + stageGap);

        if (stageW < 0.5) continue;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, yTop, stageW, rowH);
        ctx.clip();

        ctx.globalAlpha = 0.85;
        ctx.fillStyle = to.color;

        for (let bx = 0; bx <= Math.ceil(stageW); bx += cell) {
          for (
            let by = Math.floor(yTop);
            by <= Math.ceil(yTop + rowH);
            by += cell
          ) {
            const jx = bx + cell / 2;
            const jy = by + cell / 2;
            const jit = hash(jx, jy);
            const waveRaw =
              Math.sin(jx * 0.05 + tAnim) + Math.sin(jy * 0.05 + tAnim * 0.7);
            const mod = smoothstep(-1.5, 1.5, waveRaw);
            const sz = cell * (0.35 + 0.35 * mod) * (0.8 + 0.4 * jit);
            ctx.fillRect(bx + (cell - sz) / 2, by + (cell - sz) / 2, sz, sz);
          }
        }
        ctx.restore();
      }
    },
    [],
  );

  useDitherCanvas(canvasRef, draw, [stagesKey, theme, maxValue, gap]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("block h-full w-full", className)}
      role="img"
      aria-label={
        stages.length === 1
          ? stages[0]?.label ?? "Progress"
          : `Funnel: ${stages.map((s) => s.label).join(", ")}`
      }
    />
  );
}
