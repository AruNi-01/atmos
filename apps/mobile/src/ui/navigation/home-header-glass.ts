/**
 * iOS 26 liquid glass treats an explicit near-white bar tint as a fill.
 * Dark mode label ink (`#f5f5f7`) turns the shared capsule into an opaque gray
 * plate. Light label ink stays, so light mode chrome is unchanged.
 */
const OPAQUE_GLASS_LUMINANCE = 0.72;

function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function isOpaqueGlassTint(color: string): boolean {
  const match = /^#([\da-f]{6})$/i.exec(color.trim());
  if (!match) return false;
  const hex = match[1] ?? "";
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
  return luminance >= OPAQUE_GLASS_LUMINANCE;
}
