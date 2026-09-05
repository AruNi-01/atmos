import type { FileTreeNode } from "@/api/ws-api";
import {
  isConflictResolveEditorPath,
  isDiffEditorPath,
} from "@/features/editor/store/editor-store-paths";
import { tryRelativePathUnderRoot } from "@/shared/lib/path-under-root";
import type { CenterFileRecent } from "@/shared/lib/center-file-recents";

export const CENTER_EXPLORER_SEARCH_LIMIT = 20;
export const CENTER_EXPLORER_COMMIT_LIMIT = 5;

export type ExplorerSearchEntry = {
  name: string;
  path: string;
  isDir: boolean;
};

export function flattenFileTreeEntries(
  nodes: readonly FileTreeNode[] | null | undefined,
): ExplorerSearchEntry[] {
  if (!nodes?.length) return [];
  const result: ExplorerSearchEntry[] = [];
  const walk = (entries: readonly FileTreeNode[]) => {
    for (const node of entries) {
      result.push({
        name: node.name,
        path: node.path,
        isDir: node.is_dir,
      });
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

export function filterExplorerSearchEntries(
  entries: readonly ExplorerSearchEntry[],
  query: string,
  limit = CENTER_EXPLORER_SEARCH_LIMIT,
): ExplorerSearchEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const scored: Array<{ entry: ExplorerSearchEntry; score: number }> = [];
  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    const path = entry.path.toLowerCase();
    let score: number | null = null;
    if (name === needle) score = 0;
    else if (name.startsWith(needle)) score = 1;
    else if (name.includes(needle)) score = 2;
    else if (path.includes(needle)) score = 3;
    if (score === null) continue;
    scored.push({ entry, score });
  }
  scored.sort(
    (left, right) =>
      left.score - right.score ||
      Number(left.entry.isDir) - Number(right.entry.isDir) ||
      left.entry.name.localeCompare(right.entry.name),
  );
  return scored.slice(0, limit).map((item) => item.entry);
}

export function relativeParentPath(
  absPath: string,
  rootPath: string | null | undefined,
): string {
  const normalizedPath = absPath.replace(/\\/g, "/");
  const normalizedRoot = (rootPath ?? "").replace(/\\/g, "/");
  const underRoot = normalizedRoot
    ? tryRelativePathUnderRoot(normalizedPath, normalizedRoot)
    : null;
  const relative = underRoot ?? normalizedPath;
  const slash = relative.lastIndexOf("/");
  if (slash <= 0) return "";
  return relative.slice(0, slash);
}

export function pathHasHiddenSegment(absPath: string): boolean {
  return absPath
    .replace(/\\/g, "/")
    .split("/")
    .some((part) => part.startsWith(".") && part !== "." && part !== "..");
}

export function isPersistableCenterFilePath(path: string): boolean {
  if (!path || path.startsWith("untitled:")) return false;
  return !isDiffEditorPath(path) && !isConflictResolveEditorPath(path);
}

export function fileRecentsFromOpenFiles(
  files: readonly {
    path: string;
    name: string;
    lastOpenedAt?: number;
    lastFocusedAt?: number;
  }[],
): CenterFileRecent[] {
  return files
    .filter((file) => isPersistableCenterFilePath(file.path))
    .map((file) => ({
      path: file.path,
      name: file.name,
      openedAt: Math.max(file.lastFocusedAt ?? 0, file.lastOpenedAt ?? 0),
    }));
}
