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
  drawRoundedWedge,
  hash,
  hexToRgba,
  smoothstep,
  type DitherTheme,
} from "../../lib/dither/math";
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

export type DitherDonutSlice = {
  value: number;
  label?: string;
  color?: string;
  /** Optional brand icon shown in tooltip (e.g. agent icon). */
  icon?: ReactNode;
};

export type DitherDonutProps = {
  slices: DitherDonutSlice[];
  theme?: DitherTheme;
  className?: string;
  holeRatio?: number;
  formatValue?: (value: number, share: number) => string;
};

/**
 * Donut — Amicro rounded wedges + smooth hover weights + tooltip.
 */
export function DitherDonut({
  slices,
  theme = "dark",
  className,
  formatValue,
}: DitherDonutProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slicesRef = useRef(slices);
  slicesRef.current = slices;
  const weightsRef = useRef<number[]>([]);
  const targetIdxRef = useRef<number | null>(null);
  const clientRef = useRef({ x: 0, y: 0 });
  const lastTipKey = useRef("");
  const formatRef = useRef(formatValue);
  formatRef.current = formatValue;
  const morphRef = useRef<SeriesMorph | null>(null);
  if (!morphRef.current) morphRef.current = createSeriesMorph();
  const sigRef = useRef("");
  /** Last drawn values for hit-test. */
  const lastValuesRef = useRef<number[]>([]);

  // Retarget during render so the first paint already has morph state (ref-only).
  const slicesKey = seriesSignature(slices.map((s) => s.value));
  if (sigRef.current !== slicesKey) {
    morphRef.current.retarget(slices.map((s) => s.value));
    sigRef.current = slicesKey;
  }

  const [tooltip, setTooltip] = useState<DitherTooltipState | null>(null);

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
      const raw = slicesRef.current;
      const values = morphRef.current!.sample(reducedMotion);
      lastValuesRef.current = values;
      const total = values.reduce((s, d) => s + Math.max(0, d), 0);
      const logicalSize = 200;
      const dpr = Math.min(
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        2,
      );

      ctx.setTransform(
        (width * dpr) / logicalSize,
        0,
        0,
        (height * dpr) / logicalSize,
        0,
        0,
      );
      ctx.clearRect(0, 0, logicalSize, logicalSize);

      if (total <= 0) {
        ctx.strokeStyle =
          theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.arc(100, 100, 70, 0, Math.PI * 2);
        ctx.stroke();
        return;
      }

      // Smooth hover weights
      const n = Math.min(raw.length, values.length);
      if (weightsRef.current.length !== n) {
        weightsRef.current = Array.from({ length: n }, () => 0);
      }
      const rate = reducedMotion ? 1 : 0.14;
      let anyHover = 0;
      for (let i = 0; i < n; i++) {
        const target = targetIdxRef.current === i ? 1 : 0;
        weightsRef.current[i] = smoothToward(weightsRef.current[i]!, target, rate);
        anyHover = Math.max(anyHover, weightsRef.current[i]!);
      }

      // Tooltip
      const hi = targetIdxRef.current;
      if (hi !== null && raw[hi] && anyHover > 0.05) {
        const slice = raw[hi]!;
        const displayVal = values[hi] ?? slice.value;
        const share = Math.max(0, displayVal) / total;
        const fmt = formatRef.current;
        const valueText = fmt
          ? fmt(displayVal, share)
          : `${Math.round(share * 100)}% · ${Math.round(displayVal).toLocaleString()}`;
        const key = `${hi}:${displayVal}:${clientRef.current.x}`;
        if (lastTipKey.current !== key) {
          lastTipKey.current = key;
          setTooltip({
            clientX: clientRef.current.x,
            clientY: clientRef.current.y,
            title: slice.label,
            lines: [
              {
                label: slice.label ?? "Share",
                value: valueText,
                icon: slice.icon,
                color: slice.icon ? undefined : (slice.color ?? bandColor(hi, theme)),
              },
            ],
          });
        }
      } else if (anyHover < 0.04 && lastTipKey.current !== "") {
        lastTipKey.current = "";
        setTooltip(null);
      }

      const shares = values.slice(0, n).map((v) => Math.max(0, v) / total);
      let startAngle = -Math.PI / 2;
      const gap = 0.07;
      const rIn = 55;
      const rOut = 86;
      const cell = 4.6;
      const tAnim = reducedMotion ? 0 : time;

      for (let i = 0; i < shares.length; i++) {
        const share = shares[i]!;
        if (share <= 0) continue;

        const sweep = share * Math.PI * 2;
        let aStart = startAngle + gap / 2;
        let aEnd = startAngle + sweep - gap / 2;
        if (aEnd < aStart) aEnd = aStart;

        const w = weightsRef.current[i] ?? 0;
        const pop = w * 6; // smooth pop-out

        ctx.save();
        const mid = (aStart + aEnd) / 2;
        if (pop > 0.01) {
          ctx.translate(Math.cos(mid) * pop, Math.sin(mid) * pop);
        }

        ctx.beginPath();
        drawRoundedWedge(ctx, 100, 100, rIn, rOut, aStart, aEnd, 6);
        ctx.closePath();
        ctx.clip();

        const color = raw[i]?.color ?? bandColor(i, theme);
        // Smooth alpha: base 0.72, dim to ~0.22 when others hovered, full when self
        const dim = anyHover > 0.01 ? 0.22 + (1 - anyHover) * 0.5 : 0.72;
        const selfAlpha = 0.72 + w * 0.28;
        ctx.globalAlpha = anyHover > 0.01 ? (1 - w) * dim + w * selfAlpha : 0.72;
        ctx.fillStyle = color;

        if (w > 0.2) {
          const hex = color.startsWith("#") ? color : "#FFFFFF";
          ctx.shadowColor = hexToRgba(hex, 0.55 * w);
          ctx.shadowBlur = 5 * w;
        }

        const sizeBoost = w * 0.12;
        for (let x = 14; x <= 186; x += cell) {
          for (let y = 14; y <= 186; y += cell) {
            const dx = x - 100;
            const dy = y - 100;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < rIn - cell || dist > rOut + cell) continue;

            const a = Math.atan2(dy, dx);
            let normalizedA = a - aStart;
            while (normalizedA < 0) normalizedA += Math.PI * 2;
            while (normalizedA >= Math.PI * 2) normalizedA -= Math.PI * 2;
            if (normalizedA > aEnd - aStart) continue;

            const fullness = smoothstep(0.62, 1.0, (dist - rIn) / (rOut - rIn));
            const waveRaw =
              Math.sin(dist * 0.1 - tAnim) +
              Math.sin(a * 3 + tAnim * 1.5) +
              Math.sin(dx * 0.05 + dy * 0.05 + tAnim * 2);
            const wave = smoothstep(-1.5, 1.5, waveRaw);
            const jitter = hash(x, y);
            const size =
              cell *
              ((0.34 + sizeBoost) + 0.36 * fullness + 0.26 * wave) *
              (0.78 + 0.42 * jitter);

            ctx.fillRect(x - size / 2, y - size / 2, size, size);
          }
        }

        ctx.restore();
        startAngle += sweep;
      }
    },
    [theme],
  );

  useDitherCanvas(canvasRef, draw);

  const hitTest = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    clientRef.current = { x: e.clientX, y: e.clientY };
    const rect = e.currentTarget.getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / rect.width) * 200;
    const ly = ((e.clientY - rect.top) / rect.height) * 200;
    const dx = lx - 100;
    const dy = ly - 100;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 55 || dist > 86) {
      targetIdxRef.current = null;
      return;
    }
    const a = Math.atan2(dy, dx);
    let startAngle = -Math.PI / 2;
    const raw = slicesRef.current;
    const values = lastValuesRef.current;
    const total = values.reduce((s, d) => s + Math.max(0, d), 0);
    if (total <= 0) {
      targetIdxRef.current = null;
      return;
    }
    const gap = 0.07;
    const n = Math.min(raw.length, values.length);
    for (let i = 0; i < n; i++) {
      const share = Math.max(0, values[i]!) / total;
      if (share <= 0) continue;
      const sweep = share * Math.PI * 2;
      const aStart = startAngle + gap / 2;
      const aEnd = startAngle + sweep - gap / 2;
      let na = a - aStart;
      while (na < 0) na += Math.PI * 2;
      while (na >= Math.PI * 2) na -= Math.PI * 2;
      if (na <= aEnd - aStart) {
        targetIdxRef.current = i;
        return;
      }
      startAngle += sweep;
    }
    targetIdxRef.current = null;
  };

  return (
    <div className={cn("relative h-full w-full", className)}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        onPointerMove={hitTest}
        onPointerLeave={() => {
          targetIdxRef.current = null;
        }}
      />
      <DitherTooltip state={tooltip} theme={theme} />
    </div>
  );
}
