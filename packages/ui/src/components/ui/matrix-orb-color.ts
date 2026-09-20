/**
 * Theme-aware colors for MatrixOrb.
 *
 * Hues are a golden-angle walk of `seed` so neighboring identities stay
 * distinct, then eased toward the active palette so a row of orbs still
 * reads as one family. Light/dark only change saturation and lightness —
 * never the original Rare UI orange default.
 */

export type MatrixOrbColorScheme = "light" | "dark";

export type MatrixOrbTheme = {
  scheme: MatrixOrbColorScheme;
  palette: string | null;
};

export type MatrixOrbColorOptions = {
  scheme?: MatrixOrbColorScheme;
  palette?: string | null;
};

/** Palette accent hues, in degrees. */
const PALETTE_HUE: Record<string, number> = {
  graphite: 215,
  indigo: 252,
  crimson: 8,
  sage: 158,
  amber: 48,
  violet: 286,
};

/**
 * How hard to pull the random hue toward the palette accent.
 * Graphite stays nearly a full rainbow; named palettes keep more of their
 * family while still allowing distinct colors per seed.
 */
const PALETTE_PULL: Record<string, number> = {
  graphite: 0.1,
  indigo: 0.36,
  crimson: 0.36,
  sage: 0.36,
  amber: 0.36,
  violet: 0.36,
};

const GOLDEN_ANGLE = 137.508;

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shortestHueDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function mixHue(raw: number, bias: number, pull: number): number {
  const clamped = Math.min(1, Math.max(0, pull));
  return (raw + shortestHueDelta(raw, bias) * clamped + 360) % 360;
}

export function readMatrixOrbTheme(
  root: Pick<Element, "classList" | "getAttribute"> | null,
  prefersDark = false,
): MatrixOrbTheme {
  if (!root) {
    return { scheme: prefersDark ? "dark" : "light", palette: null };
  }
  const scheme = root.classList.contains("dark")
    ? "dark"
    : root.classList.contains("light")
      ? "light"
      : prefersDark
        ? "dark"
        : "light";
  return {
    scheme,
    palette: root.getAttribute("data-palette"),
  };
}

export function matrixOrbColor(
  seed: string,
  options: MatrixOrbColorOptions = {},
): string {
  const hash = hashString(seed);
  const palette = options.palette && options.palette in PALETTE_HUE
    ? options.palette
    : "graphite";
  const raw = (hash * GOLDEN_ANGLE) % 360;
  const hue = mixHue(
    raw,
    PALETTE_HUE[palette] ?? PALETTE_HUE.graphite,
    PALETTE_PULL[palette] ?? PALETTE_PULL.graphite,
  );
  const satJitter = hash % 8;
  const lightJitter = (hash >>> 8) % 6;
  const muted = palette === "graphite";
  const scheme = options.scheme === "dark" ? "dark" : "light";

  if (scheme === "dark") {
    const saturation = (muted ? 52 : 60) + satJitter;
    const lightness = (muted ? 66 : 62) + lightJitter;
    return `hsl(${hue.toFixed(1)}, ${saturation}%, ${lightness}%)`;
  }

  const saturation = (muted ? 58 : 66) + satJitter;
  const lightness = (muted ? 44 : 42) + lightJitter;
  return `hsl(${hue.toFixed(1)}, ${saturation}%, ${lightness}%)`;
}

/** Denser grids collapse at indicator size; 5 dots still read as a round orb. */
export function matrixOrbDotsForSize(size: number): number {
  if (size <= 24) return 5;
  if (size <= 40) return 7;
  return 11;
}

/** Geometry tuned so a 20px glyph still fills its box. */
export function matrixOrbLayout(size: number): { occupancy: number; radiusFactor: number } {
  if (size <= 28) return { occupancy: 0.9, radiusFactor: 0.74 };
  return { occupancy: 0.74, radiusFactor: 0.6 };
}
