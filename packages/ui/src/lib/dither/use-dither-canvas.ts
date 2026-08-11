"use client";

import { useEffect, useRef, type RefObject } from "react";

export type DitherDrawFrame = (args: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  reducedMotion: boolean;
}) => void;

/**
 * Owns device-pixel canvas sizing + rAF loop for dither charts.
 * Stops the loop when the element is offscreen (IntersectionObserver).
 *
 * The loop is intentionally **not** restarted when chart data changes.
 * Components keep data in refs / morph state and read them inside `draw`.
 * Restarting the effect on every data update cleared the canvas for a
 * frame and caused flicker (especially on tab switches).
 */
export function useDitherCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  draw: DitherDrawFrame,
  /**
   * @deprecated Ignored. Kept for call-site compatibility.
   * Data updates must flow through refs / morph state inside `draw`.
   */
  _deps: readonly unknown[] = [],
): void {
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let time = 0;
    let visible = true;
    let running = true;

    const media =
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (!running) return;
      if (media?.matches) {
        timeoutId = setTimeout(() => {
          timeoutId = null;
          raf = requestAnimationFrame(tick);
        }, 250);
      } else {
        raf = requestAnimationFrame(tick);
      }
    };

    const tick = () => {
      if (!running) return;
      const el = canvasRef.current;
      if (!el) return;
      const ctx = el.getContext("2d");
      if (!ctx) return;

      const reducedMotion = media?.matches ?? false;
      if (visible) {
        time += reducedMotion ? 0 : 0.025;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = el.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        const nextW = Math.round(w * dpr);
        const nextH = Math.round(h * dpr);
        if (el.width !== nextW || el.height !== nextH) {
          el.width = nextW;
          el.height = nextH;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, w, h);
        drawRef.current({
          ctx,
          width: w,
          height: h,
          time,
          reducedMotion,
        });
      }

      schedule();
    };

    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              visible = entries.some((e) => e.isIntersecting);
            },
            { threshold: 0.01 },
          )
        : null;
    io?.observe(canvas);

    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      io?.disconnect();
      cancelAnimationFrame(raf);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [canvasRef]);
}
