/**
 * Keep the last overview for display while a Computer / All switch is in
 * flight. Do not keep it after the active query fails — that would show
 * another Computer's numbers as if they belonged to the new scope.
 */
export function displayedOverview<T>(input: {
  active: T | null | undefined;
  failed: boolean;
  pending: boolean;
  previous: T | null;
}): T | null {
  if (input.active != null) return input.active;
  if (input.failed || !input.pending) return null;
  return input.previous;
}

/** Publish may only snapshot data confirmed for the active query key. */
export function publishOverview<T>(active: T | null | undefined): T | null {
  return active ?? null;
}
