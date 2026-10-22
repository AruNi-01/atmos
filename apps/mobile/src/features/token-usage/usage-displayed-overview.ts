/** Keep the last overview while a Computer / All switch is in flight. */
export function displayedOverview<T>(active: T | null | undefined, previous: T | null): T | null {
  return active ?? previous;
}
