export const typography = {
  heroTitle: {
    fontSize: 28,
    fontWeight: "700" as const,
    lineHeight: 34,
    letterSpacing: -0.4,
  },
  heroSubtitle: {
    fontSize: 16,
    fontWeight: "400" as const,
    lineHeight: 22,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: "400" as const,
    lineHeight: 19,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    lineHeight: 18,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    lineHeight: 21,
  },
  rowSubtitle: {
    fontSize: 13,
    fontWeight: "400" as const,
    lineHeight: 19,
  },
  rowMeta: {
    fontSize: 13,
    fontWeight: "400" as const,
    lineHeight: 18,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    lineHeight: 22,
  },
  emptyMessage: {
    fontSize: 14,
    fontWeight: "400" as const,
    lineHeight: 20,
  },
  body: {
    fontSize: 14,
    fontWeight: "400" as const,
    lineHeight: 20,
  },
  controlLabel: {
    fontSize: 14,
    fontWeight: "700" as const,
    lineHeight: 18,
  },
} as const;

export type MobileTypography = typeof typography;
