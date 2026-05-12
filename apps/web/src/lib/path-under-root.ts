/**
 * Normalize a directory root for prefix checks (trim trailing slashes).
 * A lone "/" stays as "/" so we can treat filesystem root explicitly.
 */
function normalizeDirectoryRoot(rootPath: string): string | null {
  if (!rootPath) return null;
  const trimmed = rootPath.replace(/\/+$/, '');
  if (trimmed === '' && rootPath.startsWith('/')) return '/';
  return trimmed || null;
}

/**
 * If `filePath` is exactly `rootPath` or a proper descendant (next segment boundary),
 * return the relative path under that root; otherwise `null`.
 * Avoids treating `/repo` as an ancestor of `/repo2/...`.
 */
export function tryRelativePathUnderRoot(filePath: string, rootPath: string): string | null {
  const root = normalizeDirectoryRoot(rootPath);
  if (root == null) return null;

  if (root === '/') {
    if (!filePath.startsWith('/')) return null;
    if (filePath === '/' || filePath === '') return '';
    return filePath.replace(/^\/+/, '');
  }

  if (filePath === root) return '';
  if (!filePath.startsWith(`${root}/`)) return null;
  return filePath.slice(root.length + 1);
}
