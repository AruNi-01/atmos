export const SIDEBAR_TIME_GROUP_KEYS = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "older",
] as const;

export type SidebarTimeGroupKey = (typeof SIDEBAR_TIME_GROUP_KEYS)[number];

function startOfDay(input: Date): Date {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate());
}

/** Same day buckets the workspace sidebar uses for Group By time. */
export function sidebarTimeGroupKey(source: Date, now = new Date()): SidebarTimeGroupKey {
  const today = startOfDay(now).getTime();
  const sourceDay = startOfDay(source).getTime();
  const diffDays = Math.floor((today - sourceDay) / 86400000);

  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return "last_7_days";
  if (diffDays < 30) return "last_30_days";
  return "older";
}
