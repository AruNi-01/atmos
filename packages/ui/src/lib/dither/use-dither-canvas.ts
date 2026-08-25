"use client";

import { useEffect, useRef, type RefObject } from "react";

export type DitherDrawResult = void | boolean | { busy?: boolean };

export type DitherDrawFrame = (args: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  reducedMotion: boolean;
}) => DitherDrawResult;

/** ~12.5 fps once morph / pointer interaction is idle. */
const IDLE_FRAME_MS = 80;
/** Matches the previous `time += 0.012` at 60fps. */
const SHIMMER_PER_MS = 0.012 * 0.06;

function drawIsBusy(result: DitherDrawResult): boolean {
  if (result === true) return true;
  if (result && typeof result === "object") return result.busy === true;
  // Charts that do not opt in keep a live loop (Token Usage heatmap, etc.).
  return result == null;
}

/**
 * Owns device-pixel canvas sizing + rAF loop for dither charts.
 * Stops the loop when the element is offscreen (IntersectionObserver).
 *
 * Size is tracked with ResizeObserver so the tick does not read layout
 * every frame.
 *
 * After `draw` reports it is no longer busy (morph / spring / pointer done),
 * the loop drops to {@link IDLE_FRAME_MS} instead of 60fps shimmer. Returning
 * void from `draw` keeps the previous always-on loop.
 *
 * The loop is intentionally **not** restarted when chart data changes.
 * Components keep data in refs / morph state and read them inside `draw`.
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
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let visible = true;
    let running = true;
    let cssW = Math.max(1, Math.round(canvas.clientWidth || 1));
    let cssH = Math.max(1, Math.round(canvas.clientHeight || 1));
    const originMs = performance.now();

    const media =
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    const cancelSchedules = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const schedule = (busy: boolean) => {
      if (!running || !visible) return;
      if (media?.matches) {
        timeoutId = setTimeout(() => {
          timeoutId = null;
          raf = requestAnimationFrame(tick);
        }, 250);
        return;
      }
      if (busy) {
        raf = requestAnimationFrame(tick);
        return;
      }
      timeoutId = setTimeout(() => {
        timeoutId = null;
        raf = requestAnimationFrame(tick);
      }, IDLE_FRAME_MS);
    };

    const tick = () => {
      if (!running) return;
      const el = canvasRef.current;
      if (!el) return;
      const ctx = el.getContext("2d");
      if (!ctx) {
        schedule(false);
        return;
      }

      const reducedMotion = media?.matches ?? false;
      let busy = false;
      if (visible) {
        const now = performance.now();
        const time = reducedMotion ? 0 : (now - originMs) * SHIMMER_PER_MS;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = cssW;
        const h = cssH;
        const nextW = Math.round(w * dpr);
        const nextH = Math.round(h * dpr);
        if (el.width !== nextW || el.height !== nextH) {
          el.width = nextW;
          el.height = nextH;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, w, h);
        busy = drawIsBusy(
          drawRef.current({
            ctx,
            width: w,
            height: h,
            time,
            reducedMotion,
          }),
        );
      }

      schedule(busy);
    };

    const kick = () => {
      if (!running || !visible) return;
      cancelSchedules();
      raf = requestAnimationFrame(tick);
    };

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver((entries) => {
            const entry = entries[0];
            const box = entry?.contentRect;
            const nextW = Math.max(1, Math.round(box?.width || canvas.clientWidth || 1));
            const nextH = Math.max(1, Math.round(box?.height || canvas.clientHeight || 1));
            if (nextW === cssW && nextH === cssH) return;
            cssW = nextW;
            cssH = nextH;
            kick();
          })
        : null;
    ro?.observe(canvas);

    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              const next = entries.some((e) => e.isIntersecting);
              if (next === visible) return;
              visible = next;
              if (visible) kick();
              else cancelSchedules();
            },
            { threshold: 0.01 },
          )
        : null;
    io?.observe(canvas);

    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      ro?.disconnect();
      io?.disconnect();
      cancelSchedules();
    };
  }, [canvasRef]);
}
