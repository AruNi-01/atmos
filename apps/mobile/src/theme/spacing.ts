export const spacing = {
  screenX: 18,
  screenBottom: 36,
  screenFooterBottom: 16,
  screenFooterTop: 10,
  sectionGap: 20,
  sectionLabelGap: 8,
  sectionLabelX: 4,
  rowX: 18,
  rowY: 12,
  rowMinHeight: 64,
  rowGap: 4,
  rowTitleGap: 10,
  actionRowGap: 10,
  cardPadding: 16,
  separatorInset: 16,
  terminalHeaderX: 14,
  terminalHeaderMinHeight: 42,
  terminalChromeX: 8,
  terminalKeycapGap: 6,
} as const;

export type MobileSpacing = typeof spacing;
