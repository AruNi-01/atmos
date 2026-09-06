import type {
  AgentToolParams,
} from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { isEmptyToolJson, isGenericToolLabel } from "@/features/agent/lib/agent-tool-kind";

export type SearchHit = {
  path: string;
  line?: number;
  text: string;
};

export type WebResultLink = {
  url: string;
  title: string;
  snippet?: string;
};

export type TreeEntry = {
  name: string;
  indent: number;
  isDir: boolean;
  kind: "item" | "note";
};

export type ToolLineRange = {
  start: number;
  end: number;
  total?: number;
};

export type TodoItem = {
  content: string;
  status: string;
};

export type ToolDiffFile = {
  path: string;
  oldContent: string;
  newContent: string;
};

export type ToolPresentation =
  | { kind: "diff"; files: ToolDiffFile[] }
  | { kind: "patch"; path: string | null; patch: string }
  | {
      kind: "diff_stats";
      path: string | null;
      additions: number;
      deletions: number;
    }
  | { kind: "code"; path: string | null; language: string; code: string; hint?: "new" | "deleted" }
  | { kind: "search"; hits: SearchHit[] }
  | { kind: "web_search"; query: string; links: WebResultLink[] }
  | { kind: "web_fetch"; url: string; title?: string; markdown?: string; text?: string }
  | {
      kind: "images";
      images: Array<{ url?: string; path?: string; mime?: string }>;
    }
  | { kind: "files"; paths: string[] }
  | { kind: "tree"; entries: TreeEntry[] }
  | { kind: "markdown"; markdown: string }
  | { kind: "todos"; todos: TodoItem[] }
  | { kind: "json"; json: string }
  | { kind: "text"; text: string }
  | { kind: "move"; from: string; to: string }
  | { kind: "delete"; path: string }
  | { kind: "error"; text: string }
  | { kind: "empty" };

export type ToolInputRow = {
  key: string;
  value: string;
};

export type ParsedToolResult = {
  path: string | null;
  presentation: ToolPresentation;
  inputRows: ToolInputRow[];
  showInput: boolean;
  resolvedTool: string;
  lineRange: ToolLineRange | null;
};

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  json: "json",
  jsonc: "json",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  html: "html",
  css: "css",
  scss: "css",
  less: "css",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  dockerfile: "dockerfile",
  txt: "plaintext",
};

const READ_LINE_PREFIX = /^\s*\d+[|\t]/;
const READ_LINE_ARROW = /^\s*\d+→/;

export function languageFromPath(path: string | null | undefined): string {
  if (!path) return "plaintext";
  const base = path.split(/[\\/]/).pop() || path;
  if (/^dockerfile$/i.test(base) || /\.dockerfile$/i.test(base)) return "dockerfile";
  const ext = base.includes(".") ? base.split(".").pop()?.toLowerCase() : "";
  if (!ext) return "plaintext";
  return EXT_TO_LANG[ext] ?? "plaintext";
}

export function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

export function stripReadLineNumbers(text: string): string {
  const lines = text.split("\n");
  const candidates = lines.filter((line) => line.trim().length > 0);
  if (candidates.length === 0) return text;
  const arrowMatches = candidates.filter((line) => READ_LINE_ARROW.test(line)).length;
  if (arrowMatches > 0) {
    return lines.map((line) => line.replace(READ_LINE_ARROW, "")).join("\n");
  }
  const matched = candidates.filter((line) => READ_LINE_PREFIX.test(line)).length;
  if (matched / candidates.length < 0.8) return text;
  return lines
    .map((line) => (READ_LINE_PREFIX.test(line) ? line.replace(READ_LINE_PREFIX, "") : line))
    .join("\n");
}

export function commonDirectoryPrefix(paths: string[]): string {
  if (paths.length === 0) return "";
  const dirs = paths.map((path) => {
    const normalized = path.replace(/\\/g, "/");
    const index = normalized.lastIndexOf("/");
    return index >= 0 ? normalized.slice(0, index + 1) : "";
  });
  let prefix = dirs[0] ?? "";
  for (const dir of dirs.slice(1)) {
    while (prefix && !dir.startsWith(prefix)) {
      const index = prefix.slice(0, -1).lastIndexOf("/");
      prefix = index >= 0 ? prefix.slice(0, index + 1) : "";
    }
  }
  return prefix;
}

export function relativeDisplayPath(path: string, paths: string[]): string {
  const prefix = commonDirectoryPrefix(paths);
  if (prefix && path.replace(/\\/g, "/").startsWith(prefix)) {
    const rest = path.replace(/\\/g, "/").slice(prefix.length);
    return rest || path.split(/[\\/]/).pop() || path;
  }
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length > 3) return parts.slice(-3).join("/");
  return path;
}

export function normalizeFsPath(path: string | null | undefined): string | null {
  if (!path) return null;
  let value = path.trim();
  if (!value) return null;
  if (value.startsWith("file://")) {
    try {
      value = decodeURIComponent(value.slice("file://".length));
    } catch {
      value = value.slice("file://".length);
    }
  }
  value = value.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (value !== "/") value = value.replace(/\/+$/, "");
  return value || null;
}

function pathCompareKey(path: string): string {
  return /^[A-Za-z]:\//.test(path) ? path.toLowerCase() : path;
}

export function pathRelativeToCwd(path: string, cwd?: string | null): string {
  const normalizedPath = normalizeFsPath(path);
  const normalizedCwd = normalizeFsPath(cwd);
  if (!normalizedPath) return path;
  if (!normalizedCwd || normalizedCwd === "/") return normalizedPath;
  const pathKey = pathCompareKey(normalizedPath);
  const cwdKey = pathCompareKey(normalizedCwd);
  if (pathKey === cwdKey) return ".";
  const prefix = `${cwdKey}/`;
  if (pathKey.startsWith(prefix)) {
    return normalizedPath.slice(normalizedCwd.length).replace(/^\/+/, "") || ".";
  }
  return normalizedPath;
}

export function displayToolPath(path: string, cwd?: string | null): string {
  return pathRelativeToCwd(path, cwd);
}

export function displayToolTitle(
  title: string,
  cwd?: string | null,
  path?: string | null,
): string {
  if (!title) return title;
  let result = title;
  if (path) {
    const abs = normalizeFsPath(path);
    const rel = displayToolPath(path, cwd);
    if (abs && rel !== abs) {
      const pathAliases = new Set([path, abs, abs.replace(/\//g, "\\")]);
      for (const alias of pathAliases) {
        if (alias && result.includes(alias)) result = result.split(alias).join(rel);
      }
    }
  }
  const normalizedCwd = normalizeFsPath(cwd);
  if (normalizedCwd && normalizedCwd !== "/") {
    const prefixes = [
      `${normalizedCwd}/`,
      `${normalizedCwd}\\`,
      `${normalizedCwd.replace(/\//g, "\\")}\\`,
    ];
    for (const prefix of prefixes) {
      if (result.includes(prefix)) result = result.split(prefix).join("");
    }
  }
  return result;
}

export function resolveTreeEntryPaths(entries: TreeEntry[]): string[] {
  const stack: { indent: number; path: string }[] = [];
  return entries.map((entry) => {
    if (entry.kind === "note") return entry.name;
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= entry.indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1]?.path;
    const path = parent
      ? `${parent.replace(/[/\\]+$/, "")}/${entry.name}`
      : entry.name;
    if (entry.isDir) stack.push({ indent: entry.indent, path });
    return path;
  });
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return String(value);
  }
}

function looksLikePatch(text: string): boolean {
  const trimmed = text.trimStart();
  return (
    trimmed.startsWith("--- ")
    || trimmed.startsWith("diff --git ")
    || trimmed.startsWith("*** ")
    || /^@@ /.test(trimmed)
  );
}

function pathFromParams(params: AgentToolParams | undefined): string | null {
  if (!params) return null;
  switch (params.type) {
    case "read":
    case "edit":
    case "delete":
      return params.path || null;
    case "image_gen":
      return params.path || null;
    case "move":
      return params.to || params.from || null;
    default:
      return null;
  }
}

function lineRangeFromRead(params: AgentToolParams | undefined): ToolLineRange | null {
  if (params?.type !== "read") return null;
  const offset = params.offset ?? null;
  const limit = params.limit ?? null;
  if (offset == null && limit == null) return null;
  const start = Math.max(1, offset ?? 1);
  const end = limit != null ? start + Math.max(0, limit) - 1 : start;
  return { start, end };
}

function jsonPresentation(value: unknown): ToolPresentation {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return { kind: "empty" };
    return { kind: "text", text: value };
  }
  if (isEmptyToolJson(value)) return { kind: "empty" };
  return { kind: "json", json: prettyJson(value) };
}

function parsed(
  part: AgentToolCallPart,
  presentation: ToolPresentation,
  path: string | null,
  lineRange: ToolLineRange | null = null,
): ParsedToolResult {
  return {
    path,
    presentation,
    inputRows: [],
    showInput: false,
    resolvedTool: part.name,
    lineRange,
  };
}

export function toolTitleLooksLikePath(title: string, path: string | null | undefined): boolean {
  if (!path || !title) return false;
  const trimmed = title.trim();
  if (trimmed === path) return true;
  const prefixed = /^(?:tool|read|edit|search|execute|fetch|write|delete):\s*(.*)$/i.exec(trimmed);
  if (prefixed?.[1] === path) return true;
  return trimmed.endsWith(path) && (trimmed.length === path.length || /[:\s/]/.test(trimmed.slice(0, -path.length).slice(-1)));
}

/**
 * Remove a path echo (and surrounding quotes / separators) from a tool title
 * when the same path is shown as a file chip.
 */
export function stripPathEchoFromToolHeading(
  heading: string,
  path: string | null | undefined,
  extraAliases: readonly string[] = [],
): string {
  const primary = path?.trim() || "";
  if (!heading || !primary) return heading;

  const aliases = new Set<string>();
  for (const candidate of [primary, normalizeFsPath(primary), ...extraAliases]) {
    const value = candidate.trim();
    if (!value) continue;
    aliases.add(value);
    aliases.add(value.replace(/\//g, "\\"));
  }

  let result = heading;
  const sorted = [...aliases].sort((a, b) => b.length - a.length);
  for (const alias of sorted) {
    for (const quote of ["'", '"', "`"] as const) {
      const quoted = `${quote}${alias}${quote}`;
      if (result.includes(quoted)) result = result.split(quoted).join("");
    }
    if (result.includes(alias)) result = result.split(alias).join("");
  }

  return result
    .replace(/\s*[:：]\s*$/g, "")
    .replace(/^\s*[:：]\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Keep the kind verb visible when the server title is empty, a generic label
 * ("Read"), or path-only — chip UI must not replace the action text.
 *
 * When `omitPathInTitle` is set (file chip already shows the path), drop the
 * path echo from the heading and never format `kind + path` into the title.
 */
export function resolveAgentToolCardHeading(args: {
  heading: string;
  path?: string | null;
  kindLabel: string;
  formatWithPath: (tool: string, path: string) => string;
  omitPathInTitle?: boolean;
  /** Relativized / display forms of `path` that may appear in the heading. */
  pathAliases?: readonly string[];
}): string {
  const heading = args.heading.trim();
  const path = args.path?.trim() || "";
  const omitPath = Boolean(args.omitPathInTitle && path);
  const pathOnly = toolTitleLooksLikePath(heading, path || null);

  if (!heading || isGenericToolLabel(heading) || pathOnly) {
    if (omitPath) {
      if (pathOnly && heading) {
        const stripped = stripPathEchoFromToolHeading(heading, path, args.pathAliases);
        if (stripped && !toolTitleLooksLikePath(stripped, path)) return stripped;
      }
      return args.kindLabel;
    }
    if (path) return args.formatWithPath(args.kindLabel, path);
    return args.kindLabel;
  }

  if (omitPath) {
    const stripped = stripPathEchoFromToolHeading(heading, path, args.pathAliases);
    // Keep the remaining action text even when it is a generic verb ("Write").
    if (!stripped || toolTitleLooksLikePath(stripped, path)) {
      return args.kindLabel;
    }
    return stripped;
  }

  return heading;
}

function paramsNotShownInTitle(title: string, params: unknown): unknown {
  if (isEmptyToolJson(params)) return null;
  if (!params || typeof params !== "object" || Array.isArray(params)) return params;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (typeof value === "string" && value && title.includes(value)) continue;
    next[key] = value;
  }
  return Object.keys(next).length === 0 ? null : next;
}

export function otherToolBodies(part: AgentToolCallPart): {
  paramsJson: string | null;
  resultBody: { kind: "json" | "text" | "error"; value: string } | null;
} {
  const params = part.params;
  const rawParams = params
    ? (params.type === "other" ? params.value : params)
    : null;
  const title = (part.title || part.name || "").trim();
  const uncovered = paramsNotShownInTitle(title, rawParams);
  const paramsJson = isEmptyToolJson(uncovered) ? null : prettyJson(uncovered);
  const result = part.result;
  if (!result || result.type === "empty") {
    return { paramsJson, resultBody: null };
  }
  if (result.type === "error") {
    return { paramsJson, resultBody: { kind: "error", value: result.message } };
  }
  if (result.type === "text") {
    return { paramsJson, resultBody: result.text.trim() ? { kind: "text", value: result.text } : null };
  }
  if (result.type === "other") {
    return {
      paramsJson,
      resultBody: isEmptyToolJson(result.value)
        ? null
        : { kind: "json", value: prettyJson(result.value) },
    };
  }
  return { paramsJson, resultBody: { kind: "json", value: prettyJson(result) } };
}

export function presentAgentTool(part: AgentToolCallPart): ParsedToolResult {
  const params = part.params;
  const result = part.result;
  const path = (result && "path" in result && typeof result.path === "string" && result.path)
    || pathFromParams(params)
    || null;
  const lineRange = lineRangeFromRead(params);

  if (result?.type === "error") {
    return parsed(part, { kind: "error", text: result.message }, path, lineRange);
  }

  if (part.kind === "move" && params?.type === "move") {
    return parsed(part, { kind: "move", from: params.from, to: params.to }, params.to || path, lineRange);
  }
  if (part.kind === "delete" && params?.type === "delete") {
    return parsed(part, { kind: "delete", path: params.path }, params.path, lineRange);
  }

  if (!result || result.type === "empty") {
    return parsed(part, { kind: "empty" }, path, lineRange);
  }

  if (result.type === "file_content") {
    return parsed(part, {
      kind: "code",
      path: result.path,
      language: languageFromPath(result.path),
      code: stripReadLineNumbers(result.text),
    }, result.path, lineRange);
  }

  if (result.type === "diff_stats") {
    return parsed(part, {
      kind: "diff_stats",
      path: result.path,
      additions: result.additions,
      deletions: result.deletions,
    }, result.path, lineRange);
  }

  if (result.type === "diff") {
    return parsed(part, {
      kind: "diff",
      files: [{
        path: result.path,
        oldContent: result.old_content ?? "",
        newContent: result.new_content,
      }],
    }, result.path, lineRange);
  }

  if (result.type === "execute") {
    return parsed(part, { kind: "text", text: result.output }, path, lineRange);
  }

  if (result.type === "search_hits") {
    return parsed(part, {
      kind: "search",
      hits: result.hits.map((hit) => ({
        path: hit.path,
        ...(hit.line != null ? { line: hit.line } : {}),
        text: hit.snippet ?? "",
      })),
    }, path, lineRange);
  }

  if (result.type === "web_search") {
    return parsed(part, {
      kind: "web_search",
      query: result.query,
      links: result.links.map((link) => ({
        url: link.url,
        title: link.title,
        snippet: link.snippet ?? undefined,
      })),
    }, path, lineRange);
  }

  if (result.type === "web_fetch") {
    return parsed(part, {
      kind: "web_fetch",
      url: result.url,
      title: result.title ?? undefined,
      markdown: result.markdown ?? undefined,
      text: result.text ?? undefined,
    }, path, lineRange);
  }

  if (result.type === "images") {
    return parsed(
      part,
      {
        kind: "images",
        images: result.images.map((image) => ({
          url: image.url ?? undefined,
          path: image.path ?? undefined,
          mime: image.mime ?? undefined,
        })),
      },
      path,
      lineRange,
    );
  }

  if (result.type === "text") {
    if (part.kind === "edit" && looksLikePatch(result.text)) {
      return parsed(part, { kind: "patch", path, patch: result.text }, path, lineRange);
    }
    return parsed(part, { kind: "text", text: result.text }, path, lineRange);
  }

  if (result.type === "other") {
    return parsed(part, jsonPresentation(result.value), path, lineRange);
  }

  return parsed(part, { kind: "empty" }, path, lineRange);
}
