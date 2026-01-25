// ATMOS Terminal Theme - Dark Mode
// Inspired by modern terminal aesthetics with a focus on readability

import type { ITheme } from "@xterm/xterm";

export const atmosDarkTheme: ITheme = {
  // Background and foreground
  background: "#00000000", // Transparent background to show container color
  foreground: "#f8f8f8", // Brighter foreground for better contrast
  cursor: "#60a5fa", // Lighter blue cursor
  cursorAccent: "#111827",


  // Selection
  selectionBackground: "#264f78",
  selectionForeground: "#ffffff",
  selectionInactiveBackground: "#264f7880",

  // ANSI Colors (Normal)
  black: "#484f58",
  red: "#ff7b72",
  green: "#7ee787",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#b1bac4",

  // ANSI Colors (Bright)
  brightBlack: "#6e7681",
  brightRed: "#ffa198",
  brightGreen: "#a5d6ff",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#f0f6fc",
};

export const atmosLightTheme: ITheme = {
  // Background and foreground
  background: "#ffffff",
  foreground: "#24292f",
  cursor: "#0969da",
  cursorAccent: "#ffffff",

  // Selection
  selectionBackground: "#0969da33",
  selectionForeground: "#24292f",
  selectionInactiveBackground: "#0969da1a",

  // ANSI Colors (Normal)
  black: "#24292f",
  red: "#cf222e",
  green: "#1a7f37",
  yellow: "#9a6700",
  blue: "#0969da",
  magenta: "#8250df",
  cyan: "#1b7c83",
  white: "#6e7781",

  // ANSI Colors (Bright)
  brightBlack: "#57606a",
  brightRed: "#a40e26",
  brightGreen: "#2da44e",
  brightYellow: "#bf8700",
  brightBlue: "#218bff",
  brightMagenta: "#a475f9",
  brightCyan: "#3192aa",
  brightWhite: "#8c959f",
};

// Terminal font configuration
export const terminalFont = {
  family:
    '"JetBrains Mono", "Fira Code", "SF Mono", Monaco, "Cascadia Code", Menlo, Consolas, "Liberation Mono", monospace',
  size: 14,
  lineHeight: 1.2,
  letterSpacing: 0,
};

// Default terminal options
export const defaultTerminalOptions = {
  allowProposedApi: true,
  allowTransparency: true,
  convertEol: true,
  cursorBlink: true,
  cursorStyle: "bar" as const,
  cursorWidth: 2,
  fontFamily: terminalFont.family,
  fontSize: terminalFont.size,
  lineHeight: terminalFont.lineHeight,
  letterSpacing: terminalFont.letterSpacing,
  scrollback: 10000,
  smoothScrollDuration: 100,
  theme: atmosDarkTheme,
  minimumContrastRatio: 4.5,
};
