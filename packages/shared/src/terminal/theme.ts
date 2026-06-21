export type TerminalThemeTokens = {
  background: string;
  black: string;
  blue: string;
  brightBlack: string;
  brightBlue: string;
  brightCyan: string;
  brightGreen: string;
  brightMagenta: string;
  brightRed: string;
  brightWhite: string;
  brightYellow: string;
  cursor: string;
  cursorAccent: string;
  cyan: string;
  foreground: string;
  green: string;
  magenta: string;
  red: string;
  selectionBackground: string;
  white: string;
  yellow: string;
};

export const terminalDarkTheme: TerminalThemeTokens = {
  background: "#09090b",
  black: "#484f58",
  blue: "#58a6ff",
  brightBlack: "#6e7681",
  brightBlue: "#79c0ff",
  brightCyan: "#56d4dd",
  brightGreen: "#a5d6ff",
  brightMagenta: "#d2a8ff",
  brightRed: "#ffa198",
  brightWhite: "#f0f6fc",
  brightYellow: "#e3b341",
  cursor: "#f8f8f8",
  cursorAccent: "#09090b",
  cyan: "#39c5cf",
  foreground: "#f8f8f8",
  green: "#7ee787",
  magenta: "#bc8cff",
  red: "#ff7b72",
  selectionBackground: "#264f78",
  white: "#b1bac4",
  yellow: "#d29922",
};

export const terminalLightTheme: TerminalThemeTokens = {
  background: "#f8fafc",
  black: "#111827",
  blue: "#2563eb",
  brightBlack: "#64748b",
  brightBlue: "#1d4ed8",
  brightCyan: "#0e7490",
  brightGreen: "#15803d",
  brightMagenta: "#a21caf",
  brightRed: "#b91c1c",
  brightWhite: "#0f172a",
  brightYellow: "#a16207",
  cursor: "#111827",
  cursorAccent: "#f8fafc",
  cyan: "#0891b2",
  foreground: "#111827",
  green: "#16a34a",
  magenta: "#c026d3",
  red: "#dc2626",
  selectionBackground: "#cbd5e1",
  white: "#334155",
  yellow: "#ca8a04",
};

export const terminalTheme = terminalLightTheme;
