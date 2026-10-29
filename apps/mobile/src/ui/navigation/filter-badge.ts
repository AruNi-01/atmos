export type FilterBadgeColors = {
  backgroundColor: string;
  color: string;
};

/** Count shown on the filter button. Blank when nothing is selected. */
export function filterBadgeValue(count: number): number | string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : count;
}
