/**
 * APP-081 token table. Theme files own the color values; this map names the phone roles
 * and the pinned text sizes (web `text-sm` / `text-xs`).
 */
export const agentChatTokenMap = {
  label: "text-foreground",
  secondaryLabel: "text-muted-foreground",
  cardSubtle: "bg-secondary",
  glassBorder: "border",
  red: "text-destructive",
  redSurface: "bg-destructive/5",
  redBorder: "text-destructive",
  yellow: "amber",
  textSm: { fontSize: 14, lineHeight: 20 },
  textXs: { fontSize: 12, lineHeight: 16 },
} as const;

export const agentChatTokenRoles = [
  "label",
  "secondaryLabel",
  "cardSubtle",
  "glassBorder",
  "red",
  "redSurface",
  "redBorder",
  "yellow",
] as const;
