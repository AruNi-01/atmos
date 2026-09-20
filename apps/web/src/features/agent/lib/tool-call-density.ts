export const TOOL_CALL_DENSITY_LEVELS = ["compact", "standard", "detailed"] as const;

export type ToolCallDensity = (typeof TOOL_CALL_DENSITY_LEVELS)[number];

export const DEFAULT_TOOL_CALL_DENSITY: ToolCallDensity = "compact";

export function normalizeToolCallDensity(value: unknown): ToolCallDensity {
  if (value === "compact" || value === "standard" || value === "detailed") return value;
  return DEFAULT_TOOL_CALL_DENSITY;
}

export function toolCallDensityIndex(density: ToolCallDensity): number {
  return TOOL_CALL_DENSITY_LEVELS.indexOf(density);
}

export function toolCallDensityFromIndex(index: number): ToolCallDensity {
  return TOOL_CALL_DENSITY_LEVELS[index] ?? DEFAULT_TOOL_CALL_DENSITY;
}

/** Map a 0–1 position along the density slider onto the nearest level. */
export function toolCallDensityIndexFromRatio(ratio: number): number {
  const max = TOOL_CALL_DENSITY_LEVELS.length - 1;
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.round(clamped * max);
}
