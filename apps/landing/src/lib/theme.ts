export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = Exclude<Theme, "system">;

export const THEME_STORAGE_KEY = "theme";
export const DEFAULT_THEME: Theme = "system";
export const RESOLVED_THEMES: ResolvedTheme[] = ["light", "dark"];

export const THEME_INIT_SCRIPT = `
(() => {
  const root = document.documentElement;
  try {
    let storedTheme = null;
    try {
      storedTheme = window.localStorage.getItem("${THEME_STORAGE_KEY}");
    } catch {}

    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = storedTheme === "light" || storedTheme === "dark"
      ? storedTheme
      : storedTheme === "system"
        ? (systemDark ? "dark" : "light")
        : (systemDark ? "dark" : "light");

    root.classList.remove("light", "dark");
    root.classList.add(theme);
    root.style.colorScheme = theme;
  } catch {}
})();
`;
