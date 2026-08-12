export const radii = {
  card: 24,
  cardNested: 18,
  control: 28,
  iconWell: 16,
  pill: 999,
  terminalChrome: 23,
  terminalKeycap: 13,
} as const;

export type MobileRadii = typeof radii;
