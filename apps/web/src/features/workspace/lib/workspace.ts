/**
 * Get workspace name without prefix
 * e.g., "aruni/pikachu" -> "pikachu"
 */
export function getWorkspaceShortName(name: string): string {
  const parts = name.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : name;
}
