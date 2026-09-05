import { tryRelativePathUnderRoot } from "@/shared/lib/path-under-root";
import { normalizeFsPath } from "@/features/agent/lib/tool-results/parse-tool-result";
import { collectCachedFileTrees } from "@/features/files/lib/file-tree-cache";
import {
  findPathInFileTrees,
  lookupPathInFileTrees,
  type CachedFileTree,
} from "@/features/files/lib/file-tree-lookup";

export type AgentChatWorkspaceFileRef = {
  path: string;
  line?: number;
};

export type AgentChatHrefKind =
  | { kind: "workspace"; file: AgentChatWorkspaceFileRef }
  | { kind: "external" }
  | { kind: "plain" };

const EXTERNAL_HREF_RE = /^(https?:|mailto:|tel:|#)/i;

function looksLikeFileExtension(ext: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9]{0,11}$/.test(ext)) return false;
  // Reject camelCase "extensions" like totalTokens in `_meta.totalTokens`.
  return !/[a-z][A-Z]/.test(ext);
}

function looksLikeFilePath(value: string): boolean {
  if (!value || /\s/.test(value) || value.includes("*")) return false;
  if (value.startsWith("-") || value.startsWith("#")) return false;
  const name = value.split("/").pop() || value;
  if (!name || name === "." || name === "..") return false;
  if (value.includes("/")) return !value.includes("//");
  const extMatch = /\.([A-Za-z][A-Za-z0-9]{0,11})$/.exec(name);
  return Boolean(extMatch && looksLikeFileExtension(extMatch[1]));
}

export function agentChatPathLooksLikeDirectory(path: string): boolean {
  const trimmed = path.trim().replace(/^['"`]+|['"`]+$/g, "");
  if (!trimmed) return false;
  if (/[/\\]$/.test(trimmed)) return true;
  const name = trimmed.split(/[\\/]/).filter(Boolean).pop() || trimmed;
  if (!name || name === "." || name === "..") return true;
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0) return true;
  return !/^[A-Za-z0-9]{1,12}$/.test(name.slice(lastDot + 1));
}

/** True when opening must wait on a disk stat (ambiguous directory-like paths). */
export function agentChatOpenNeedsKindProbe(
  path: string,
  options?: { isDir?: boolean; cachedKind?: "file" | "directory" | "absent" | null },
): boolean {
  if (options?.isDir === true || options?.isDir === false) return false;
  if (options?.cachedKind === "file" || options?.cachedKind === "directory") return false;
  return agentChatPathLooksLikeDirectory(path);
}

function joinUnderCwd(cwd: string, relative: string): string | null {
  const stack = cwd === "/" ? [] : cwd.split("/").filter(Boolean);
  for (const segment of relative.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return `/${stack.join("/")}`;
}

function uniqueNormalizedRoots(
  cwd: string | null | undefined,
  roots?: (string | null | undefined)[],
): { cwd: string | null; roots: string[] } {
  const cwdNorm = normalizeFsPath(cwd);
  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const item of (roots ?? []).map((root) => normalizeFsPath(root))) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    resolved.push(item);
  }
  // Standalone chat has no project/workspace root — allow the picked cwd.
  if (resolved.length === 0 && cwdNorm) resolved.push(cwdNorm);
  return { cwd: cwdNorm, roots: resolved };
}

function resolveAbsoluteUnderRoots(
  normalized: string,
  cwd: string | null,
  roots: string[],
): string | null {
  const joinBase = cwd ?? roots[0] ?? null;
  if (!joinBase) return null;
  const absolute = normalized.startsWith("/")
    ? normalized
    : joinUnderCwd(joinBase, normalized);
  if (!absolute) return null;
  for (const root of roots) {
    if (tryRelativePathUnderRoot(absolute, root) != null) return absolute;
  }
  return null;
}

/**
 * Absolute path for tool expand preview. Allows files outside the project
 * workspace (e.g. ~/.grok/sessions/.../plan.md) via /api/system/file.
 */
export function resolveAgentChatPreviewPath(
  raw: string,
  cwd: string | null | undefined,
  roots?: (string | null | undefined)[],
): string | null {
  const openable = resolveAgentChatOpenableFile(raw, cwd, roots);
  if (openable) return openable.path;

  let value = raw.trim().replace(/^['"`]+|['"`]+$/g, "");
  if (!value || value.length > 512) return null;
  if (EXTERNAL_HREF_RE.test(value)) return null;
  value = value.replace(/:(\d+)(?::\d+)?$/, "").replace(/#L(\d+)(?:-L?\d+)?$/i, "");
  const normalized = normalizeFsPath(value);
  if (!normalized) return null;
  if (normalized.startsWith("/")) return normalized;

  const allowed = uniqueNormalizedRoots(cwd, roots);
  const joinBase = allowed.cwd ?? allowed.roots[0] ?? null;
  if (!joinBase) return null;
  return joinUnderCwd(joinBase, normalized);
}

function locatePathInTrees(
  normalized: string,
  absolute: string,
  roots: string[],
  trees: CachedFileTree[],
): string | null {
  const underRoot = (path: string) =>
    roots.some((root) => tryRelativePathUnderRoot(path, root) != null);
  const exactKind = lookupPathInFileTrees(absolute, trees);
  if (exactKind === "file" || exactKind === "directory") return absolute;
  if (normalized === absolute || normalized.startsWith("/")) return null;
  const suffix = findPathInFileTrees(normalized, trees);
  if (suffix && underRoot(suffix.path)) return suffix.path;
  return null;
}

function parseFileRef(
  raw: string,
  cwd: string | null | undefined,
  roots: (string | null | undefined)[] | undefined,
  requireFileToken: boolean,
  trees?: CachedFileTree[],
): AgentChatWorkspaceFileRef | null {
  const allowed = uniqueNormalizedRoots(cwd, roots);
  if (allowed.roots.length === 0) return null;

  let value = raw.trim().replace(/^['"`]+|['"`]+$/g, "");
  if (!value || value.length > 512) return null;
  if (EXTERNAL_HREF_RE.test(value)) return null;

  let line: number | undefined;
  const lineMatch = value.match(/:(\d+)(?::\d+)?$/);
  const hashMatch = value.match(/#L(\d+)(?:-L?\d+)?$/i);
  if (lineMatch?.index != null) {
    line = Number(lineMatch[1]);
    value = value.slice(0, lineMatch.index);
  } else if (hashMatch?.index != null) {
    line = Number(hashMatch[1]);
    value = value.slice(0, hashMatch.index);
  }

  const normalized = normalizeFsPath(value);
  if (!normalized) return null;
  if (requireFileToken && !looksLikeFilePath(normalized)) return null;

  const absolute = resolveAbsoluteUnderRoots(normalized, allowed.cwd, allowed.roots);
  if (!absolute) return null;
  const located = locatePathInTrees(
    normalized,
    absolute,
    allowed.roots,
    trees ?? collectCachedFileTrees(),
  );
  const path = located ?? absolute;
  return line ? { path, line } : { path };
}

export function resolveAgentChatWorkspaceFile(
  raw: string,
  cwd: string | null | undefined,
  roots?: (string | null | undefined)[],
  trees?: CachedFileTree[],
): AgentChatWorkspaceFileRef | null {
  return parseFileRef(raw, cwd, roots, true, trees);
}

export function resolveAgentChatOpenableFile(
  raw: string,
  cwd: string | null | undefined,
  roots?: (string | null | undefined)[],
  trees?: CachedFileTree[],
): AgentChatWorkspaceFileRef | null {
  return parseFileRef(raw, cwd, roots, false, trees);
}

export function displayAgentChatFilePath(
  path: string,
  cwd?: string | null,
  roots?: (string | null | undefined)[],
): string {
  const allowed = uniqueNormalizedRoots(cwd, roots);
  const normalized = normalizeFsPath(path);
  if (!normalized) return path;

  const absolute = normalized.startsWith("/")
    ? normalized
    : allowed.cwd
      ? (joinUnderCwd(allowed.cwd, normalized) ?? normalized)
      : normalized;

  const displayRoots: string[] = [];
  const seen = new Set<string>();
  for (const item of [allowed.cwd, ...allowed.roots]) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    displayRoots.push(item);
  }

  let best: string | null = null;
  for (const root of displayRoots) {
    const relative = tryRelativePathUnderRoot(absolute, root);
    if (relative == null) continue;
    const shown = relative || ".";
    if (best == null || shown.length < best.length) best = shown;
  }
  return best ?? (absolute.startsWith("/") ? absolute : normalized);
}

export function classifyAgentChatHref(
  href: string | null | undefined,
  cwd: string | null | undefined,
  roots?: (string | null | undefined)[],
): AgentChatHrefKind {
  if (!href) return { kind: "plain" };
  const trimmed = href.trim();
  if (!trimmed) return { kind: "plain" };
  if (EXTERNAL_HREF_RE.test(trimmed)) return { kind: "external" };

  const file = resolveAgentChatWorkspaceFile(trimmed, cwd, roots);
  if (file) return { kind: "workspace", file };

  const normalized = normalizeFsPath(trimmed);
  if (
    /^file:/i.test(trimmed)
    || (normalized && (normalized.startsWith("/") || looksLikeFilePath(normalized)))
  ) {
    return { kind: "plain" };
  }
  return { kind: "external" };
}
