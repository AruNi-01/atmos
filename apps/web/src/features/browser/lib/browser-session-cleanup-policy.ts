export function omitPreviewBrowserContext<T extends { byContext: Record<string, unknown> }>(
  prefs: T,
  browserContextId: string,
): T {
  if (!(browserContextId in prefs.byContext)) return prefs;
  const next = { ...prefs.byContext };
  delete next[browserContextId];
  return { ...prefs, byContext: next };
}

export function sessionIdsForBrowserContext(
  bySession: Record<string, { contextId: string }>,
  browserContextId: string,
): string[] {
  return Object.entries(bySession)
    .filter(([, binding]) => binding.contextId === browserContextId)
    .map(([sessionId]) => sessionId);
}
