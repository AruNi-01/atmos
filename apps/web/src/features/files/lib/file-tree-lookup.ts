import type { FileTreeNode } from "@/api/ws-api";

function normalizePath(path: string): string | null {
  let value = path.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!value) return null;
  if (value !== "/") value = value.replace(/\/+$/, "");
  return value || null;
}

export type CachedFileTree = {
  rootPath: string;
  tree: FileTreeNode[];
};

export type FileTreePathLookup = "file" | "directory" | "absent" | null;

const indexCache = new WeakMap<FileTreeNode[], Map<string, boolean>>();

function indexFileTree(tree: FileTreeNode[]): Map<string, boolean> {
  const cached = indexCache.get(tree);
  if (cached) return cached;

  const index = new Map<string, boolean>();
  const walk = (nodes: FileTreeNode[]) => {
    for (const node of nodes) {
      const path = normalizePath(node.path) ?? node.path;
      index.set(path, node.is_dir);
      if (node.children && node.children.length > 0) walk(node.children);
    }
  };
  walk(tree);
  indexCache.set(tree, index);
  return index;
}

function coversPath(rootPath: string, path: string): boolean {
  return path === rootPath || path.startsWith(`${rootPath}/`);
}

/**
 * Look up a path in already-loaded project/workspace file trees.
 * - `file` / `directory`: found in a covering tree
 * - `absent`: a covering tree is loaded, but this path is not in it
 * - `null`: no cached tree covers this path (caller may fall back to disk)
 */
export function lookupPathInFileTrees(
  path: string,
  trees: CachedFileTree[],
): FileTreePathLookup {
  const normalized = normalizePath(path);
  if (!normalized) return null;

  let covered = false;
  for (const tree of trees) {
    const root = normalizePath(tree.rootPath);
    if (!root || !coversPath(root, normalized)) continue;
    covered = true;
    if (normalized === root) return "directory";
    const isDir = indexFileTree(tree.tree).get(normalized);
    if (isDir === true) return "directory";
    if (isDir === false) return "file";
  }
  return covered ? "absent" : null;
}
