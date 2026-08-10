"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { type DitherTheme } from "../../lib/dither/math";
import {
  createSeriesMorph,
  seriesSignature,
  type SeriesMorph,
} from "../../lib/dither/morph";
import { useDitherCanvas } from "../../lib/dither/use-dither-canvas";
import {
  DitherTooltip,
  smoothToward,
  type DitherTooltipState,
} from "./DitherTooltip";

export type DitherGrowthProps = {
  values: number[];
  labels?: string[];
  theme?: DitherTheme;
  className?: string;
  interactive?: boolean;
  valueLabel?: string;
  formatValue?: (value: number) => string;
};

/** Evenly spaced indices, always including first and last when count > 1. */
function sparseIndices(count: number, maxLabels: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const n = Math.max(2, Math.min(maxLabels, count));
  if (n >= count) {
    return Array.from({ length: count }, (_, i) => i);
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.round((i / (n - 1)) * (count - 1)));
  }
  return [...new Set(out)];
}

/**
 * Y-axis ceiling from the series peak — proportional headroom only.
 * ~6% above max so the crest doesn't kiss the top, without rounding
 * up to a "nice" number that can nearly double the scale.
 */
function growthAxisMax(peak: number): number {
  if (peak <= 0) return 1;
  return peak * 1.06;
}

/** Ordered-dither growth chart with sparse axes + scrub tooltip. */
export function DitherGrowth({
  values,
  labels,
  theme = "dark",
  className,
  interactive = true,
  valueLabel = "Value",
  formatValue = (v) => Math.round(v).toLocaleString(),
}: DitherGrowthProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({
    x: 0,
    y: 0,
    want: false,
    active: 0,
    scrubX: 0,
    scrubIdx: 0,
  });
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const formatRef = useRef(formatValue);
  formatRef.current = formatValue;
  const valueLabelRef = useRef(valueLabel);
  valueLabelRef.current = valueLabel;
  const clientRef = useRef({ x: 0, y: 0 });
  const lastTipKey = useRef("");
  const morphRef = useRef<SeriesMorph | null>(null);
  if (!morphRef.current) morphRef.current = createSeriesMorph();
  const sigRef = useRef("");

  // Retarget during render so the first paint already has morph state (ref-only).
  const valuesKey = seriesSignature(values);
  if (sigRef.current !== valuesKey) {
    const prevLen = morphRef.current.current().length;
    // Month/day (and similar) length jumps: grow-in instead of misaligned pad morph.
    if (prevLen > 0 && prevLen !== values.length) {
      morphRef.current.retargetEnter(values);
    } else {
      morphRef.current.retarget(values);
    }
    sigRef.current = valuesKey;
  }

  const [tooltip, setTooltip] = useState<DitherTooltipState | null>(null);

  const publishTooltip = useCallback((idx: number | null, data: number[]) => {
    if (idx === null) {
      if (lastTipKey.current !== "") {
        lastTipKey.current = "";
        setTooltip(null);
      }
      return;
    }
    const label = labelsRef.current?.[idx];
    const value = data[idx] ?? 0;
    const key = `${idx}:${value}:${clientRef.current.x}:${clientRef.current.y}`;
    const contentKey = `${idx}:${value}`;
    if (lastTipKey.current.startsWith(contentKey) && lastTipKey.current === key) return;
    lastTipKey.current = key;
    setTooltip({
      clientX: clientRef.current.x,
      clientY: clientRef.current.y,
      title: label,
      lines: [
        {
          label: valueLabelRef.current,
          value: formatRef.current(value),
        },
      ],
    });
  }, []);

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
      const data = morphRef.current!.sample(reducedMotion);
      if (data.length === 0 || w < 2 || h < 2) return;

      const curMax = Math.max(0, ...data);
      const axisMax = growthAxisMax(curMax);
      const yTickCount = 3;
      const yTickValues = Array.from(
        { length: yTickCount },
        (_, i) => axisMax * (1 - i / (yTickCount - 1)),
      );

      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      let yLabelW = 0;
      for (const value of yTickValues) {
        yLabelW = Math.max(yLabelW, ctx.measureText(formatRef.current(value)).width);
      }

      const padL = Math.min(64, Math.max(32, Math.ceil(yLabelW) + 10));
      const padR = 10;
      const padT = 10;
      const padB = 22;
      const plotW = Math.max(1, w - padL - padR);
      const plotH = Math.max(1, h - padT - padB);
      const plotBottom = padT + plotH;

      const cell = Math.max(3, Math.round(plotW / 180));

      const ptr = pointerRef.current;
      const rate = reducedMotion ? 1 : 0.16;
      ptr.active = smoothToward(ptr.active, ptr.want ? 1 : 0, rate);

      if (ptr.want && data.length > 0) {
        const localX = Math.max(0, Math.min(plotW, ptr.x - padL));
        const t = localX / Math.max(1, plotW);
        const idx = Math.round(t * (data.length - 1));
        ptr.scrubIdx = idx;
        const targetX = padL + (idx / Math.max(1, data.length - 1)) * plotW;
        ptr.scrubX = reducedMotion
          ? targetX
          : smoothToward(ptr.scrubX, targetX, 0.24);
        publishTooltip(idx, data);
      } else if (ptr.active < 0.05) {
        publishTooltip(null, data);
      }

      const glowStrength = ptr.active;
      const ink = theme === "dark" ? "#FFFFFF" : "#0F172A";
      const axisMuted =
        theme === "dark" ? "rgba(255,255,255,0.38)" : "rgba(15,23,42,0.42)";
      const gridMuted =
        theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.07)";
      const baselineMuted =
        theme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.14)";

      // --- Sparse Y-axis (3 ticks) + faint guides ---
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let i = 0; i < yTickCount; i++) {
        const frac = i / (yTickCount - 1);
        const value = yTickValues[i]!;
        const y = padT + frac * plotH;

        ctx.strokeStyle = i === yTickCount - 1 ? baselineMuted : gridMuted;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
        ctx.stroke();

        ctx.fillStyle = axisMuted;
        ctx.globalAlpha = 1;
        ctx.fillText(formatRef.current(value), padL - 6, y);
      }

      // --- Curve fill within plot bounds ---
      for (let x = 0; x < plotW; x += cell) {
        const plotX = padL + x;
        const t = x / Math.max(1, plotW - 1);
        const exactIdx = t * (data.length - 1);
        const i0 = Math.floor(exactIdx);
        const i1 = Math.min(i0 + 1, data.length - 1);
        const frac = exactIdx - i0;
        const val = data[i0]! + (data[i1]! - data[i0]!) * frac;
        const curveY = plotBottom - plotH * (val / axisMax);

        for (let y = plotBottom; y >= curveY; y -= cell) {
          const fillSpan = Math.max(1, plotBottom - curveY);
          const depth = Math.max(0, Math.min(1, (y - curveY) / fillSpan));
          const gradient = 1 - depth * 0.78;

          const shimmer = reducedMotion ? 0 : Math.sin(y * 0.1 - time * 2) * 0.07;
          ctx.fillStyle = ink;
          const sz = cell * (0.55 + gradient * 0.22 + shimmer);
          const alpha = 0.18 + gradient * 0.62;
          ctx.globalAlpha = Math.min(1, alpha);
          const offset = (cell - sz) / 2;
          ctx.fillRect(plotX + offset, y + offset, sz, sz);
          ctx.globalAlpha = 1;
        }
      }

      // --- Sparse X-axis labels ---
      const labelList = labelsRef.current;
      if (labelList && labelList.length > 0) {
        const maxXLabels = Math.max(2, Math.min(5, Math.floor(plotW / 64)));
        const indices = sparseIndices(data.length, maxXLabels);
        ctx.fillStyle = axisMuted;
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textBaseline = "top";
        for (const idx of indices) {
          const label = labelList[idx];
          if (!label) continue;
          const x =
            padL +
            (data.length === 1
              ? plotW / 2
              : (idx / Math.max(1, data.length - 1)) * plotW);
          ctx.textAlign =
            idx === 0 ? "left" : idx === data.length - 1 ? "right" : "center";
          ctx.fillText(label, x, plotBottom + 6);
        }
      }

      // Subtle scrub cursor only — no area highlight / glow.
      if (glowStrength > 0.02) {
        const sx = ptr.scrubX;
        const idx = ptr.scrubIdx;
        const val = data[idx] ?? 0;
        const cy = plotBottom - plotH * (val / axisMax);
        ctx.globalAlpha = 0.28 * glowStrength;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, cy);
        ctx.lineTo(sx, plotBottom);
        ctx.stroke();
        ctx.globalAlpha = 0.7 * glowStrength;
        ctx.beginPath();
        ctx.arc(sx, cy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = ink;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    },
    [publishTooltip, theme],
  );

  useDitherCanvas(canvasRef, draw);

  return (
    <div className={cn("relative h-full w-full", className)}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        onPointerMove={
          interactive
            ? (e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                pointerRef.current.x = e.clientX - rect.left;
                pointerRef.current.y = e.clientY - rect.top;
                pointerRef.current.want = true;
                clientRef.current = { x: e.clientX, y: e.clientY };
              }
            : undefined
        }
        onPointerLeave={
          interactive
            ? () => {
                pointerRef.current.want = false;
              }
            : undefined
        }
      />
      <DitherTooltip state={tooltip} theme={theme} />
    </div>
  );
}
