export function basenameFromPath(path: string | null | undefined): string | undefined {
  const normalized = path?.trim().replace(/[\\/]+$/, '');
  if (!normalized) return undefined;

  return normalized.split(/[\\/]/).filter(Boolean).pop();
}
