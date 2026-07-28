import type { GitBlobLocator } from "@/api/ws-api-types";
import { getRuntimeApiConfig, httpBase } from "@/shared/lib/desktop-runtime";
import { resolveWorktreeAbsolutePath } from "@/features/diff/lib/diff-content-kind";

/**
 * Resolve a GitBlobLocator to an authenticated HTTP URL for <img> / download.
 * Returns null when the locator cannot be served.
 */
export async function resolveBlobUrl(
  locator: GitBlobLocator | null | undefined,
  repoPath: string,
): Promise<string | null> {
  if (!locator) return null;

  const cfg = await getRuntimeApiConfig();
  const base = httpBase(cfg);
  if (!base) return null;

  const token = cfg.token ? `&token=${encodeURIComponent(cfg.token)}` : "";

  if (locator.type === "worktree") {
    const abs = resolveWorktreeAbsolutePath(repoPath, locator.path);
    return `${base}/api/system/file?path=${encodeURIComponent(abs)}${token}`;
  }

  // git blob
  const rev = locator.rev;
  const pathParam = locator.rev.startsWith(":")
    ? ""
    : `&path=${encodeURIComponent(locator.path)}`;
  return `${base}/api/system/git-blob?repo=${encodeURIComponent(repoPath)}&rev=${encodeURIComponent(rev)}${pathParam}${token}`;
}
