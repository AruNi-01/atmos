"use client";

import * as React from "react";
import { cn, ditherInk } from "@workspace/ui";

export type TokenUsageStatIllustrationKind =
  | "messages"
  | "activeDays"
  | "cost"
  | "tokens";

/**
 * Soft-stat card: muted label → large number top-left, ordered-dither monochrome
 * glyph bottom-right (partially clipped by the rounded border) — same ink
 * language as the page's dither charts.
 */
export function TokenUsageStatChip({
  isDark,
  label,
  value,
  note,
  illustration,
}: {
  isDark: boolean;
  label: string;
  value: React.ReactNode;
  note: string;
  illustration: TokenUsageStatIllustrationKind;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full min-h-[4.75rem] flex-col overflow-hidden rounded-[16px] border px-3.5 pt-4 pb-2.5",
        isDark
          ? "border-white/[0.05] bg-[#1a1a1a]"
          : "border-black/[0.06] bg-[#f0f0f0]",
      )}
      title={note}
    >
      <div
        className={cn(
          "relative z-[1] text-[13px] font-normal leading-none tracking-tight",
          isDark ? "text-white/[0.36]" : "text-black/[0.36]",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "relative z-[1] mt-4 text-[1.5rem] font-semibold leading-none tracking-tight tabular-nums sm:mt-4.5 sm:text-[1.625rem]",
          isDark ? "text-white/[0.72]" : "text-black/[0.72]",
        )}
      >
        {value}
      </div>
      <div
        className="pointer-events-none absolute -right-1 -bottom-1 size-[4.5rem] select-none sm:size-[4.75rem]"
        aria-hidden
      >
        <TokenUsageStatDitherIcon kind={illustration} isDark={isDark} />
      </div>
    </div>
  );
}

/** Deterministic 0..1 noise — same family as packages/ui dither math. */
function hash(x: number, y: number): number {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Silhouette in 0..80 space — keep shapes bold and few so dither still reads
 * at ~72px. Detail is optional punch-outs only.
 */
function fillSilhouette(
  ctx: CanvasRenderingContext2D,
  kind: TokenUsageStatIllustrationKind,
) {
  ctx.fillStyle = "#fff";
  switch (kind) {
    case "messages": {
      // Single speech bubble + tail
      ctx.beginPath();
      roundRectPath(ctx, 14, 12, 52, 40, 12);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(28, 52);
      ctx.lineTo(22, 68);
      ctx.lineTo(42, 52);
      ctx.closePath();
      ctx.fill();
      // Two message lines
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";
      ctx.beginPath();
      roundRectPath(ctx, 26, 24, 28, 5, 2.5);
      ctx.fill();
      ctx.beginPath();
      roundRectPath(ctx, 26, 36, 20, 5, 2.5);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      break;
    }
    case "activeDays": {
      // One calendar block
      ctx.beginPath();
      roundRectPath(ctx, 14, 14, 52, 52, 10);
      ctx.fill();
      // Header band stays solid; punch 2×2 day cells
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";
      // clear a gap under header so header reads as a bar
      ctx.fillRect(14, 28, 52, 3);
      for (const [x, y] of [
        [24, 36],
        [42, 36],
        [24, 50],
        [42, 50],
      ] as const) {
        ctx.beginPath();
        roundRectPath(ctx, x, y, 12, 10, 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      // Binding rings on top
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      roundRectPath(ctx, 26, 8, 6, 12, 3);
      ctx.fill();
      ctx.beginPath();
      roundRectPath(ctx, 48, 8, 6, 12, 3);
      ctx.fill();
      break;
    }
    case "cost": {
      // Bold dollar sign — size/position aligned with the other corner glyphs
      ctx.font = "700 72px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", 42, 44);
      break;
    }
    case "tokens": {
      // Two flat coins, slightly offset — simple circles only
      ctx.beginPath();
      ctx.arc(30, 46, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(50, 30, 22, 0, Math.PI * 2);
      ctx.fill();
      // Simple face dots
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(30, 46, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(50, 30, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      break;
    }
  }
}

/**
 * Ordered-dither fill — same cell-dot language as DitherShareBar / Growth.
 */
function paintDitherLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: "dark" | "light",
) {
  // Slightly larger cells → cleaner silhouette edges at small size.
  const cell = 3;
  ctx.fillStyle = ditherInk(theme, 1);
  for (let bx = 0; bx <= w; bx += cell) {
    for (let by = 0; by <= h; by += cell) {
      const jx = bx + cell / 2;
      const jy = by + cell / 2;
      const jit = hash(jx * 1.7, jy * 1.3);
      if (jit > 0.88) continue;
      const sz = cell * (0.48 + 0.4 * jit);
      ctx.globalAlpha = 0.62 + 0.35 * (1 - jit * 0.5);
      ctx.fillRect(bx + (cell - sz) / 2, by + (cell - sz) / 2, sz, sz);
    }
  }
  ctx.globalAlpha = 1;
}

function TokenUsageStatDitherIcon({
  kind,
  isDark,
}: {
  kind: TokenUsageStatIllustrationKind;
  isDark: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const theme = isDark ? ("dark" as const) : ("light" as const);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cssSize = 76;
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mask: silhouette in white
    const mask = document.createElement("canvas");
    mask.width = canvas.width;
    mask.height = canvas.height;
    const mctx = mask.getContext("2d");
    if (!mctx) return;
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.scale(cssSize / 80, cssSize / 80);
    fillSilhouette(mctx, kind);

    // Dither field
    const dither = document.createElement("canvas");
    dither.width = canvas.width;
    dither.height = canvas.height;
    const dctx = dither.getContext("2d");
    if (!dctx) return;
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintDitherLayer(dctx, cssSize, cssSize, theme);

    // Clip dither to silhouette
    dctx.globalCompositeOperation = "destination-in";
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.drawImage(mask, 0, 0);

    // Paint result
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(dither, 0, 0);
  }, [kind, theme]);

  return <canvas ref={canvasRef} className="size-full" aria-hidden />;
}
