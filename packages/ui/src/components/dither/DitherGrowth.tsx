"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { type DitherTheme } from "../../lib/dither/math";
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

/** Ordered-dither growth chart with scrub tooltip (no background grid / hover glow). */
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

  const [tooltip, setTooltip] = useState<DitherTooltipState | null>(null);

  const publishTooltip = useCallback((idx: number | null) => {
    if (idx === null) {
      if (lastTipKey.current !== "") {
        lastTipKey.current = "";
        setTooltip(null);
      }
      return;
    }
    const data = valuesRef.current;
    const label = labelsRef.current?.[idx];
    const value = data[idx] ?? 0;
    const key = `${idx}:${value}:${clientRef.current.x}:${clientRef.current.y}`;
    // Update when index/value changes; always refresh position when key index same but pointer moved
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
      const data = valuesRef.current;
      if (data.length === 0 || w < 2 || h < 2) return;

      const cell = Math.max(3, Math.round(w / 180));
      const curMax = Math.max(1, ...data);
      const headroom = 0.16 * h;
      const plotH = h - headroom;
      const ptr = pointerRef.current;
      const rate = reducedMotion ? 1 : 0.16;
      ptr.active = smoothToward(ptr.active, ptr.want ? 1 : 0, rate);

      if (ptr.want && data.length > 0) {
        const t = Math.max(0, Math.min(1, ptr.x / Math.max(1, w - 1)));
        const idx = Math.round(t * (data.length - 1));
        ptr.scrubIdx = idx;
        const targetX = (idx / Math.max(1, data.length - 1)) * w;
        ptr.scrubX = reducedMotion
          ? targetX
          : smoothToward(ptr.scrubX, targetX, 0.24);
        publishTooltip(idx);
      } else if (ptr.active < 0.05) {
        publishTooltip(null);
      }

      const glowStrength = ptr.active;
      const ink = theme === "dark" ? "#FFFFFF" : "#0F172A";

      for (let x = 0; x < w; x += cell) {
        const t = x / Math.max(1, w - 1);
        const exactIdx = t * (data.length - 1);
        const i0 = Math.floor(exactIdx);
        const i1 = Math.min(i0 + 1, data.length - 1);
        const frac = exactIdx - i0;
        const val = data[i0]! + (data[i1]! - data[i0]!) * frac;
        const curveY = h - plotH * (val / curMax);

        // Only paint under the curve — no background grid dots.
        for (let y = h; y >= curveY; y -= cell) {
          // Vertical gradient: denser near the curve, fade lighter toward the baseline.
          const fillSpan = Math.max(1, h - curveY);
          const depth = Math.max(0, Math.min(1, (y - curveY) / fillSpan)); // 0 at crest → 1 at bottom
          const gradient = 1 - depth * 0.78; // keep a soft wash at the base

          const shimmer = reducedMotion ? 0 : Math.sin(y * 0.1 - time * 2) * 0.07;
          ctx.fillStyle = ink;
          const sz = cell * (0.55 + gradient * 0.22 + shimmer);
          const alpha = 0.18 + gradient * 0.62;
          ctx.globalAlpha = Math.min(1, alpha);
          const offset = (cell - sz) / 2;
          ctx.fillRect(x + offset, y + offset, sz, sz);
          ctx.globalAlpha = 1;
        }
      }

      // Subtle scrub cursor only — no area highlight / glow.
      if (glowStrength > 0.02) {
        const sx = ptr.scrubX;
        const idx = ptr.scrubIdx;
        const val = data[idx] ?? 0;
        const cy = h - plotH * (val / curMax);
        ctx.globalAlpha = 0.28 * glowStrength;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, cy);
        ctx.lineTo(sx, h);
        ctx.stroke();
        ctx.globalAlpha = 0.7 * glowStrength;
        ctx.beginPath();
        ctx.arc(sx, cy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = ink;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    },
    [interactive, publishTooltip, theme],
  );

  useDitherCanvas(canvasRef, draw, [values, labels, theme, interactive]);

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
