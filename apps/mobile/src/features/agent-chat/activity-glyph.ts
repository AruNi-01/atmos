/**
 * Lattice, ring, and helix timing follow AIcss Orbs (Kevin / AIcss), the same
 * source as `packages/ui/src/components/ui/orb.tsx`. Stars follow BoardUI Agent
 * Thinking, the same path as `packages/ui/src/components/ui/thinking-stars.tsx`.
 * Lens and morph orbs are not in the streaming pool, so they are not drawn here.
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

export const RING_VARIANTS = ["C1", "C2", "C3", "C4", "C5"] as const;
export type RingVariant = (typeof RING_VARIANTS)[number];
export const HELIX_VARIANTS = ["G1", "G2", "G3", "G4", "G5"] as const;
export type HelixVariant = (typeof HELIX_VARIANTS)[number];
export const WORKING_STYLES = [...LATTICE_VARIANTS, ...RING_VARIANTS, ...HELIX_VARIANTS] as const;
export type WorkingStyle = (typeof WORKING_STYLES)[number];

export const RING_COUNT = 8;
export const RING_RADIUS = 8;
export const RING_DOT = 3;
export const RING_REST = 0.22;
export const RING_REST_DARK = 0.3;
export const HELIX_RADIUS = 8.5;
export const HELIX_DOT = 2;

const RING_TURN = Math.PI;
const GLOBE_TILT = (14 * Math.PI) / 180;
const G5_STOPS = [0, 0.19, 0.25, 0.44, 0.5, 0.69, 0.75, 0.94, 1] as const;
const G5_SCALE = [1, 1, 0.9, 0.9, 0.8, 0.8, 0.9, 0.9, 1] as const;
const G5_SLOW = 0.4;
const G5_BURST = (Math.PI * 2 - G5_SLOW * 4) / 4;
const G5_SPIN = [
  0,
  G5_SLOW,
  G5_SLOW + G5_BURST,
  G5_SLOW * 2 + G5_BURST,
  G5_SLOW * 2 + G5_BURST * 2,
  G5_SLOW * 3 + G5_BURST * 2,
  G5_SLOW * 3 + G5_BURST * 3,
  G5_SLOW * 4 + G5_BURST * 3,
  Math.PI * 2,
] as const;

export function workingFamily(style: WorkingStyle): "helix" | "lattice" | "ring" {
  if (style.startsWith("C")) return "ring";
  if (style.startsWith("G")) return "helix";
  return "lattice";
}

export function pickWorkingStyle(random = Math.random()): WorkingStyle {
  const index = Math.min(
    WORKING_STYLES.length - 1,
    Math.max(0, Math.floor(random * WORKING_STYLES.length)),
  );
  return WORKING_STYLES[index] ?? "S1";
}

export function ringDurationMs(variant: RingVariant): number {
  switch (variant) {
    case "C1":
    case "C4":
      return 1600;
    case "C2":
      return 2000;
    case "C3":
    case "C5":
      return 1800;
  }
}

function ringDelayBaseMs(variant: RingVariant): number {
  return variant === "C5" ? 2200 : ringDurationMs(variant);
}

export function ringDelayMs(variant: RingVariant, index: number): number {
  const duration = ringDelayBaseMs(variant);
  if (variant === "C4") return index % 2 === 0 ? 0 : -(duration / 2);
  if (variant === "C5") {
    const scrambled = (index * 3) % RING_COUNT;
    return -(scrambled / RING_COUNT) * duration;
  }
  return -((RING_COUNT - 1 - index) / RING_COUNT) * duration;
}

export type RingDot = { delay: number; index: number; rx: number; ry: number };

export function ringDots(variant: RingVariant): RingDot[] {
  const dots: RingDot[] = [];
  for (let index = 0; index < RING_COUNT; index++) {
    const angle = (index / RING_COUNT) * Math.PI * 2 - Math.PI / 2;
    dots.push({
      delay: ringDelayMs(variant, index),
      index,
      rx: Math.cos(angle) * RING_RADIUS,
      ry: Math.sin(angle) * RING_RADIUS,
    });
  }
  return dots;
}

const COMET_EASE = [0.33, 1, 0.68, 1] as const;

export function ringSample(
  phase: number,
  variant: RingVariant,
  rest: number,
): { opacity: number; scale: number } {
  "worklet";
  const t = wrap01(phase);
  if (variant === "C1") {
    if (t <= 0.11) return { opacity: 1, scale: 1 };
    if (t >= 0.125) return { opacity: rest, scale: 1 };
    const u = (t - 0.11) / 0.015;
    return { opacity: 1 + (rest - 1) * u, scale: 1 };
  }
  if (variant === "C2") {
    if (t < 0.5) {
      const u = eased(t / 0.5, EASE_IN_OUT);
      return { opacity: 0.18 + 0.82 * u, scale: 0.7 + 0.45 * u };
    }
    const u = eased((t - 0.5) / 0.5, EASE_IN_OUT);
    return { opacity: 1 - 0.82 * u, scale: 1.15 - 0.45 * u };
  }
  if (variant === "C4") {
    if (t < 0.5) {
      const u = eased(t / 0.5, EASE_IN_OUT);
      return { opacity: 1 - 0.85 * u, scale: 1 };
    }
    const u = eased((t - 0.5) / 0.5, EASE_IN_OUT);
    return { opacity: 0.15 + 0.85 * u, scale: 1 };
  }
  if (t < 0.12) {
    const u = eased(t / 0.12, EASE_IN_OUT);
    return { opacity: 0.08 + 0.92 * u, scale: 1 };
  }
  if (t < 0.35) {
    const u = eased((t - 0.12) / 0.23, COMET_EASE);
    return { opacity: 1 - 0.5 * u, scale: 1 };
  }
  if (t < 0.6) {
    const u = eased((t - 0.35) / 0.25, EASE_IN_OUT);
    return { opacity: 0.5 - 0.38 * u, scale: 1 };
  }
  const u = eased((t - 0.6) / 0.4, EASE_IN_OUT);
  return { opacity: 0.12 - 0.04 * u, scale: 1 };
}

export function helixDurationMs(variant: HelixVariant): number {
  switch (variant) {
    case "G1":
      return 4500;
    case "G2":
    case "G5":
      return 3600;
    case "G3":
    case "G4":
      return 2800;
  }
}

const HELIX_LATS = [52, 26, 0, -26, -52] as const;

export type HelixDot = { index: number; ring: number; x: number; y: number; z: number };

export function helixDots(): HelixDot[] {
  const dots: HelixDot[] = [];
  let index = 0;
  for (let ring = 0; ring < HELIX_LATS.length; ring++) {
    const lat = ((HELIX_LATS[ring] ?? 0) * Math.PI) / 180;
    const y = Math.sin(lat) * HELIX_RADIUS;
    const ringR = Math.cos(lat) * HELIX_RADIUS;
    for (let dot = 0; dot < RING_COUNT; dot++) {
      const lon = (dot / RING_COUNT) * Math.PI * 2;
      dots.push({
        index,
        ring,
        x: Math.cos(lon) * ringR,
        y,
        z: Math.sin(lon) * ringR,
      });
      index += 1;
    }
  }
  return dots;
}

function projectGlobe(
  x: number,
  y: number,
  z: number,
  spin: number,
): { opacity: number; x: number; y: number } {
  "worklet";
  const cs = Math.cos(spin);
  const ss = Math.sin(spin);
  const x1 = x * cs - z * ss;
  const z1 = x * ss + z * cs;
  const ct = Math.cos(GLOBE_TILT);
  const st = Math.sin(GLOBE_TILT);
  const y1 = y * ct - z1 * st;
  const z2 = y * st + z1 * ct;
  const depth = Math.max(0, Math.min(1, (z2 / HELIX_RADIUS + 0.15) / 1.15));
  return { opacity: 0.12 + 0.88 * depth * depth, x: x1, y: -y1 };
}

function turnRing(variant: HelixVariant, move: number): number {
  "worklet";
  if (variant === "G4") {
    const rings = [2, 1, 3, 0, 4, 2, 1, 3, 0, 4];
    return rings[move] ?? 0;
  }
  return move % 5;
}

function turnPoint(
  dot: HelixDot,
  variant: HelixVariant,
  phase: number,
): { opacity: number; x: number; y: number } {
  "worklet";
  let x = dot.x;
  const y = dot.y;
  let z = dot.z;
  const moveIndex = Math.min(9, Math.floor(phase / 0.1));
  for (let move = 0; move < moveIndex; move++) {
    const ring = turnRing(variant, move);
    if (dot.ring !== ring) continue;
    const angle = (ring % 2 === 0 ? -1 : 1) * RING_TURN;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const nextX = x * c - z * s;
    z = x * s + z * c;
    x = nextX;
  }
  const local = phase - moveIndex * 0.1;
  const frac = local >= 0.075 ? 1 : local / 0.075;
  const ring = turnRing(variant, moveIndex);
  if (dot.ring === ring && frac > 0) {
    const angle = (ring % 2 === 0 ? -1 : 1) * RING_TURN * frac;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const nextX = x * c - z * s;
    z = x * s + z * c;
    x = nextX;
  }
  return projectGlobe(x, y, z, 0);
}

export function helixSample(
  dot: HelixDot,
  variant: HelixVariant,
  phase: number,
): { opacity: number; x: number; y: number } {
  "worklet";
  const t = wrap01(phase);
  if (variant === "G3" || variant === "G4") return turnPoint(dot, variant, t);
  if (variant === "G5") {
    let previous = 0;
    for (let stop = 1; stop < G5_STOPS.length; stop++) {
      const end = G5_STOPS[stop] ?? 1;
      if (t <= end) {
        const start = G5_STOPS[previous] ?? 0;
        const span = end - start;
        const u = span === 0 ? 1 : (t - start) / span;
        const scale =
          (G5_SCALE[previous] ?? 1) + ((G5_SCALE[stop] ?? 1) - (G5_SCALE[previous] ?? 1)) * u;
        const spin =
          (G5_SPIN[previous] ?? 0) + ((G5_SPIN[stop] ?? 0) - (G5_SPIN[previous] ?? 0)) * u;
        return projectGlobe(dot.x * scale, dot.y * scale, dot.z * scale, spin);
      }
      previous = stop;
    }
    return projectGlobe(dot.x, dot.y, dot.z, Math.PI * 2);
  }
  const dir = variant === "G2" && dot.ring % 2 === 1 ? -1 : 1;
  const step = t * 8;
  const index = Math.floor(step) % 8;
  const next = (index + 1) % 8;
  const u = step - Math.floor(step);
  const from = projectGlobe(dot.x, dot.y, dot.z, dir * (index / 8) * Math.PI * 2);
  const to = projectGlobe(dot.x, dot.y, dot.z, dir * (next / 8) * Math.PI * 2);
  return {
    opacity: from.opacity + (to.opacity - from.opacity) * u,
    x: from.x + (to.x - from.x) * u,
    y: from.y + (to.y - from.y) * u,
  };
}

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
