/**
 * Vendored Approval Card ink from `packages/ui/src/components/ui/approval-card.module.css`.
 * Light type is `#1a1a1a`. Dark type is `#f5f5f5`.
 * Quiet type is `#a1a1a1` in light and `#737373` in dark.
 * The plan summary is `#a3a3a3` in dark.
 */

export function approvalInk(isDark: boolean): string {
  return isDark ? "#f5f5f5" : "#1a1a1a";
}

export function approvalMuted(isDark: boolean): string {
  return isDark ? "#a3a3a3" : "#a1a1a1";
}

export function approvalQuiet(isDark: boolean): string {
  return isDark ? "#737373" : "#a1a1a1";
}

export function approvalCardFill(isDark: boolean): string {
  return isDark ? "#1a1a1a" : "#ffffff";
}

export function approvalWell(isDark: boolean): string {
  return isDark ? "#101010" : "#fafafa";
}

export function approvalGhostFill(isDark: boolean): string {
  return isDark ? "rgba(245, 245, 245, 0.06)" : "rgba(26, 26, 26, 0.06)";
}

export function approvalPrimaryFill(isDark: boolean): string {
  return isDark ? "#f5f5f5" : "#0b0d12";
}

export function approvalPrimaryInk(isDark: boolean): string {
  return isDark ? "#0a0a0a" : "#ffffff";
}

export function approvalKeyFill(isDark: boolean): string {
  return isDark ? "rgba(245, 245, 245, 0.06)" : "rgba(26, 26, 26, 0.06)";
}

export function approvalOptionSelectedFill(isDark: boolean): string {
  return isDark ? "#2a2a2a" : "#ffffff";
}

export function approvalShadow(isDark: boolean): string {
  return isDark
    ? "0 0 0 0.5px rgba(255, 255, 255, 0.12), 0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)"
    : "0 0 0 0.5px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.02)";
}

export const APPROVAL_OPTION_BORDER = "rgba(0, 0, 0, 0.08)";
export const APPROVAL_PLAN_ICON_LIGHT = "#15a06a";
export const APPROVAL_PLAN_ICON_DARK = "#34d399";
export const APPROVAL_PLAN_ICON_FILL_LIGHT = "#e3f4ed";
export const APPROVAL_PLAN_ICON_FILL_DARK = "#1d3029";
export const APPROVAL_QUESTION_ICON_LIGHT = "#3b82f6";
export const APPROVAL_QUESTION_ICON_DARK = "#60a5fa";
export const APPROVAL_QUESTION_ICON_FILL_LIGHT = "#e7f0fe";
export const APPROVAL_QUESTION_ICON_FILL_DARK = "#202d42";
export const APPROVAL_COMMAND_ICON_LIGHT = "#d98404";
export const APPROVAL_COMMAND_ICON_DARK = "#f5b14c";
export const APPROVAL_COMMAND_ICON_FILL_LIGHT = "#faeedc";
export const APPROVAL_COMMAND_ICON_FILL_DARK = "#392f21";
