/**
 * Lattice timing follows AIcss Orbs (Kevin / AIcss), the same source as
 * `packages/ui/src/components/ui/orb.tsx`. Stars follow BoardUI Agent Thinking,
 * the same path as `packages/ui/src/components/ui/thinking-stars.tsx`.
 * Ring and helix orbs are not drawn here.
 */

export const LATTICE_VARIANTS = ["S1", "S2", "S3", "S4", "S5"] as const;
export type LatticeVariant = (typeof LATTICE_VARIANTS)[number];

export const GLYPH_BOX = 16;
export const GLYPH_SIZE = 20;
export const LATTICE_STAGE = 28;
export const LATTICE_PITCH = 6;
export const LATTICE_DOT = 3;
export const LATTICE_OFFSET = 6.5;
export const LATTICE_REST = 0.14;
export const LATTICE_REST_DARK = 0.2;
export const LATTICE_DIM = 0.07;
export const LATTICE_DIM_DARK = 0.1;

const N = 3;
const MID = (N - 1) / 2;
const RING: [number, number][] = (() => {
  const ring: [number, number][] = [];
  for (let x = 0; x < N; x++) ring.push([x, 0]);
  for (let y = 1; y < N; y++) ring.push([N - 1, y]);
  for (let x = N - 2; x >= 0; x--) ring.push([x, N - 1]);
  for (let y = N - 2; y >= 1; y--) ring.push([0, y]);
  return ring;
})();
const RING_INDEX = new Map(RING.map(([x, y], index) => [`${x},${y}`, index]));

export type LatticeCell = {
  delay: number;
  key: string;
  left: number;
  mid: boolean;
  still: boolean;
  top: number;
};

function cellDelay(variant: LatticeVariant, x: number, y: number): number {
  const dx = x - MID;
  const dy = y - MID;
  switch (variant) {
    case "S1":
      return Math.hypot(dx, dy) * 700 - (dx === 0 && dy === 0 ? 180 : 0);
    case "S2":
      return ((x + y) / (2 * (N - 1))) * 1500;
    case "S3": {
      const index = RING_INDEX.get(`${x},${y}`);
      if (index === undefined) return 0;
      return -(((RING.length - index) % RING.length) / RING.length) * 1700;
    }
    case "S4":
      return (x / (N - 1)) * 1100;
    case "S5": {
      const index = RING_INDEX.get(`${x},${y}`);
      if (index === undefined) return 0;
      const scrambled = (index * 3) % RING.length;
      return -(scrambled / RING.length) * 1700;
    }
  }
}

export function latticeCells(variant: LatticeVariant): LatticeCell[] {
  const cells: LatticeCell[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const onRing = RING_INDEX.has(`${x},${y}`);
      cells.push({
        delay: cellDelay(variant, x, y),
        key: `${x},${y}`,
        left: x * LATTICE_PITCH,
        mid: x === MID && y === MID,
        still: (variant === "S3" || variant === "S5") && !onRing,
        top: y * LATTICE_PITCH,
      });
    }
  }
  return cells;
}

export function latticeDurationMs(variant: LatticeVariant): number {
  return variant === "S4" ? 1600 : 1700;
}

export function latticeMotion(variant: LatticeVariant): "comet" | "wave" {
  return variant === "S3" || variant === "S5" ? "comet" : "wave";
}

export function pickLatticeVariant(random = Math.random()): LatticeVariant {
  const index = Math.min(
    LATTICE_VARIANTS.length - 1,
    Math.max(0, Math.floor(random * LATTICE_VARIANTS.length)),
  );
  return LATTICE_VARIANTS[index] ?? "S1";
}

function bezierCoord(t: number, p1: number, p2: number): number {
  "worklet";
  const inv = 1 - t;
  return 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t;
}

function bezierSlope(t: number, p1: number, p2: number): number {
  "worklet";
  const inv = 1 - t;
  return 3 * inv * inv * p1 + 6 * inv * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

/** CSS `cubic-bezier` easing. Endpoints stay 0 and 1. */
export function unitBezier(t: number, x1: number, y1: number, x2: number, y2: number): number {
  "worklet";
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let u = t;
  for (let step = 0; step < 6; step++) {
    const x = bezierCoord(u, x1, x2) - t;
    const slope = bezierSlope(u, x1, x2);
    if (Math.abs(slope) < 1e-4) break;
    u = Math.min(1, Math.max(0, u - x / slope));
  }
  return bezierCoord(u, y1, y2);
}

const ORB_EASE = [0.66, 0, 0.34, 1] as const;
const EASE_IN_OUT = [0.42, 0, 0.58, 1] as const;

function eased(span: number, points: readonly [number, number, number, number]): number {
  "worklet";
  return unitBezier(span, points[0], points[1], points[2], points[3]);
}

function wrap01(value: number): number {
  "worklet";
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

export function glyphPhase(progress: number, delayMs: number, durationMs: number): number {
  "worklet";
  return wrap01(progress - delayMs / durationMs);
}

export function latticeSample(
  phase: number,
  rest: number,
  motion: "comet" | "wave",
): { opacity: number; scale: number } {
  "worklet";
  const t = wrap01(phase);
  if (motion === "comet") {
    if (t >= 0.45) return { opacity: rest, scale: 1 };
    const u = t / 0.45;
    return { opacity: 1 + (rest - 1) * u, scale: 1.2 + (1 - 1.2) * u };
  }
  if (t < 0.28) {
    const u = eased(t / 0.28, ORB_EASE);
    return { opacity: rest + (1 - rest) * u, scale: 1 + 0.18 * u };
  }
  if (t < 0.56) {
    const u = eased((t - 0.28) / 0.28, ORB_EASE);
    return { opacity: 1 + (rest - 1) * u, scale: 1.18 - 0.18 * u };
  }
  return { opacity: rest, scale: 1 };
}

export const STAR_PERIOD_MS = 1400;
export const STAR_PATH = "M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z";
export const STAR_LAYOUT = [
  { scale: 1, x: 50, y: 46 },
  { scale: 0.55, x: 18, y: 22 },
  { scale: 0.45, x: 82, y: 26 },
  { scale: 0.55, x: 78, y: 76 },
  { scale: 0.4, x: 22, y: 78 },
] as const;

export function starDelayMs(index: number): number {
  return (index * STAR_PERIOD_MS * 0.7) / STAR_LAYOUT.length;
}

export function starTwinkle(phase: number): { opacity: number; scale: number } {
  "worklet";
  const t = wrap01(phase);
  if (t < 0.4) {
    const u = eased(t / 0.4, EASE_IN_OUT);
    return { opacity: u, scale: u };
  }
  if (t < 0.6) {
    const u = eased((t - 0.4) / 0.2, EASE_IN_OUT);
    return { opacity: 1 - 0.1 * u, scale: 1 - 0.2 * u };
  }
  const u = eased((t - 0.6) / 0.4, EASE_IN_OUT);
  return { opacity: 0.9 * (1 - u), scale: 0.8 * (1 - u) };
}
