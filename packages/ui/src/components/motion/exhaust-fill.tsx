"use client";

import { useEffect, useRef } from "react";

import {
  createSparks,
  createStars,
  paintExhaustFlame,
  type Spark,
  type Star,
} from "./exhaust-flame";

export function ExhaustFill({
  reduce,
  active,
}: {
  reduce: boolean | null;
  active: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let cssW = Math.max(1, wrap.clientWidth);
    let cssH = Math.max(1, wrap.clientHeight);
    let raf = 0;
    let running = true;
    let last = performance.now();
    let time = 0.4;
    let buffer: ImageData | null = null;
    let sparks: Spark[] = createSparks(cssW, cssH);
    let stars: Star[] = createStars();
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const reduced = Boolean(reduce) || Boolean(media?.matches);

    const syncSize = () => {
      const nextW = Math.max(1, wrap.clientWidth);
      const nextH = Math.max(1, wrap.clientHeight);
      const resized = Math.abs(nextW - cssW) > 8 || Math.abs(nextH - cssH) > 4;
      cssW = nextW;
      cssH = nextH;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextCw = Math.round(cssW * dpr);
      const nextCh = Math.round(cssH * dpr);
      if (canvas.width !== nextCw || canvas.height !== nextCh) {
        canvas.width = nextCw;
        canvas.height = nextCh;
        buffer = null;
      }
      if (resized || sparks.length === 0) {
        sparks = createSparks(cssW, cssH);
        stars = createStars();
      }
    };

    const paint = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (active && !reduced) time += dt;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      buffer = paintExhaustFlame({
        ctx,
        width: cssW,
        height: cssH,
        dpr,
        time,
        dt,
        sparks,
        stars,
        reducedMotion: reduced,
        buffer,
      });
    };

    syncSize();
    paint(last);

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            syncSize();
            paint(performance.now());
          })
        : null;
    ro?.observe(wrap);

    const tick = (now: number) => {
      if (!running) return;
      paint(now);
      if (active && !reduced) raf = requestAnimationFrame(tick);
    };
    if (active && !reduced) raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [active, reduce]);

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] bg-[#05070e]"
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden />
    </div>
  );
}
