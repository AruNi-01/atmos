/**
 * Opaque fill of the shortcut bar. Edge masks must fade from this exact color
 * so they dissolve into the bar instead of painting a black strip on top.
 */
export const TERMINAL_SHORTCUT_BAR_COLOR = "#2c2c2e";

export function shortcutEdgeFade(side: "left" | "right", color = TERMINAL_SHORTCUT_BAR_COLOR): string {
  const direction = side === "left" ? "to right" : "to left";
  const transparent = hexToTransparent(color);
  return `linear-gradient(${direction}, ${color} 0%, ${transparent} 100%)`;
}

function hexToTransparent(hex: string): string {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, 0)`;
}
