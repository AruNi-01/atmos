/**
 * Page-level handle look. Overlay stacking: position each page-level DOM layer
 * with OVERLAY_Z_INDEX above the canvas handles. Nested children live in the
 * payload / overlay tree, not as extra handles.
 *
 * Paper fill is interior-hittable (Excalidraw treats `transparent` as stroke-only)
 * so Edit pointer-down hits the Artist rectangle. Ink stays `#1e1e1e` on paper
 * in every theme — dark-canvas remap would hide the rough.js double-stroke.
 *
 * Excalidraw Artist = `ROUGHNESS.artist` (1): solid strokes keep
 * `disableMultiStroke: false` (two offset paths) and `preserveVertices` when
 * roughness < cartoonist (2). See packages/element/src/shape.ts.
 */
export const HANDLE_BACKGROUND = "#fffef7";
/** Excalidraw `STROKE_WIDTH.medium`. */
export const HANDLE_STROKE_WIDTH = 2;
export const HANDLE_INK = "#1e1e1e";
/** Dark-canvas default ink. Must not stay on paper-filled PT handles. */
export const HANDLE_THEME_INK = "#fafafa";
/** Artist corner: adaptive 12px, not Excalidraw's default 32px pill. */
export const HANDLE_ROUNDNESS = { type: 3, value: 12 } as const;
/** DOM overlay stacking above page-level handles. */
export const OVERLAY_Z_INDEX = 2;

/** Mirrors Excalidraw `isTransparent` so we never ship a fill it treats as empty. */
export function isExcalidrawTransparentFill(color: string | undefined): boolean {
  if (!color) return true;
  const isRGBTransparent = color.length === 5 && color.substr(4, 1) === "0";
  const isRRGGBBTransparent = color.length === 9 && color.substr(7, 2) === "00";
  return isRGBTransparent || isRRGGBBTransparent || color === "transparent";
}

function sketchSeed(id: string | undefined): number {
  const s = id ?? "pt";
  let n = 2166136261;
  for (let i = 0; i < s.length; i++) {
    n ^= s.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return (n >>> 0) % 2 ** 31 || 1;
}

export function prepareLiveHandle<T extends {
  id?: string;
  customData?: { pt?: unknown };
  backgroundColor?: string;
  locked?: boolean;
  roughness?: number;
  roundness?: { type: number; value?: number } | null;
  seed?: number;
  strokeColor?: string;
  strokeWidth?: number;
}>(el: T): T {
  if (!el.customData?.pt) return el;
  const hiddenStroke =
    !el.strokeWidth ||
    el.strokeColor === "transparent" ||
    isExcalidrawTransparentFill(el.strokeColor) ||
    el.strokeColor === HANDLE_THEME_INK;
  return {
    ...el,
    backgroundColor: HANDLE_BACKGROUND,
    locked: false,
    roughness: 1,
    roundness: HANDLE_ROUNDNESS,
    seed: el.seed && el.seed !== 1 ? el.seed : sketchSeed(el.id),
    strokeColor: hiddenStroke ? HANDLE_INK : el.strokeColor,
    strokeWidth: hiddenStroke ? HANDLE_STROKE_WIDTH : el.strokeWidth,
  };
}
