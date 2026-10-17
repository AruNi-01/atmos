/**
 * Web `AssistantTurnFileChanges`: `rounded-xl`, `border-border`, `bg-muted/40`.
 * `--radius` is 10px, so `rounded-xl` is 14px.
 * `--muted` is `oklch(0.9 0.004 286)` / `oklch(0.274 0.006 286.033)`, at 40%.
 * `--border` is black or white at 10%.
 */
export const TURN_FILES_RADIUS = 14;
export const TURN_FILES_FILL_LIGHT = "rgba(222, 222, 224, 0.4)";
export const TURN_FILES_FILL_DARK = "rgba(39, 39, 42, 0.4)";
export const TURN_FILES_BORDER_LIGHT = "rgba(0, 0, 0, 0.1)";
export const TURN_FILES_BORDER_DARK = "rgba(255, 255, 255, 0.1)";
/** Web file card `mt-3` (12). The assistant column does not add a second gap. */
export const TURN_FILES_MARGIN_TOP = 12;
/** Web file list `max-h-44` (11rem). */
export const TURN_FILES_MAX_HEIGHT = 176;
/** Web scroll fade `--fade-size: 1.5rem`. */
export const TURN_FILES_FADE = 24;

type Rgb = { r: number; g: number; b: number; a: number };

function parseColor(value: string): Rgb | null {
  const hex = /^#([\da-f]{6})$/i.exec(value.trim());
  const raw = hex?.[1];
  if (raw) {
    return {
      r: Number.parseInt(raw.slice(0, 2), 16),
      g: Number.parseInt(raw.slice(2, 4), 16),
      b: Number.parseInt(raw.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(
    value.trim(),
  );
  if (!rgba) return null;
  return {
    r: Number(rgba[1]),
    g: Number(rgba[2]),
    b: Number(rgba[3]),
    a: rgba[4] == null ? 1 : Number(rgba[4]),
  };
}

/** Paint `foreground` over `background`. The file-card fade uses the resulting solid. */
export function compositeOver(foreground: string, background: string): string {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return foreground;
  const alpha = fg.a + bg.a * (1 - fg.a);
  if (alpha <= 0) return foreground;
  const channel = (front: number, back: number) =>
    Math.round((front * fg.a + back * bg.a * (1 - fg.a)) / alpha);
  return `rgb(${channel(fg.r, bg.r)}, ${channel(fg.g, bg.g)}, ${channel(fg.b, bg.b)})`;
}

/** Web fade length is the overflow, capped at `--fade-size`. */
export function turnFilesFadePx(overflowPx: number): number {
  if (!Number.isFinite(overflowPx) || overflowPx <= 0) return 0;
  return Math.min(TURN_FILES_FADE, overflowPx);
}

/** Same-hue clear stop. `transparent` is rgba(0,0,0,0) and turns a light fade gray. */
export function turnFilesFadeClear(solid: string): string {
  const match = /^rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(solid.trim());
  if (!match) return solid;
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, 0)`;
}

export function turnFilesFill(isDark: boolean): string {
  return isDark ? TURN_FILES_FILL_DARK : TURN_FILES_FILL_LIGHT;
}

export function turnFilesBorder(isDark: boolean): string {
  return isDark ? TURN_FILES_BORDER_DARK : TURN_FILES_BORDER_LIGHT;
}
