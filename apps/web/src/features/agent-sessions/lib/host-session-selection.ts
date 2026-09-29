export type HostSessionArchiveAction = "archive" | "unarchive" | "mixed" | "empty";

export function sessionIsArchived(session: { archived?: boolean }): boolean {
  return session.archived === true;
}

export function hostSessionArchiveAction(
  keys: readonly string[],
  isArchived: (key: string) => boolean,
): HostSessionArchiveAction {
  if (keys.length === 0) return "empty";
  let archived = 0;
  for (const key of keys) {
    if (isArchived(key)) archived += 1;
  }
  if (archived === 0) return "archive";
  if (archived === keys.length) return "unarchive";
  return "mixed";
}

/** Select every visible key, or clear them when they are already selected. */
export function nextHostSessionSelection(
  selected: ReadonlySet<string>,
  visibleKeys: readonly string[],
): Set<string> {
  if (visibleKeys.length === 0) return new Set();
  const allSelected = visibleKeys.every((key) => selected.has(key));
  return allSelected ? new Set() : new Set(visibleKeys);
}
