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
  background: "#0b0f14",
  black: "#0b0f14",
  blue: "#7dd3fc",
  brightBlack: "#5f6b7a",
  brightBlue: "#93c5fd",
  brightCyan: "#67e8f9",
  brightGreen: "#86efac",
  brightMagenta: "#f0abfc",
  brightRed: "#fca5a5",
  brightWhite: "#f8fafc",
  brightYellow: "#fde68a",
  cursor: "#f8fafc",
  cursorAccent: "#0b0f14",
  cyan: "#22d3ee",
  foreground: "#d8dee9",
  green: "#34d399",
  magenta: "#e879f9",
  red: "#f87171",
  selectionBackground: "#164e63",
  white: "#e5e7eb",
  yellow: "#fbbf24",
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
