"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import {
  bandColor,
  hash,
  hexToRgba,
  smoothstep,
  type DitherTheme,
} from "../../lib/dither/math";
import { useDitherCanvas } from "../../lib/dither/use-dither-canvas";
import {
  DitherTooltip,
  smoothToward,
  type DitherTooltipState,
} from "./DitherTooltip";

export type DitherRevenueSeries = {
  id: string;
  values: number[];
  color?: string;
  label?: string;
};

export type DitherRevenueLinesProps = {
  series: DitherRevenueSeries[];
  /** Shared x labels. */
  labels?: string[];
  theme?: DitherTheme;
  className?: string;
  formatValue?: (value: number) => string;
};

/** Multi-series revenue lines with scrub tooltip + soft scrub glow. */
export function DitherRevenueLines({
  series,
  labels,
  theme = "dark",
  className,
  formatValue = (v) => Math.round(v).toLocaleString(),
}: DitherRevenueLinesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seriesRef = useRef(series);
  seriesRef.current = series;
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const formatRef = useRef(formatValue);
  formatRef.current = formatValue;
  const pointerRef = useRef({
    x: 0,
    want: false,
    active: 0,
    scrubX: 0,
    scrubIdx: 0,
  });
  const clientRef = useRef({ x: 0, y: 0 });
  const lastTipKey = useRef("");
  const [tooltip, setTooltip] = useState<DitherTooltipState | null>(null);

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
      const all = seriesRef.current.filter((s) => s.values.length > 0);
      if (all.length === 0 || w < 2 || h < 2) return;

      let maxVal = 1;
      let maxLen = 2;
      for (const s of all) {
        maxLen = Math.max(maxLen, s.values.length);
        for (const v of s.values) {
          if (v > maxVal) maxVal = v;
        }
      }
      maxVal *= 1.2;

      const cell = Math.max(2, Math.round(w / 200));
      const tAnim = reducedMotion ? 0 : time;
      const multi = all.length > 1;
      const ptr = pointerRef.current;
      const rate = reducedMotion ? 1 : 0.16;
      ptr.active = smoothToward(ptr.active, ptr.want ? 1 : 0, rate);

      if (ptr.want) {
        const t = Math.max(0, Math.min(1, ptr.x / Math.max(1, w - 1)));
        const idx = Math.round(t * (maxLen - 1));
        ptr.scrubIdx = idx;
        const targetX = (idx / Math.max(1, maxLen - 1)) * w;
        ptr.scrubX = reducedMotion
          ? targetX
          : smoothToward(ptr.scrubX, targetX, 0.24);

        const title = labelsRef.current?.[idx];
        const lines = all.map((s, si) => {
          const values = s.values;
          const vi = Math.min(idx, values.length - 1);
          return {
            label: s.label ?? s.id,
            value: formatRef.current(values[vi] ?? 0),
            color: s.color ?? bandColor(si, theme),
          };
        });
        const key = `${idx}:${lines.map((l) => l.value).join(",")}:${clientRef.current.x}`;
        if (lastTipKey.current !== key) {
          lastTipKey.current = key;
          setTooltip({
            clientX: clientRef.current.x,
            clientY: clientRef.current.y,
            title,
            lines,
          });
        }
      } else if (ptr.active < 0.05 && lastTipKey.current !== "") {
        lastTipKey.current = "";
        setTooltip(null);
      }

      all.forEach((s, si) => {
        const values = s.values;
        const points = values.length;
        if (points < 2) return;
        const stepX = w / (points - 1);
        const color = s.color ?? bandColor(si, theme);
        const hex = color.startsWith("#") ? color : "#FFFFFF";

        ctx.beginPath();
        for (let i = 0; i < points; i++) {
          const x = i * stepX;
          const y = h - (values[i]! / maxVal) * h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.lineWidth = multi ? 2 : 2.5;
        ctx.strokeStyle = hexToRgba(hex, multi ? 0.95 : 1);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();

        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();

        ctx.save();
        ctx.clip();
        ctx.fillStyle = hex;

        const fillScale = multi ? 0.55 : 1;
        for (let x = 0; x <= w; x += cell) {
          const t = x / Math.max(1, w);
          const exactIdx = t * (points - 1);
          const i0 = Math.floor(exactIdx);
          const i1 = Math.min(i0 + 1, points - 1);
          const frac = exactIdx - i0;
          const val = values[i0]! + (values[i1]! - values[i0]!) * frac;
          const curveY = h - (val / maxVal) * h;

          // Soft scrub column boost
          const scrubBoost =
            ptr.active *
            (1 - smoothstep(0, cell * 3, Math.abs(x - ptr.scrubX)));

          for (let y = Math.floor(curveY); y <= h; y += cell) {
            const jx = x + cell / 2;
            const jy = y + cell / 2;
            const jit = hash(jx + si * 13, jy + si * 7);
            const gradientFalloff = Math.max(
              0,
              1 - (y - curveY) / Math.max(1, h - curveY),
            );
            const waveRaw =
              Math.sin(jx * 0.05 + tAnim + si) +
              Math.sin(jy * 0.05 + tAnim * 0.7);
            const mod = smoothstep(-1.5, 1.5, waveRaw);
            const sz =
              cell *
              (0.3 * gradientFalloff + 0.3 * mod + scrubBoost * 0.12) *
              (0.8 + 0.4 * jit) *
              fillScale;
            if (sz > 0.45) {
              ctx.globalAlpha = multi
                ? 0.45 + gradientFalloff * 0.25 + scrubBoost * 0.15
                : 0.85;
              ctx.fillRect(x + (cell - sz) / 2, y + (cell - sz) / 2, sz, sz);
              ctx.globalAlpha = 1;
            }
          }
        }
        ctx.restore();
      });

      // Scrub line + dots at each series value
      if (ptr.active > 0.02) {
        const sx = ptr.scrubX;
        const idx = ptr.scrubIdx;
        ctx.globalAlpha = 0.3 * ptr.active;
        ctx.strokeStyle = theme === "dark" ? "#FFFFFF" : "#0F172A";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
        ctx.stroke();
        ctx.globalAlpha = ptr.active;
        all.forEach((s, si) => {
          const values = s.values;
          const vi = Math.min(idx, values.length - 1);
          const y = h - ((values[vi] ?? 0) / maxVal) * h;
          const color = s.color ?? bandColor(si, theme);
          ctx.beginPath();
          ctx.arc(sx, y, 3, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
    },
    [theme],
  );

  useDitherCanvas(canvasRef, draw, [series, labels, theme]);

  return (
    <div className={cn("relative h-full w-full", className)}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          pointerRef.current.x = e.clientX - rect.left;
          pointerRef.current.want = true;
          clientRef.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerLeave={() => {
          pointerRef.current.want = false;
        }}
      />
      <DitherTooltip state={tooltip} theme={theme} />
    </div>
  );
}
