"use client";

/**
 * Matrix orb — a dot-matrix activity indicator.
 * Vendored from Rare UI: https://github.com/swamimalode07/rare-ui
 * (MIT, Copyright 2026 Swami Malode)
 *
 * Atmos adaptations: idle/thinking only (no listening), compact default size,
 * theme-aware seeded colors instead of the upstream orange.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import { cn } from "@workspace/ui/lib/utils";
import {
  matrixOrbColor,
  matrixOrbDotsForSize,
  matrixOrbLayout,
  readMatrixOrbTheme,
  type MatrixOrbTheme,
} from "./matrix-orb-color";

export type MatrixOrbState = "idle" | "thinking";

export type MatrixOrbProps = Omit<ComponentProps<"div">, "color"> & {
  state?: MatrixOrbState;
  /** Canvas edge in px. Default 20 for compact indicators. */
  size?: number;
  /** Explicit CSS color. Wins over `seed`. */
  color?: string;
  /** Stable identity used to pick a theme-aware color. */
  seed?: string;
  dots?: number;
  /** Status caption under the canvas. Off by default for inline use. */
  showLabel?: boolean;
  labels?: Partial<Record<MatrixOrbState, string>>;
};

const TAU = Math.PI * 2;
const STATES: MatrixOrbState[] = ["idle", "thinking"];
const DEFAULT_SIZE = 20;
const FALLBACK_SEED = "matrix-orb";

const LABELS: Record<MatrixOrbState, string> = {
  idle: "Idle",
  thinking: "Thinking",
};

const SCALE: Record<MatrixOrbState, number> = {
  idle: 0.88,
  thinking: 0.92,
};

function scaleFor(state: MatrixOrbState, size: number): number {
  if (size > 28) return SCALE[state];
  return state === "thinking" ? 1 : 0.96;
}

const STIFFNESS = 180;
const DAMPING = 26;
const BLEND = 0.16;

const ORBITERS = [
  { radius: 0.62, speed: 2.2, phase: 0, spread: 0.42 },
  { radius: 0.4, speed: -1.7, phase: 2.1, spread: 0.36 },
  { radius: 0.8, speed: 1.15, phase: 4, spread: 0.34 },
];

function intensityOf(
  state: MatrixOrbState,
  d: number,
  nx: number,
  ny: number,
  t: number,
): number {
  if (state === "thinking") {
    let heat = 0;
    for (const orbiter of ORBITERS) {
      const angle = t * orbiter.speed + orbiter.phase;
      const dx = nx - Math.cos(angle) * orbiter.radius;
      const dy = ny - Math.sin(angle) * orbiter.radius;
      heat += Math.exp(-(dx * dx + dy * dy) / (orbiter.spread * orbiter.spread));
    }
    return 0.26 + 0.8 * Math.min(1, heat);
  }

  return 0.62 + 0.12 * Math.sin(t * 1.05 - d * 2.4);
}

function subscribeToZoom(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function useDevicePixelRatio() {
  return useSyncExternalStore(
    subscribeToZoom,
    () => Math.min(window.devicePixelRatio || 1, 4),
    () => 1,
  );
}

const SERVER_THEME: MatrixOrbTheme = { scheme: "light", palette: null };
let themeSnapshot: MatrixOrbTheme = SERVER_THEME;

function subscribeTheme(onChange: () => void) {
  const root = document.documentElement;
  const observer = new MutationObserver(onChange);
  observer.observe(root, {
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-palette"],
  });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

function readClientTheme(): MatrixOrbTheme {
  const next = readMatrixOrbTheme(
    document.documentElement,
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  if (
    themeSnapshot.scheme === next.scheme &&
    themeSnapshot.palette === next.palette
  ) {
    return themeSnapshot;
  }
  themeSnapshot = next;
  return themeSnapshot;
}

function useMatrixOrbFill(color: string | undefined, seed: string | undefined): string {
  const theme = useSyncExternalStore(subscribeTheme, readClientTheme, () => SERVER_THEME);
  return useMemo(
    () => color ?? matrixOrbColor(seed ?? FALLBACK_SEED, theme),
    [color, seed, theme.palette, theme.scheme],
  );
}

export function MatrixOrb({
  state = "idle",
  size = DEFAULT_SIZE,
  color,
  seed,
  dots,
  showLabel = false,
  labels,
  className,
  ...props
}: MatrixOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const redrawRef = useRef<(() => void) | null>(null);
  const dpr = useDevicePixelRatio();
  const fill = useMatrixOrbFill(color, seed);
  const grid = dots ?? matrixOrbDotsForSize(size);
  const caption = labels?.[state] ?? LABELS[state];
  const hidden = props["aria-hidden"] === true || props["aria-hidden"] === "true";

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const buffer = Math.round(size * dpr);
    canvas.width = canvas.height = buffer;
    ctx.scale(buffer / size, buffer / size);
    ctx.fillStyle = fill;

    const cells = Math.max(3, Math.round(grid));
    const half = (cells - 1) / 2;
    const { occupancy, radiusFactor } = matrixOrbLayout(size);
    const spacing = (size * occupancy) / (cells - 1);
    const maxRadius = spacing * radiusFactor;
    const center = size / 2;
    const minRadius = size <= 28 ? 0.15 : 0.5 / dpr;

    const weights: Record<MatrixOrbState, number> = { idle: 0, thinking: 0 };
    weights[stateRef.current] = 1;

    const draw = (t: number, scale: number) => {
      ctx.clearRect(0, 0, size, size);

      for (let iy = 0; iy < cells; iy++) {
        for (let ix = 0; ix < cells; ix++) {
          const nx = (ix - half) / half;
          const ny = (iy - half) / half;
          const d = Math.hypot(nx, ny);
          if (d > 1.12) continue;

          let blended = 0;
          for (const item of STATES) {
            if (weights[item] < 0.001) continue;
            blended += weights[item] * intensityOf(item, d, nx, ny, t);
          }

          const intensity = Math.min(1, Math.max(0, blended));
          const radius = maxRadius * Math.exp(-d * d * 1.7) * intensity * scale;
          if (radius < minRadius) continue;

          ctx.beginPath();
          ctx.arc(
            center + (ix - half) * spacing * scale,
            center + (iy - half) * spacing * scale,
            radius,
            0,
            TAU,
          );
          ctx.fill();
        }
      }
    };

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      redrawRef.current = () => {
        const current = stateRef.current;
        for (const item of STATES) weights[item] = item === current ? 1 : 0;
        draw(0, scaleFor(current, size));
      };
      redrawRef.current();
      return () => {
        redrawRef.current = null;
      };
    }

    let t = 0;
    let scale = scaleFor(stateRef.current, size);
    let velocity = 0;
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t += dt;

      const current = stateRef.current;
      const step = 1 - Math.pow(1 - BLEND, dt * 60);
      for (const item of STATES) {
        weights[item] += ((item === current ? 1 : 0) - weights[item]) * step;
      }

      velocity += (-STIFFNESS * (scale - scaleFor(current, size)) - DAMPING * velocity) * dt;
      scale += velocity * dt;

      draw(t, scale);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  }, [size, fill, grid, dpr]);

  useEffect(() => {
    redrawRef.current?.();
  }, [state]);

  return (
    <div
      data-slot="matrix-orb"
      data-state={state}
      className={cn(
        "inline-flex items-center justify-center",
        showLabel && "flex-col gap-1.5",
        className,
      )}
      role={hidden || showLabel ? undefined : "img"}
      aria-label={hidden || showLabel ? undefined : caption}
      {...props}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="block"
        style={{ width: size, height: size }}
      />
      {showLabel ? (
        <span role="status" aria-live="polite" className="text-sm text-foreground/70">
          {caption}
        </span>
      ) : null}
    </div>
  );
}
