export const ORBIT_THEME_MODES = ["light", "dark", "system"] as const;
export type OrbitThemeMode = (typeof ORBIT_THEME_MODES)[number];

export const ORBIT_THEME_PALETTES = [
  "graphite",
  "indigo",
  "crimson",
  "sage",
  "amber",
  "violet",
] as const;
export type OrbitThemePalette = (typeof ORBIT_THEME_PALETTES)[number];

export function isOrbitThemePalette(value: unknown): value is OrbitThemePalette {
  return (
    typeof value === "string" &&
    (ORBIT_THEME_PALETTES as readonly string[]).includes(value)
  );
}
