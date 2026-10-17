/**
 * Web `ComposerFilePill` on a user message (`AgentComposerAttachmentList`).
 * The transcript row has no remove button, so both ends use `pl-2.5` / `pr-2.5`.
 * Compact is `h-7 text-xs`; expanded is `h-8 text-[13px]` with the `text-sm` line height.
 * `--muted` at 40% is the fill. `--border` at 70% is the 1px rule.
 * The label is `--foreground` at 90%. The glyph is `--muted-foreground`.
 */

export const USER_ATTACHMENT_CHIP_RADIUS = 999;
export const USER_ATTACHMENT_ICON_PX = 14;
export const USER_ATTACHMENT_GAP = 6;
export const USER_ATTACHMENT_MAX_WIDTH = 256;
export const USER_ATTACHMENT_PAD_X = 10;

export const USER_ATTACHMENT_FILL_LIGHT = "rgba(222, 222, 224, 0.4)";
export const USER_ATTACHMENT_FILL_DARK = "rgba(39, 39, 42, 0.4)";
export const USER_ATTACHMENT_BORDER_LIGHT = "rgba(0, 0, 0, 0.07)";
export const USER_ATTACHMENT_BORDER_DARK = "rgba(255, 255, 255, 0.07)";
export const USER_ATTACHMENT_LABEL_LIGHT = "rgba(9, 9, 11, 0.9)";
export const USER_ATTACHMENT_LABEL_DARK = "rgba(250, 250, 250, 0.9)";
export const USER_ATTACHMENT_ICON_LIGHT = "#71717b";
export const USER_ATTACHMENT_ICON_DARK = "#9f9fa9";

export type UserAttachmentDensity = "compact" | "composer";

export function userAttachmentDensity(expanded: boolean): UserAttachmentDensity {
  return expanded ? "composer" : "compact";
}

export function userAttachmentListGap(density: UserAttachmentDensity): number {
  return density === "compact" ? 6 : 8;
}

export function userAttachmentChipMetrics(density: UserAttachmentDensity): {
  fontSize: number;
  height: number;
  lineHeight: number;
} {
  if (density === "compact") return { fontSize: 12, height: 28, lineHeight: 16 };
  return { fontSize: 13, height: 32, lineHeight: 20 };
}

export function userAttachmentFill(isDark: boolean): string {
  return isDark ? USER_ATTACHMENT_FILL_DARK : USER_ATTACHMENT_FILL_LIGHT;
}

export function userAttachmentBorder(isDark: boolean): string {
  return isDark ? USER_ATTACHMENT_BORDER_DARK : USER_ATTACHMENT_BORDER_LIGHT;
}

export function userAttachmentLabelColor(isDark: boolean): string {
  return isDark ? USER_ATTACHMENT_LABEL_DARK : USER_ATTACHMENT_LABEL_LIGHT;
}

export function userAttachmentIconColor(isDark: boolean): string {
  return isDark ? USER_ATTACHMENT_ICON_DARK : USER_ATTACHMENT_ICON_LIGHT;
}
