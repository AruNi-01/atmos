import { CanvasAgentError } from "./canvas-agent-errors";

/** tldraw v5 `DefaultColorStyle` values (geo / arrow / draw). */
export const TLDRAW_COLORS = [
  "black",
  "grey",
  "light-violet",
  "violet",
  "blue",
  "light-blue",
  "yellow",
  "orange",
  "green",
  "light-green",
  "light-red",
  "red",
  "white",
] as const;

export type TldrawColor = (typeof TLDRAW_COLORS)[number];

const COLOR_SET = new Set<string>(TLDRAW_COLORS);

/** Agent / model aliases → supported tldraw token. */
const COLOR_ALIASES: Record<string, TldrawColor> = {
  "light-orange": "orange",
  "light-yellow": "yellow",
  "light-blue": "light-blue",
  "light-green": "light-green",
  "light-red": "light-red",
  "light-violet": "light-violet",
  gray: "grey",
  "light-gray": "grey",
  "light-grey": "grey",
};

export const TLDRAW_FILLS = ["none", "semi", "solid", "pattern", "fill"] as const;
export type TldrawFill = (typeof TLDRAW_FILLS)[number];
const FILL_SET = new Set<string>(TLDRAW_FILLS);

const FILL_ALIASES: Record<string, TldrawFill> = {
  filled: "solid",
  fill: "fill",
  transparent: "none",
  outline: "none",
};

export const TLDRAW_SIZES = ["s", "m", "l", "xl"] as const;
export type TldrawSize = (typeof TLDRAW_SIZES)[number];
const SIZE_SET = new Set<string>(TLDRAW_SIZES);

export function sanitizeTldrawColor(
  raw: string,
  label = "color",
): { value: TldrawColor; normalized: boolean } {
  const key = raw.trim().toLowerCase();
  const mapped = COLOR_ALIASES[key] ?? key;
  if (COLOR_SET.has(mapped)) {
    return { value: mapped as TldrawColor, normalized: mapped !== key };
  }
  throw new CanvasAgentError(
    "VALIDATION_ARG",
    `${label} must be one of: ${TLDRAW_COLORS.join(", ")} (got "${raw}")`,
    true,
  );
}

export function sanitizeTldrawFill(
  raw: string,
  label = "fill",
): { value: TldrawFill; normalized: boolean } {
  const key = raw.trim().toLowerCase();
  const mapped = FILL_ALIASES[key] ?? key;
  if (FILL_SET.has(mapped)) {
    return { value: mapped as TldrawFill, normalized: mapped !== key };
  }
  throw new CanvasAgentError(
    "VALIDATION_ARG",
    `${label} must be one of: ${TLDRAW_FILLS.join(", ")} (got "${raw}")`,
    true,
  );
}

export function sanitizeTldrawSize(raw: string, label = "size"): TldrawSize {
  const key = raw.trim().toLowerCase();
  if (SIZE_SET.has(key)) return key as TldrawSize;
  throw new CanvasAgentError(
    "VALIDATION_ARG",
    `${label} must be one of: ${TLDRAW_SIZES.join(", ")} (got "${raw}")`,
    true,
  );
}

export function applyOptionalColor(
  props: Record<string, unknown>,
  raw: string | undefined,
): void {
  if (!raw) return;
  const { value } = sanitizeTldrawColor(raw);
  props.color = value;
}

export function applyOptionalFill(
  props: Record<string, unknown>,
  raw: string | undefined,
): void {
  if (!raw) return;
  const { value } = sanitizeTldrawFill(raw);
  props.fill = value;
}

export function applyOptionalSize(
  props: Record<string, unknown>,
  raw: string | undefined,
): void {
  if (!raw) return;
  props.size = sanitizeTldrawSize(raw);
}
