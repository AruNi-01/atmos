/** shadcn-style corner scale. `default` on a node follows the persisted global token. */
export const PT_RADIUS_TOKENS = ["none", "sm", "md", "lg"] as const;
export type PtRadiusToken = (typeof PT_RADIUS_TOKENS)[number];
export type PtRadiusChoice = "default" | PtRadiusToken;

export const PT_RADIUS_DEFAULT: PtRadiusToken = "sm";

export const PT_RADIUS_NODE_OPTIONS: { id: PtRadiusChoice; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "none", label: "None" },
  { id: "sm", label: "Small" },
  { id: "md", label: "Medium" },
  { id: "lg", label: "Large" },
];

export const PT_RADIUS_GLOBAL_OPTIONS = PT_RADIUS_NODE_OPTIONS.filter(
  (option): option is { id: PtRadiusToken; label: string } => option.id !== "default",
);

/** Inner chrome (cards, fields, menus). Small matches the current sketch 3px look. */
const INNER_PX: Record<PtRadiusToken, number> = {
  none: 0,
  sm: 3,
  md: 8,
  lg: 14,
};

/** Page-level Artist handle + nested button frames. Small matches HANDLE_ROUNDNESS 12. */
const HANDLE_PX: Record<PtRadiusToken, number> = {
  none: 0,
  sm: 12,
  md: 18,
  lg: 28,
};

export function isRadiusToken(value: unknown): value is PtRadiusToken {
  return value === "none" || value === "sm" || value === "md" || value === "lg";
}

export function parseRadiusToken(value: unknown, fallback: PtRadiusToken = PT_RADIUS_DEFAULT): PtRadiusToken {
  return isRadiusToken(value) ? value : fallback;
}

export function radiusChoiceOf(value: unknown): PtRadiusChoice {
  if (value === "default" || isRadiusToken(value)) return value;
  return "default";
}

export function resolveRadiusChoice(value: unknown, global: PtRadiusToken): PtRadiusToken {
  const choice = radiusChoiceOf(value);
  return choice === "default" ? global : choice;
}

export function radiusInnerPx(token: PtRadiusToken): number {
  return INNER_PX[token];
}

export function radiusHandlePx(token: PtRadiusToken): number {
  return HANDLE_PX[token];
}

export function radiusHandleRoundness(token: PtRadiusToken): { type: 3; value: number } {
  return { type: 3, value: radiusHandlePx(token) };
}

export function radiusInnerCss(token: PtRadiusToken = PT_RADIUS_DEFAULT): string {
  return `${radiusInnerPx(token)}px`;
}
