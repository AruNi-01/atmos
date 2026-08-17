/**
 * Scene / IR stay on the light shadcn palette. Dark canvas only remaps for
 * display — Excalidraw's own canvas invert is disabled in excalidraw-theme.css.
 */

/** Excalidraw's built-in default stroke / text ink. */
export const EXCALIDRAW_DEFAULT_STROKE = "#1e1e1e";
/** Visible default ink on the Atmos dark canvas. Not a CSS invert. */
export const ATMOS_DARK_DEFAULT_STROKE = "#fafafa";
export const DEFAULT_FILL = "transparent";

export function defaultStrokeColor(theme: "light" | "dark"): string {
  return theme === "dark" ? ATMOS_DARK_DEFAULT_STROKE : EXCALIDRAW_DEFAULT_STROKE;
}

export function isDefaultStrokeColor(color: string | undefined): boolean {
  const value = color?.trim().toLowerCase() ?? "";
  return (
    value === "" ||
    value === EXCALIDRAW_DEFAULT_STROKE ||
    value === ATMOS_DARK_DEFAULT_STROKE ||
    value === "#000000" ||
    value === "#000"
  );
}

/** Theme default ink, or `undefined` when `current` is already a custom color. */
export function resolveDrawingStrokeColor(
  theme: "light" | "dark",
  current: string | undefined,
): string | undefined {
  if (!isDefaultStrokeColor(current)) return undefined;
  const desired = defaultStrokeColor(theme);
  if (norm(current ?? "") === norm(desired)) return undefined;
  return desired;
}

export function applyThemeInkToElements<T extends { strokeColor?: string }>(
  elements: readonly T[],
  theme: "light" | "dark",
): readonly T[] {
  let changed = false;
  const next = elements.map((el) => {
    const stroke = resolveDrawingStrokeColor(theme, el.strokeColor);
    if (!stroke) return el;
    changed = true;
    return { ...el, strokeColor: stroke };
  });
  return changed ? next : elements;
}

export function drawingAppState(theme: "light" | "dark"): {
  currentItemStrokeColor: string;
  currentItemBackgroundColor: string;
  isBindingEnabled: boolean;
  objectsSnapModeEnabled: boolean;
} {
  return {
    // New shapes read this directly. Dark must be light ink — scene remaps
    // do not run on the in-progress stroke.
    currentItemStrokeColor: defaultStrokeColor(theme),
    currentItemBackgroundColor: DEFAULT_FILL,
    isBindingEnabled: true,
    objectsSnapModeEnabled: true,
  };
}

const TO_DARK: Record<string, string> = {
  "#18181b": "#f4f4f5",
  "#ffffff": "#2e2e33",
  "#fafafa": "#18181b",
  "#f4f4f5": "#3f3f46",
  "#71717a": "#a1a1aa",
  "#d4d4d8": "#52525b",
  "#e4e4e7": "#3f3f46",
  "#a1a1aa": "#a1a1aa",
  "#fff1f2": "#fff1f2",
};

const FROM_DARK: Record<string, string> = {
  "#f4f4f5": "#18181b",
  "#2e2e33": "#ffffff",
  "#242428": "#ffffff",
  "#09090b": "#ffffff",
  "#18181b": "#fafafa",
  "#3f3f46": "#f4f4f5",
  "#a1a1aa": "#71717a",
  "#52525b": "#d4d4d8",
};

function norm(color: string): string {
  return color.trim().toLowerCase();
}

export function displayInk(color: string | undefined, theme: "light" | "dark"): string {
  if (!color || color === "transparent") return color ?? "transparent";
  if (theme === "light") return color;
  const value = norm(color);
  if (value === EXCALIDRAW_DEFAULT_STROKE || value === "#000000" || value === "#000") {
    return ATMOS_DARK_DEFAULT_STROKE;
  }
  return color;
}

export function canonicalInk(color: string | undefined, theme: "light" | "dark"): string {
  if (!color || color === "transparent") return color ?? "transparent";
  if (theme === "light") return color;
  if (norm(color) === ATMOS_DARK_DEFAULT_STROKE) return EXCALIDRAW_DEFAULT_STROKE;
  return color;
}

export function displayColor(color: string | undefined, theme: "light" | "dark"): string {
  if (!color || color === "transparent") return color ?? "transparent";
  if (theme === "light") return color;
  return TO_DARK[norm(color)] ?? displayInk(color, theme);
}

export function canonicalColor(color: string | undefined, theme: "light" | "dark"): string {
  if (!color || color === "transparent") return color ?? "transparent";
  if (theme === "light") return color;
  return FROM_DARK[norm(color)] ?? canonicalInk(color, theme);
}
