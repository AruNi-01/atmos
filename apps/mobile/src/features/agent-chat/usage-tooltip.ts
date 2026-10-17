/**
 * Web `MessageTurnUsageBadge` tooltip: `bg-foreground` fill, `text-background` type,
 * `rounded-md` (8px), `w-52` (208px), `p-3`, and `bg-background/20` rules.
 * `TooltipContent` uses `side="top"` and the default `sideOffset` of 4, so the card
 * sits above the badge and the arrow points down.
 * Light foreground is `#09090b` and dark foreground is `#fafafa`.
 * Light background is white. Dark background is `#09090b`.
 */

export const USAGE_TOOLTIP_WIDTH = 208;
export const USAGE_TOOLTIP_RADIUS = 8;
export const USAGE_TOOLTIP_PAD = 12;
export const USAGE_TOOLTIP_GAP = 6;
export const USAGE_TOOLTIP_OFFSET = 4;
export const USAGE_TOOLTIP_ARROW = 10;

export function usageTooltipFill(isDark: boolean): string {
  return isDark ? "#fafafa" : "#09090b";
}

export function usageTooltipText(isDark: boolean): string {
  return isDark ? "#09090b" : "#ffffff";
}

export function usageTooltipRule(isDark: boolean): string {
  return isDark ? "rgba(9, 9, 11, 0.2)" : "rgba(255, 255, 255, 0.2)";
}
