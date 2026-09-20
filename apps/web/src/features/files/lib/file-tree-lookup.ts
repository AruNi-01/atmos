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

type FileTreeIndex = {
  byPath: Map<string, boolean>;
  byName: Map<string, string[]>;
};

const indexCache = new WeakMap<FileTreeNode[], FileTreeIndex>();

function indexFileTree(tree: FileTreeNode[]): FileTreeIndex {
  const cached = indexCache.get(tree);
  if (cached) return cached;

  const byPath = new Map<string, boolean>();
  const byName = new Map<string, string[]>();
  const walk = (nodes: FileTreeNode[]) => {
    for (const node of nodes) {
      const path = normalizePath(node.path) ?? node.path;
      byPath.set(path, node.is_dir);
      const name = path.split("/").pop() || path;
      const existing = byName.get(name);
      if (existing) existing.push(path);
      else byName.set(name, [path]);
      if (node.children && node.children.length > 0) walk(node.children);
    }
  };
  walk(tree);
  const index = { byPath, byName };
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
    const isDir = indexFileTree(tree.tree).byPath.get(normalized);
    if (isDir === true) return "directory";
    if (isDir === false) return "file";
  }
  return covered ? "absent" : null;
}

export type FileTreePathMatch = {
  path: string;
  isDir: boolean;
};

/**
 * Resolve a full or short path against cached trees. Unique suffix matches
 * recover tool paths that are basenames or project-relative fragments.
 */
export function findPathInFileTrees(
  query: string,
  trees: CachedFileTree[],
): FileTreePathMatch | null {
  const normalized = normalizePath(query);
  if (!normalized) return null;

  const exact = lookupPathInFileTrees(normalized, trees);
  if (exact === "file") return { path: normalized, isDir: false };
  if (exact === "directory") return { path: normalized, isDir: true };
  if (normalized.startsWith("/") && exact === "absent") return null;

  const suffix = normalized.replace(/^\/+/, "");
  if (!suffix) return null;
  const base = suffix.split("/").pop() || suffix;

  const matches: FileTreePathMatch[] = [];
  const seen = new Set<string>();
  for (const tree of trees) {
    const index = indexFileTree(tree.tree);
    for (const path of index.byName.get(base) ?? []) {
      if (seen.has(path)) continue;
      if (path === suffix || path.endsWith(`/${suffix}`)) {
        seen.add(path);
        matches.push({ path, isDir: index.byPath.get(path) === true });
      }
    }
  }
  if (matches.length === 1) return matches[0] ?? null;
  const files = matches.filter((item) => !item.isDir);
  return files.length === 1 ? (files[0] ?? null) : null;
}
