export const shadows = {
  glassPanelDark: "0 14px 42px rgba(0, 0, 0, 0.24)",
  glassPanelLight: "0 14px 42px rgba(10, 10, 11, 0.07)",
  segmentedSelectedDark: "0 1px 0 rgba(255, 255, 255, 0.04)",
  segmentedSelectedLight: "0 5px 14px rgba(10, 10, 11, 0.08)",
} as const;

export type MobileShadows = typeof shadows;
