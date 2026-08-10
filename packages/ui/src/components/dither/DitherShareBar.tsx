"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "../../lib/utils";
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
import {
  DitherTooltip,
  smoothToward,
  type DitherTooltipSliding,
  type DitherTooltipState,
} from "./DitherTooltip";

export type DitherShareSegment = {
  id: string;
  label: string;
  value: number;
  color?: string;
};

export type DitherShareBarProps = {
  segments: DitherShareSegment[];
  theme?: DitherTheme;
  className?: string;
  formatValue?: (value: number) => string;
  formatShare?: (share: number) => string;
  /** Optional sliding-number parts for tooltip absolute values. */
  formatSliding?: (value: number) => DitherTooltipSliding | null | undefined;
  /** Optional sliding-number parts for tooltip share (0–1). */
  formatShareSliding?: (share: number) => DitherTooltipSliding | null | undefined;
  /** Tooltip row label for the absolute amount (default "Value"). */
  valueLabel?: string;
  /** Tooltip row label for the share percent (default "Share"). */
  shareLabel?: string;
};

/**
 * Full-width 100% stacked horizontal bar with dither fill.
 * Good for token-mix / composition share (Input · Output · Cache · …).
 */
export function DitherShareBar({
  segments,
  theme = "dark",
  className,
  formatValue = (v) => Math.round(v).toLocaleString(),
  formatShare = (s) => `${Math.round(s * 1000) / 10}%`,
  formatSliding,
  formatShareSliding,
  valueLabel = "Value",
  shareLabel = "Share",
}: DitherShareBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const formatValueRef = useRef(formatValue);
  formatValueRef.current = formatValue;
  const formatShareRef = useRef(formatShare);
  formatShareRef.current = formatShare;
  const formatSlidingRef = useRef(formatSliding);
  formatSlidingRef.current = formatSliding;
  const formatShareSlidingRef = useRef(formatShareSliding);
  formatShareSlidingRef.current = formatShareSliding;
  const valueLabelRef = useRef(valueLabel);
  valueLabelRef.current = valueLabel;
  const shareLabelRef = useRef(shareLabel);
  shareLabelRef.current = shareLabel;
  const weightsRef = useRef<number[]>([]);
  const targetIdxRef = useRef<number | null>(null);
  const clientRef = useRef({ x: 0, y: 0 });
  const lastTipKey = useRef("");
  const morphRef = useRef<SeriesMorph | null>(null);
  if (!morphRef.current) morphRef.current = createSeriesMorph();
  const sigRef = useRef("");
  const [tooltip, setTooltip] = useState<DitherTooltipState | null>(null);

  // Signature includes ids so reordering / membership changes retarget cleanly.
  // Retarget during render so the first paint already has morph state (ref-only).
  const segsKey = segments
    .map((s) => `${s.id}:${seriesSignature([s.value])}`)
    .join("|");
  if (sigRef.current !== segsKey) {
    const next = segments.map((s) => s.value);
    const prevLen = morphRef.current.current().length;
    if (prevLen > 0 && prevLen !== next.length) {
      morphRef.current.retargetEnter(next);
    } else {
      morphRef.current.retarget(next);
    }
    sigRef.current = segsKey;
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
      const segs = segmentsRef.current;
      const values = morphRef.current!.sample(reducedMotion);
      if (segs.length === 0 || w < 2 || h < 2) return;

      const n = Math.min(segs.length, values.length || segs.length);
      const total = values
        .slice(0, n)
        .reduce((s, v) => s + Math.max(0, v), 0);
      if (total <= 0) return;

      const cell = Math.max(2, Math.round(w / 220));
      const tAnim = reducedMotion ? 0 : time;
      const rate = reducedMotion ? 1 : 0.18;
      const radius = Math.min(h / 2, 8);

      if (weightsRef.current.length !== n) {
        weightsRef.current = Array.from({ length: n }, () => 0);
      }
      const target = targetIdxRef.current;
      for (let i = 0; i < n; i++) {
        weightsRef.current[i] = smoothToward(
          weightsRef.current[i]!,
          target === i ? 1 : 0,
          rate,
        );
      }

      // Track for hit-test: cumulative widths
      let x = 0;
      const layout: Array<{ x0: number; x1: number; share: number }> = [];

      for (let i = 0; i < n; i++) {
        const seg = segs[i]!;
        const value = Math.max(0, values[i] ?? 0);
        const share = value / total;
        const segW = share * w;
        const x0 = x;
        const x1 = x + segW;
        layout.push({ x0, x1, share });

        if (segW < 0.5) {
          x = x1;
          continue;
        }

        const highlight = weightsRef.current[i] ?? 0;
        const color = seg.color ?? bandColor(i, theme);
        const pad = highlight * 1.5;

        ctx.save();
        ctx.beginPath();
        // First/last caps round; middle segments stay square joins for a continuous bar.
        const rL = i === 0 ? radius : 0;
        const rR = i === n - 1 ? radius : 0;
        roundedSegment(ctx, x0, pad, segW, h - pad * 2, rL, rR);
        ctx.clip();

        ctx.globalAlpha = 0.82 + highlight * 0.15;
        ctx.fillStyle = color;

        for (let bx = Math.floor(x0); bx <= Math.ceil(x1); bx += cell) {
          for (let by = 0; by <= Math.ceil(h); by += cell) {
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

        x = x1;
      }

      // Hover tooltip — use target segment values (not mid-morph) so scrubbing
      // between slices springs digits instead of fighting intermediate floats.
      if (target !== null && segs[target]) {
        const seg = segs[target]!;
        const displayVal = Math.max(0, seg.value);
        const targetTotal = segs.reduce(
          (sum, s) => sum + Math.max(0, s.value),
          0,
        );
        const share = targetTotal > 0 ? displayVal / targetTotal : 0;
        // Content identity only — pointer moves always refresh position.
        const contentKey = `${seg.id}:${displayVal}:${share}`;
        if (lastTipKey.current !== contentKey) {
          lastTipKey.current = contentKey;
          setTooltip({
            clientX: clientRef.current.x,
            clientY: clientRef.current.y,
            title: seg.label,
            lines: [
              {
                label: valueLabelRef.current,
                value: formatValueRef.current(displayVal),
                sliding: formatSlidingRef.current?.(displayVal) ?? undefined,
                color: seg.color ?? bandColor(target, theme),
              },
              {
                label: shareLabelRef.current,
                value: formatShareRef.current(share),
                sliding: formatShareSlidingRef.current?.(share) ?? undefined,
              },
            ],
          });
        } else {
          // Same slice — only chase the pointer.
          setTooltip((prev) =>
            prev
              ? {
                  ...prev,
                  clientX: clientRef.current.x,
                  clientY: clientRef.current.y,
                }
              : prev,
          );
        }
      } else if (lastTipKey.current !== "") {
        lastTipKey.current = "";
        setTooltip(null);
      }

      // Stash layout for pointer hit-test
      (canvasRef.current as HTMLCanvasElement & {
        __shareLayout?: typeof layout;
      }).__shareLayout = layout;
    },
    [theme],
  );

  useDitherCanvas(canvasRef, draw);

  const handlePointer = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    clientRef.current = { x: e.clientX, y: e.clientY };
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const layout = (
      canvas as HTMLCanvasElement & {
        __shareLayout?: Array<{ x0: number; x1: number }>;
      }
    ).__shareLayout;
    if (!layout?.length) {
      targetIdxRef.current = null;
      return;
    }
    let hit: number | null = null;
    for (let i = 0; i < layout.length; i++) {
      const row = layout[i]!;
      if (lx >= row.x0 && lx <= row.x1) {
        hit = i;
        break;
      }
    }
    targetIdxRef.current = hit;
  };

  return (
    <div className={cn("relative h-full w-full min-h-0", className)}>
      <canvas
        ref={canvasRef}
        className="block h-full max-h-full w-full touch-none"
        onPointerMove={handlePointer}
        onPointerLeave={() => {
          targetIdxRef.current = null;
          lastTipKey.current = "";
          setTooltip(null);
        }}
        role="img"
        aria-label="Share composition"
      />
      <DitherTooltip state={tooltip} theme={theme} />
    </div>
  );
}

function roundedSegment(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rLeft: number,
  rRight: number,
) {
  const rl = Math.min(rLeft, w / 2, h / 2);
  const rr = Math.min(rRight, w / 2, h / 2);
  ctx.moveTo(x + rl, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rl, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rl);
  ctx.lineTo(x, y + rl);
  ctx.arcTo(x, y, x + rl, y, rl);
  ctx.closePath();
}
