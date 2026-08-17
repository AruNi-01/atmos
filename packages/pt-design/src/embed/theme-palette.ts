/**
 * Scene / IR stay on the light shadcn palette. Dark canvas only remaps for
 * display — Excalidraw's own canvas invert is disabled in excalidraw-theme.css.
 */
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
  "#18181b": "#fafafa",
  "#3f3f46": "#f4f4f5",
  "#a1a1aa": "#71717a",
  "#52525b": "#d4d4d8",
};

function norm(color: string): string {
  return color.trim().toLowerCase();
}

export function displayColor(color: string | undefined, theme: "light" | "dark"): string {
  if (!color || color === "transparent") return color ?? "transparent";
  if (theme === "light") return color;
  return TO_DARK[norm(color)] ?? color;
}

export function canonicalColor(color: string | undefined, theme: "light" | "dark"): string {
  if (!color || color === "transparent") return color ?? "transparent";
  if (theme === "light") return color;
  return FROM_DARK[norm(color)] ?? color;
}
