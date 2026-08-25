"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { clampToDomain } from "../../lib/dither/domain";
import {
  growthAxisMax,
  resolveGrowthAxisMax,
  resolveGrowthColor,
  resolveGrowthPlotPadding,
  shouldPaintGrowthGuides,
  type GrowthColorStop,
} from "../../lib/dither/growth-layout";
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
  type DitherTooltipLine,
  type DitherTooltipSliding,
  type DitherTooltipState,
} from "./DitherTooltip";

export type DitherGrowthColorStop = GrowthColorStop;

export type DitherGrowthProps = {
  values: number[];
  labels?: string[];
  theme?: DitherTheme;
  className?: string;
  interactive?: boolean;
  valueLabel?: string;
  formatValue?: (value: number) => string;
  /** Optional sliding-number parts for scrub tooltip values. */
  formatSliding?: (value: number) => DitherTooltipSliding | null | undefined;
  /**
   * Semantic domain id (e.g. `"tokens"` / `"cost"`). When it changes, force a
   * grow-in instead of cross-scale index morph.
   */
  domainKey?: string;
  /**
   * Optional fixed positive Y domain. When finite and > 0, draw uses this
   * max instead of the 1.06 auto axis and clamps plotted points to 0..yMax.
   * Omitted / invalid keeps the Token Usage auto domain. Read via ref.
   */
  yMax?: number;
  /** Hex fill / scrub-dot ink. Omitted keeps theme ink. */
  color?: string;
  /** Vertical value-to-color gradient stops for threshold-aware fills. */
  colorStops?: DitherGrowthColorStop[];
  /** Additional tooltip rows for concrete amounts behind the primary value. */
  getTooltipLines?: (value: number, index: number) => DitherTooltipLine[];
  /**
   * Hide Y guides/labels and X labels, with ~2/0 padding for a 40–50px
   * area chart. Default is the labeled Token Usage layout.
   */
  compact?: boolean;
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

/** Ordered-dither growth chart with sparse axes + scrub tooltip. */
export function DitherGrowth({
  values,
  labels,
  theme = "dark",
  className,
  interactive = true,
  valueLabel = "Value",
  formatValue = (v) => Math.round(v).toLocaleString(),
  formatSliding,
  domainKey,
  yMax,
  color,
  colorStops,
  getTooltipLines,
  compact = false,
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
  const formatSlidingRef = useRef(formatSliding);
  formatSlidingRef.current = formatSliding;
  const valueLabelRef = useRef(valueLabel);
  valueLabelRef.current = valueLabel;
  const yMaxRef = useRef(yMax);
  yMaxRef.current = yMax;
  const colorRef = useRef(color);
  colorRef.current = color;
  const colorStopsRef = useRef(colorStops);
  colorStopsRef.current = colorStops;
  const getTooltipLinesRef = useRef(getTooltipLines);
  getTooltipLinesRef.current = getTooltipLines;
  const compactRef = useRef(compact);
  compactRef.current = compact;
  const clientRef = useRef({ x: 0, y: 0 });
  const lastTipKey = useRef("");
  const morphRef = useRef<SeriesMorph | null>(null);
  if (!morphRef.current) morphRef.current = createSeriesMorph();
  const sigRef = useRef("");
  const domainRef = useRef(domainKey);
  const fromAxisRef = useRef(0);
  const toAxisRef = useRef(1);
  const lastAxisRef = useRef(0);

  // Retarget during render so the first paint already has morph state (ref-only).
  const valuesKey = seriesSignature(values);
  const domainChanged =
    domainKey !== undefined && domainRef.current !== domainKey;
  if (domainKey !== undefined) domainRef.current = domainKey;
  if (sigRef.current !== valuesKey || domainChanged) {
    const nextPeak = Math.max(0, ...values);
    const nextAxis = growthAxisMax(nextPeak > 0 ? nextPeak : 1);
    if (domainChanged) {
      // Unit flip: morph by relative height on the new axis (not raw values).
      morphRef.current.retarget(values);
      fromAxisRef.current = nextAxis;
    } else {
      morphRef.current.retarget(values);
      fromAxisRef.current = lastAxisRef.current || nextAxis;
    }
    toAxisRef.current = nextAxis;
    sigRef.current = valuesKey;
  }

  const [tooltip, setTooltip] = useState<DitherTooltipState | null>(null);

  const publishTooltip = useCallback((idx: number | null, _data: number[]) => {
    if (idx === null) {
      if (lastTipKey.current !== "") {
        lastTipKey.current = "";
        setTooltip(null);
      }
      return;
    }
    // Prefer target series for tooltip amounts so digit springs aren't fed
    // mid-morph floats while the curve is still animating.
    const label = labelsRef.current?.[idx];
    const value = valuesRef.current[idx] ?? 0;
    const lines: DitherTooltipLine[] = [
      {
        label: valueLabelRef.current,
        value: formatRef.current(value),
        sliding: formatSlidingRef.current?.(value) ?? undefined,
        color: resolveGrowthColor(
          colorRef.current,
          colorStopsRef.current,
          value,
          theme,
        ),
      },
      ...(getTooltipLinesRef.current?.(value, idx) ?? []),
    ];
    const contentKey = `${idx}:${value}:${JSON.stringify(
      lines.map((line) => [line.label, line.value]),
    )}`;
    if (lastTipKey.current === contentKey) {
      setTooltip((prev) =>
        prev
          ? {
              ...prev,
              clientX: clientRef.current.x,
              clientY: clientRef.current.y,
            }
          : prev,
      );
      return;
    }
    lastTipKey.current = contentKey;
    setTooltip({
      clientX: clientRef.current.x,
      clientY: clientRef.current.y,
      title: label,
      lines,
    });
  }, [theme]);

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

      const prog = morphRef.current!.progress(reducedMotion);
      const targetPeak = Math.max(0, ...valuesRef.current);
      const samplePeak = Math.max(0, ...data);
      const fromAxis = fromAxisRef.current;
      const toAxis =
        toAxisRef.current ||
        growthAxisMax(targetPeak > 0 ? targetPeak : samplePeak);
      const autoAxis = Math.max(1e-6, fromAxis + (toAxis - fromAxis) * prog);
      const domainMax = yMaxRef.current;
      const axisMax = resolveGrowthAxisMax(domainMax, autoAxis);
      lastAxisRef.current = axisMax;
      const compact = compactRef.current;
      const showGuides = shouldPaintGrowthGuides(compact);
      const yTickCount = 3;
      const yTickValues = Array.from(
        { length: yTickCount },
        (_, i) => axisMax * (1 - i / (yTickCount - 1)),
      );

      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      let yLabelW = 0;
      if (showGuides) {
        for (const value of yTickValues) {
          yLabelW = Math.max(yLabelW, ctx.measureText(formatRef.current(value)).width);
        }
      }

      const { padL, padR, padT, padB } = resolveGrowthPlotPadding(
        compact,
        yLabelW,
      );
      const plotW = Math.max(1, w - padL - padR);
      const plotH = Math.max(1, h - padT - padB);
      const plotBottom = padT + plotH;
      const plotY = (value: number) =>
        plotBottom - plotH * (clampToDomain(value, domainMax) / axisMax);

      const cell = compact
        ? Math.max(4, Math.round(plotW / 100))
        : Math.max(3, Math.round(plotW / 180));

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
      const ink = resolveGrowthColor(
        colorRef.current,
        colorStopsRef.current,
        data[ptr.scrubIdx] ?? 0,
        theme,
      );
      const axisMuted =
        theme === "dark" ? "rgba(255,255,255,0.38)" : "rgba(15,23,42,0.42)";
      const gridMuted =
        theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.07)";
      const baselineMuted =
        theme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.14)";

      // --- Sparse Y-axis (3 ticks) + faint guides ---
      if (showGuides) {
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
        const curveY = plotY(val);

        for (let y = plotBottom; y >= curveY; y -= cell) {
          const fillSpan = Math.max(1, plotBottom - curveY);
          const depth = Math.max(0, Math.min(1, (y - curveY) / fillSpan));
          const gradient = 1 - depth * 0.78;

          // Right→left drift — same phase sign as heatmap / share / funnel.
          const shimmer = reducedMotion
            ? 0
            : (Math.sin(plotX * 0.05 + time) +
                Math.sin(y * 0.05 + time * 0.7)) *
              0.035;
          const fillValue = ((plotBottom - y) / plotH) * axisMax;
          ctx.fillStyle = resolveGrowthColor(
            colorRef.current,
            colorStopsRef.current,
            fillValue,
            theme,
          );
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
      if (showGuides && labelList && labelList.length > 0) {
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
        const cy = plotY(val);
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

      return {
        busy:
          (!reducedMotion && morphRef.current!.progress(reducedMotion) < 0.999) ||
          ptr.want ||
          ptr.active > 0.05,
      };
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
