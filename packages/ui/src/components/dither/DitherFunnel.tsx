"use client";

import { useCallback, useRef } from "react";
import { cn } from "../../lib/utils";
import { isFixedDomainMax } from "../../lib/dither/domain";
import {
  FUNNEL_FOREGROUND_ALPHA,
  funnelValueWidth,
  resolveFunnelTrack,
} from "../../lib/dither/funnel-track";
import {
  bandColor,
  hash,
  smoothstep,
  type DitherTheme,
} from "../../lib/dither/math";
import {
  createSeriesMorph,
  seriesSignature,
  type SeriesMorph,
} from "../../lib/dither/morph";
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
  /**
   * Full-width light dither track behind each stage. Omitted / empty keeps
   * the previous paint (value bar only). Track is static — it does not
   * morph with the stage value.
   */
  trackColor?: string;
};

function paintFunnelBand(
  ctx: CanvasRenderingContext2D,
  {
    width,
    yTop,
    rowH,
    cell,
    color,
    alpha,
    tAnim,
  }: {
    width: number;
    yTop: number;
    rowH: number;
    cell: number;
    color: string;
    alpha: number;
    tAnim: number;
  },
) {
  if (width < 0.5) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, yTop, width, rowH);
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let bx = 0; bx <= Math.ceil(width); bx += cell) {
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
  trackColor,
}: DitherFunnelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stagesRef = useRef(stages);
  stagesRef.current = stages;
  const maxRef = useRef(maxValue);
  maxRef.current = maxValue;
  const gapRef = useRef(gap);
  gapRef.current = gap;
  const trackColorRef = useRef(trackColor);
  trackColorRef.current = trackColor;
  const colorsRef = useRef<string[]>([]);
  const morphRef = useRef<SeriesMorph | null>(null);
  if (!morphRef.current) morphRef.current = createSeriesMorph();
  const sigRef = useRef("");

  // Stable signature so identity-only re-renders don't restart the morph.
  // Retarget during render so the first paint already has morph state (ref-only).
  const stagesKey = stages
    .map((s) => `${s.label}\0${seriesSignature([s.value])}\0${s.color ?? ""}`)
    .join("|");
  const themeKey = `${stagesKey}|${theme}`;
  if (sigRef.current !== themeKey) {
    colorsRef.current = stages.map(
      (stage, index) => stage.color ?? bandColor(index, theme),
    );
    morphRef.current.retarget(stages.map((s) => s.value));
    sigRef.current = themeKey;
  }

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
      const values = morphRef.current!.sample(reducedMotion);
      const colors = colorsRef.current;
      const count = values.length;
      if (count === 0 || w < 2 || h < 2) return;

      const stageGap = Math.max(0, gapRef.current);
      const rowH = Math.max(2, (h - stageGap * Math.max(0, count - 1)) / count);
      const cell = Math.max(2, Math.round(w / 200));
      // Do not floor at 1 — cost USD (and other fractional metrics) is often < $1.
      // Prefer explicit maxValue; otherwise use the largest stage value.
      const explicitMax = maxRef.current;
      const stageMax = Math.max(0, ...values);
      const scaleMax = isFixedDomainMax(explicitMax)
        ? explicitMax
        : stageMax > 0
          ? stageMax
          : 1;
      const tAnim = reducedMotion ? 0 : time;
      const track = resolveFunnelTrack(trackColorRef.current);

      for (let i = 0; i < count; i++) {
        const val = values[i] ?? 0;
        const stageW = funnelValueWidth(w, val, scaleMax);
        const yTop = i * (rowH + stageGap);

        if (track) {
          paintFunnelBand(ctx, {
            width: w,
            yTop,
            rowH,
            cell,
            color: track.color,
            alpha: track.alpha,
            tAnim,
          });
        }

        paintFunnelBand(ctx, {
          width: stageW,
          yTop,
          rowH,
          cell,
          color: colors[i] ?? bandColor(i, theme),
          alpha: FUNNEL_FOREGROUND_ALPHA,
          tAnim,
        });
      }
    },
    [theme],
  );

  useDitherCanvas(canvasRef, draw);

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
