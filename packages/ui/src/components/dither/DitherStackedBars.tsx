"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "../../lib/utils";
import {
  bandColor,
  drawRoundedRect,
  hash,
  niceAxisMax,
  type DitherTheme,
} from "../../lib/dither/math";
import { useDitherCanvas } from "../../lib/dither/use-dither-canvas";
import {
  DitherTooltip,
  smoothToward,
  type DitherTooltipState,
} from "./DitherTooltip";

export type DitherStackedBar = {
  label: string;
  segments: number[];
};

export type DitherStackedBarsProps = {
  bars: DitherStackedBar[];
  colors?: string[];
  /** Segment labels (e.g. agent names), same order as segments. */
  segmentLabels?: string[];
  /** Optional icons parallel to segments (e.g. agent brand icons). */
  segmentIcons?: ReactNode[];
  theme?: DitherTheme;
  className?: string;
  formatValue?: (value: number) => string;
};

/** Stacked bars — Amicro fat towers + smooth hover + tooltip. */
export function DitherStackedBars({
  bars,
  colors,
  segmentLabels,
  segmentIcons,
  theme = "dark",
  className,
  formatValue = (v) => Math.round(v).toLocaleString(),
}: DitherStackedBarsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barsRef = useRef(bars);
  barsRef.current = bars;
  const labelsRef = useRef(segmentLabels);
  labelsRef.current = segmentLabels;
  const iconsRef = useRef(segmentIcons);
  iconsRef.current = segmentIcons;
  const formatRef = useRef(formatValue);
  formatRef.current = formatValue;

  // Per-bar and per-band smooth weights
  const barWeightsRef = useRef<number[]>([]);
  const bandWeightsRef = useRef<number[][]>([]);
  const targetRef = useRef<{ b: number | null; band: number | null }>({
    b: null,
    band: null,
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
      const data = barsRef.current;
      if (data.length === 0 || w < 2 || h < 2) return;

      const n = data.length;
      const colW = w / n;
      const barW = Math.min(colW * 0.62, 54);
      const cell = Math.max(3, Math.round(w / 200));
      const padB = 16;
      const plotH = h - padB;

      const maxTotal = Math.max(
        1,
        ...data.map((b) => b.segments.reduce((s, v) => s + Math.max(0, v), 0)),
      );
      const axisMax = niceAxisMax(maxTotal);
      const HIGHLIGHT = theme === "dark" ? "#FFFFFF" : "#0F172A";
      const tAnim = reducedMotion ? 0 : time;
      const rate = reducedMotion ? 1 : 0.15;

      // Ensure weight arrays
      if (barWeightsRef.current.length !== n) {
        barWeightsRef.current = Array.from({ length: n }, () => 0);
      }
      if (bandWeightsRef.current.length !== n) {
        bandWeightsRef.current = data.map((b) => b.segments.map(() => 0));
      }

      const tb = targetRef.current.b;
      const tband = targetRef.current.band;
      let maxBarW = 0;
      for (let i = 0; i < n; i++) {
        barWeightsRef.current[i] = smoothToward(
          barWeightsRef.current[i]!,
          tb === i ? 1 : 0,
          rate,
        );
        maxBarW = Math.max(maxBarW, barWeightsRef.current[i]!);
        const segs = data[i]!.segments;
        if (!bandWeightsRef.current[i] || bandWeightsRef.current[i]!.length !== segs.length) {
          bandWeightsRef.current[i] = segs.map(() => 0);
        }
        for (let j = 0; j < segs.length; j++) {
          bandWeightsRef.current[i]![j] = smoothToward(
            bandWeightsRef.current[i]![j]!,
            tb === i && tband === j ? 1 : 0,
            rate,
          );
        }
      }

      // Tooltip
      if (tb !== null && tband !== null && data[tb]) {
        const bar = data[tb]!;
        const val = bar.segments[tband] ?? 0;
        const segLabel =
          labelsRef.current?.[tband] ?? `Segment ${tband + 1}`;
        const key = `${tb}-${tband}:${val}:${clientRef.current.x}`;
        if (lastTipKey.current !== key) {
          lastTipKey.current = key;
          const segIcon = iconsRef.current?.[tband];
          setTooltip({
            clientX: clientRef.current.x,
            clientY: clientRef.current.y,
            title: bar.label,
            lines: [
              {
                label: segLabel,
                value: formatRef.current(val),
                icon: segIcon,
                color: segIcon
                  ? undefined
                  : (colors?.[tband] ?? bandColor(tband, theme)),
              },
              {
                label: "Total",
                value: formatRef.current(
                  bar.segments.reduce((s, v) => s + Math.max(0, v), 0),
                ),
              },
            ],
          });
        }
      } else if (maxBarW < 0.05 && lastTipKey.current !== "") {
        lastTipKey.current = "";
        setTooltip(null);
      }

      ctx.strokeStyle =
        theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";
      ctx.beginPath();
      ctx.moveTo(0, plotH);
      ctx.lineTo(w, plotH);
      ctx.stroke();

      for (let i = 0; i < n; i++) {
        const colX = i * colW;
        const cx = colX + colW / 2;
        const x0 = cx - barW / 2;
        let currentY = plotH;
        const segs = data[i]!.segments;
        const barWgt = barWeightsRef.current[i] ?? 0;

        for (let j = 0; j < segs.length; j++) {
          const val = Math.max(0, segs[j]!);
          if (val <= 0) continue;
          const segH = Math.max(0.1, (val / axisMax) * plotH);
          const yBottom = currentY;
          const yTop = currentY - segH;
          const rTop = j === segs.length - 1 ? 8 : 5;
          const rBottom = j === 0 ? 7 : 5;
          const bandWgt = bandWeightsRef.current[i]?.[j] ?? 0;

          // Smooth dim: other bars fade when any bar is hovered
          let alpha = 1;
          if (maxBarW > 0.01) {
            if (barWgt < 0.05) alpha = 0.3 + (1 - maxBarW) * 0.7;
            else if (bandWgt < 0.05) alpha = 0.48 + barWgt * 0.2;
            else alpha = 0.85 + bandWgt * 0.15;
          }

          const color =
            bandWgt > 0.55
              ? HIGHLIGHT
              : (colors?.[j] ?? bandColor(j, theme));

          ctx.save();
          drawRoundedRect(ctx, x0, yTop, barW, segH, rTop, rBottom);
          ctx.clip();

          ctx.globalAlpha = alpha * 0.85;
          ctx.fillStyle = color;

          for (let bx = x0; bx < x0 + barW; bx += cell) {
            for (let by = yTop; by < yBottom; by += cell) {
              const dx = bx - (x0 + barW / 2);
              const dy = by - (yTop + segH / 2);
              const dist = Math.sqrt(dx * dx + dy * dy);
              const jitter = hash(bx, by);
              const wave = Math.sin(dist * 0.1 - tAnim * 2) * 0.15;
              const sz = cell * (0.68 + wave + jitter * 0.2 + bandWgt * 0.08);
              ctx.fillRect(bx + (cell - sz) / 2, by + (cell - sz) / 2, sz, sz);
            }
          }

          ctx.restore();
          currentY = yTop;
        }

        ctx.globalAlpha = 1;
        ctx.fillStyle =
          theme === "dark" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.fillText(data[i]!.label, cx, h - 3);
      }
    },
    [colors, theme],
  );

  useDitherCanvas(canvasRef, draw, [bars, colors, segmentLabels, segmentIcons, theme]);

  const onPointer = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    clientRef.current = { x: e.clientX, y: e.clientY };
    const data = barsRef.current;
    if (data.length === 0) {
      targetRef.current = { b: null, band: null };
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const ly = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    const n = data.length;
    const colW = w / n;
    const barW = Math.min(colW * 0.62, 54);
    const padB = 16;
    const plotH = h - padB;
    const bi = Math.floor(lx / colW);
    if (bi < 0 || bi >= n) {
      targetRef.current = { b: null, band: null };
      return;
    }
    const cx = bi * colW + colW / 2;
    const x0 = cx - barW / 2;
    if (lx < x0 || lx > x0 + barW || ly > plotH) {
      targetRef.current = { b: null, band: null };
      return;
    }
    const maxTotal = Math.max(
      1,
      ...data.map((b) => b.segments.reduce((s, v) => s + Math.max(0, v), 0)),
    );
    const axisMax = niceAxisMax(maxTotal);
    let currentY = plotH;
    const segs = data[bi]!.segments;
    for (let j = 0; j < segs.length; j++) {
      const val = Math.max(0, segs[j]!);
      if (val <= 0) continue;
      const segH = (val / axisMax) * plotH;
      const yTop = currentY - segH;
      if (ly >= yTop && ly <= currentY) {
        targetRef.current = { b: bi, band: j };
        return;
      }
      currentY = yTop;
    }
    targetRef.current = { b: bi, band: null };
  };

  return (
    <div className={cn("relative h-full w-full", className)}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        onPointerMove={onPointer}
        onPointerLeave={() => {
          targetRef.current = { b: null, band: null };
        }}
      />
      <DitherTooltip state={tooltip} theme={theme} />
    </div>
  );
}
