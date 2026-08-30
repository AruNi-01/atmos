import type { AgentToolCallContentItem } from "@/features/agent/hooks/use-agent-session";
import { isDiffObject, isDiffString } from "@/features/agent/lib/chat-helpers";
import { parseLoadedToolNames } from "@/features/agent/lib/agent-tool-kind";

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
  | { kind: "code"; path: string | null; language: string; code: string; hint?: "new" | "deleted" }
  | { kind: "search"; hits: SearchHit[] }
  | { kind: "web_search"; query: string; links: WebResultLink[] }
  | { kind: "web_fetch"; url: string; title?: string; markdown?: string; text?: string }
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

const PATH_KEYS = [
  "file_path",
  "filePath",
  "target_file",
  "targetFile",
  "absolute_path",
  "path",
  "file",
  "filename",
  "uri",
  "absolute_root_path",
  "dir_path",
  "directory",
  "target_directory",
  "relative_path",
  "relativePath",
] as const;
const NESTED_INPUT_KEYS = ["args", "parameters", "input", "FileContent", "file_content", "Content"] as const;
const FROM_KEYS = ["from", "old_path", "source", "src"] as const;
const TO_KEYS = ["to", "new_path", "destination", "dest", "dst"] as const;
const SKIP_INPUT_KEYS = new Set([
  ...PATH_KEYS,
  ...FROM_KEYS,
  ...TO_KEYS,
  "todos",
  "old_string",
  "new_string",
  "oldText",
  "newText",
  "contents",
  "content",
  "new_content",
  "old_content",
  "type",
  "variant",
  "Content",
  "FileContent",
  "file_content",
  "EditsApplied",
  "edits_applied",
  "edits",
  "old_string",
  "new_string",
  "tool_output_for_prompt",
  "tool_output_for_prompt_concise",
  "result",
  "file_matches",
  "match_count",
  "stdout",
  "stderr",
  "exit_code",
  "content_concise",
  "raw_output",
  "total_lines",
  "offset",
  "limit",
  "output",
  "output_for_prompt",
  "current_dir",
  "working_directory",
  "output_file",
  "total_bytes",
  "truncated",
  "timed_out",
  "signal",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? value : null;
}

const GENERIC_TOOL_NAMES = new Set(["tool", "other", "unknown", ""]);

function isGenericToolName(value: string | null | undefined): boolean {
  if (!value) return true;
  return GENERIC_TOOL_NAMES.has(normalizeTool(value));
}

function isVendorToolType(value: string): boolean {
  if (isGenericToolName(value)) return false;
  const normalized = normalizeTool(value);
  if (
    [
      "listdir",
      "list_dir",
      "list_directory",
      "readfile",
      "read_file",
      "grep",
      "grepsearch",
      "grep_search",
      "glob",
      "search",
      "edit",
      "write",
      "delete",
      "shell",
      "bash",
      "execute",
      "fetch",
      "webfetch",
      "read",
      "ls",
    ].includes(normalized)
  ) {
    return true;
  }
  return /^[A-Z][A-Za-z0-9]+$/.test(value.trim());
}

export function unwrapVendorToolEnvelope(value: unknown): {
  toolType: string;
  payload: Record<string, unknown>;
} | null {
  let record = asRecord(value);
  if (!record && typeof value === "string" && looksLikeJson(value)) {
    try {
      record = asRecord(JSON.parse(value) as unknown);
    } catch {
      record = null;
    }
  }
  if (!record) return null;
  const toolType = asNonEmptyString(record.type)
    ?? asNonEmptyString(record.variant)
    ?? asNonEmptyString(record.tool);
  if (!toolType || !isVendorToolType(toolType)) return null;
  const nested = asRecord(record.FileContent)
    ?? asRecord(record.file_content)
    ?? asRecord(record.EditsApplied)
    ?? asRecord(record.edits_applied)
    ?? asRecord(record.Content)
    ?? asRecord(record.content)
    ?? asRecord(record.result);
  return {
    toolType,
    payload: nested ?? record,
  };
}

function normalizeTool(tool: string): string {
  return (tool || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function toolEquals(tool: string, ...names: string[]): boolean {
  const normalized = normalizeTool(tool);
  return names.some((name) => normalized === name || normalized.endsWith(`_${name}`));
}

function isReadTool(tool: string): boolean {
  return toolEquals(tool, "read", "read_file", "readfile", "view", "view_file", "open");
}

function isEditTool(tool: string): boolean {
  return toolEquals(
    tool,
    "edit",
    "write",
    "write_file",
    "str_replace",
    "strreplace",
    "search_replace",
    "searchreplace",
    "apply_patch",
    "notebook_edit",
    "notebookedit",
  );
}

function isWebFetchTool(tool: string): boolean {
  const normalized = normalizeTool(tool);
  return toolEquals(tool, "fetch", "web_fetch", "webfetch", "html_fetch", "open_url", "browse_page", "browse")
    || normalized.includes("web_fetch")
    || normalized.includes("browse_page")
    || (normalized.endsWith("_fetch") && !normalized.includes("search"));
}

function isWebSearchTool(tool: string): boolean {
  const normalized = normalizeTool(tool);
  return toolEquals(tool, "web_search", "websearch", "web_search_preview")
    || normalized.includes("web_search");
}

function isFetchTool(tool: string): boolean {
  return isWebFetchTool(tool);
}

function isSearchTool(tool: string): boolean {
  if (isFetchTool(tool) || isWebSearchTool(tool)) return false;
  return toolEquals(
    tool,
    "search",
    "grep",
    "grepsearch",
    "grep_search",
    "glob",
    "glob_file_search",
    "ripgrep",
    "find",
    "rg",
    "search_files",
  );
}

function isListDirTool(tool: string): boolean {
  return toolEquals(tool, "listdir", "list_dir", "list_directory", "ls");
}

function isMoveTool(tool: string): boolean {
  return toolEquals(tool, "move", "rename");
}

function isDeleteTool(tool: string): boolean {
  return toolEquals(tool, "delete", "remove", "rm");
}

function looksLikeHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  const direct = asRecord(value);
  if (direct) return direct;
  if (typeof value !== "string" || !looksLikeJson(value)) return null;
  try {
    return asRecord(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

const WEB_FETCH_ACTIONS = new Set([
  "fetch",
  "open",
  "open_url",
  "open_page",
  "visit",
  "navigate",
  "browse",
]);

function webActionTypeOf(input: unknown): string {
  const action = recordFromUnknown(recordFromUnknown(input)?.action);
  const type = typeof action?.type === "string" ? action.type.trim().toLowerCase() : "";
  return type;
}

export function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

function uniqueWebLinks(links: WebResultLink[]): WebResultLink[] {
  const seen = new Set<string>();
  const unique: WebResultLink[] = [];
  for (const link of links) {
    const key = link.url.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(link);
  }
  return unique;
}

function webLinkFromUnknown(value: unknown): WebResultLink | null {
  if (typeof value === "string" && looksLikeHttpUrl(value)) {
    const url = value.trim();
    return { url, title: titleFromUrl(url) };
  }
  const record = asRecord(value);
  if (!record) return null;
  const url = stringField(record, ["url", "uri", "href", "link", "source"]);
  if (!url || !looksLikeHttpUrl(url)) return null;
  const title = stringField(record, ["title", "name", "text"]) ?? titleFromUrl(url);
  const snippet = stringField(record, ["snippet", "description", "content", "summary"]);
  return { url, title, snippet: snippet ?? undefined };
}

function collectWebLinkLists(value: unknown): unknown[] {
  const items: unknown[] = [];
  if (Array.isArray(value)) {
    items.push(...value);
    return items;
  }
  const record = recordFromUnknown(value);
  if (!record) return items;
  for (const key of ["results", "sources", "items", "links", "organic", "citations"]) {
    if (Array.isArray(record[key])) items.push(...(record[key] as unknown[]));
  }
  const webPages = asRecord(record.webPages);
  if (Array.isArray(webPages?.value)) items.push(...(webPages.value as unknown[]));
  const action = asRecord(record.action);
  if (Array.isArray(action?.sources)) items.push(...(action.sources as unknown[]));
  if (Array.isArray(action?.results)) items.push(...(action.results as unknown[]));
  return items;
}

function webLinksFromValue(value: unknown): WebResultLink[] {
  return uniqueWebLinks(collectWebLinkLists(value).flatMap((item) => {
    const link = webLinkFromUnknown(item);
    return link ? [link] : [];
  }));
}

function webLinksFromMarkdown(text: string): WebResultLink[] {
  const links: WebResultLink[] = [];
  const markdown = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
  let match: RegExpExecArray | null = markdown.exec(text);
  while (match) {
    links.push({ url: match[2], title: match[1].trim() || titleFromUrl(match[2]) });
    match = markdown.exec(text);
  }
  const bare = /https?:\/\/[^\s)|<\]]+/gi;
  match = bare.exec(text);
  while (match) {
    const url = match[0].replace(/[.,;]+$/, "");
    links.push({ url, title: titleFromUrl(url) });
    match = bare.exec(text);
  }
  return uniqueWebLinks(links);
}

function webLinksFromUrlBlocks(text: string): WebResultLink[] {
  const links: WebResultLink[] = [];
  const block = /\*\*(.+?)\*\*[^\n]*\n+\s*URL:\s*(https?:\/\/[^\s]+)/gi;
  let match: RegExpExecArray | null = block.exec(text);
  while (match) {
    const url = match[2].replace(/[.,;]+$/, "");
    if (looksLikeHttpUrl(url)) {
      links.push({ url, title: match[1].trim() || titleFromUrl(url) });
    }
    match = block.exec(text);
  }
  return uniqueWebLinks(links);
}

function extractWebQueryFromText(text: string): string {
  const match = text.match(/^\s*web search results for:\s*"?([^"\n]+)"?\s*$/im);
  return match?.[1]?.trim() ?? "";
}

function looksLikeWebSearchResultsText(text: string): boolean {
  if (/^\s*web search results for:/im.test(text)) return true;
  return /\*\*[^*]+\*\*[^\n]*\n+\s*URL:\s*https?:\/\//i.test(text);
}

function extractWebQuery(input: unknown): string {
  const record = recordFromUnknown(input);
  const action = asRecord(record?.action);
  const keys = ["query", "q", "search_term", "search_query", "search", "question"] as const;
  return stringField(record, keys)
    ?? stringField(action, keys)
    ?? "";
}

function extractWebUrl(input: unknown, output: unknown): string {
  const records = [
    recordFromUnknown(input),
    asRecord(recordFromUnknown(input)?.action),
    recordFromUnknown(output),
    asRecord(recordFromUnknown(output)?.action),
  ];
  for (const record of records) {
    const url = stringField(record, ["url", "uri", "href"]);
    if (url && looksLikeHttpUrl(url)) return url;
  }
  return "";
}

function looksLikeWebSearch(
  tool: string,
  input: unknown,
  links: WebResultLink[],
  primaryText: string | null,
): boolean {
  if (WEB_FETCH_ACTIONS.has(webActionTypeOf(input))) return false;
  if (isWebSearchTool(tool)) return true;
  const actionType = webActionTypeOf(input);
  if (actionType === "search" || actionType === "web_search") return true;
  if (primaryText && looksLikeWebSearchResultsText(primaryText) && links.length > 0) return true;
  return extractWebQuery(input).length > 0 && links.length > 0;
}

function looksLikeUrlContentDump(text: string): boolean {
  return /^\s*URL Content from:\s*"?https?:\/\//im.test(text);
}

function parseUrlContentDump(text: string): {
  url: string;
  title?: string;
  markdown?: string;
  text?: string;
} | null {
  const header = text.match(/^\s*URL Content from:\s*"?(https?:\/\/[^"\s]+)"?\s*$/im);
  if (!header) return null;
  const url = header[1];
  const title = text.match(/^\s*Title:\s*(.+)$/im)?.[1]?.trim();
  const parts = text.split(/^\s*Markdown content:\s*$/im);
  const body = parts.length > 1 ? parts.slice(1).join("").trim() : "";
  if (body && looksLikeMarkdown(body)) {
    return { url, title, markdown: body };
  }
  if (body) return { url, title, text: body };
  return { url, title };
}

function looksLikeWebFetch(tool: string, input: unknown, url: string, primaryText: string | null): boolean {
  if (isWebFetchTool(tool)) return true;
  if (WEB_FETCH_ACTIONS.has(webActionTypeOf(input))) return true;
  if (primaryText && looksLikeUrlContentDump(primaryText)) return true;
  return Boolean(url) && (Boolean(extractWebUrl(input, null)) || isFetchTool(tool));
}

function parseWebSearchPresentation(
  tool: string,
  input: unknown,
  output: unknown,
  primaryText: string | null,
): Extract<ToolPresentation, { kind: "web_search" }> | null {
  const links = uniqueWebLinks([
    ...(primaryText ? webLinksFromUrlBlocks(primaryText) : []),
    ...webLinksFromValue(output),
    ...(primaryText ? webLinksFromMarkdown(primaryText) : []),
    ...webLinksFromValue(input),
  ]);
  const query = extractWebQuery(input)
    || (primaryText ? extractWebQueryFromText(primaryText) : "");
  if (!looksLikeWebSearch(tool, input, links, primaryText)) return null;
  if (!query && links.length === 0) return null;
  return { kind: "web_search", query, links };
}

function parseWebFetchPresentation(
  tool: string,
  input: unknown,
  output: unknown,
  primaryText: string | null,
): Extract<ToolPresentation, { kind: "web_fetch" }> | null {
  const dump = primaryText ? parseUrlContentDump(primaryText) : null;
  const url = dump?.url
    || extractWebUrl(input, output)
    || webLinksFromValue(input)[0]?.url
    || webLinksFromValue(output)[0]?.url
    || (primaryText ? webLinksFromMarkdown(primaryText)[0]?.url : "")
    || "";
  if (!looksLikeWebFetch(tool, input, url, primaryText) || !url) return null;
  const title = dump?.title
    || webLinksFromValue(output)[0]?.title
    || stringField(asRecord(output), ["title", "name"])
    || titleFromUrl(url);
  if (dump) {
    return {
      kind: "web_fetch",
      url,
      title,
      markdown: dump.markdown,
      text: dump.text,
    };
  }
  const actionEnvelope = Boolean(recordFromUnknown(primaryText)?.action)
    || Boolean(recordFromUnknown(output)?.action);
  if (actionEnvelope) {
    return { kind: "web_fetch", url, title };
  }
  if (primaryText && looksLikeMarkdown(primaryText)) {
    return { kind: "web_fetch", url, title, markdown: primaryText };
  }
  if (primaryText) {
    return { kind: "web_fetch", url, title, text: primaryText };
  }
  return { kind: "web_fetch", url, title };
}

function isThinkTool(tool: string): boolean {
  return toolEquals(tool, "think", "thought", "reasoning", "reason");
}

function isShellTool(tool: string): boolean {
  return toolEquals(
    tool,
    "bash",
    "shell",
    "execute",
    "run_command",
    "terminal",
    "command",
    "run_terminal_cmd",
    "powershell",
    "cmd",
  );
}

function isTodoTool(tool: string): boolean {
  return toolEquals(tool, "todowrite", "todo_write", "todo", "todos");
}

function stringField(record: Record<string, unknown> | null, keys: readonly string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = asNonEmptyString(record[key]);
    if (value) return value;
  }
  return null;
}

function numberField(record: Record<string, unknown> | null, keys: readonly string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

export function languageFromPath(path: string | null | undefined): string {
  if (!path) return "plaintext";
  const base = path.split(/[\\/]/).pop() || path;
  if (/^dockerfile$/i.test(base) || /\.dockerfile$/i.test(base)) return "dockerfile";
  const ext = base.includes(".") ? base.split(".").pop()?.toLowerCase() : "";
  if (!ext) return "plaintext";
  return EXT_TO_LANG[ext] ?? "plaintext";
}

// Claude Read prefixes (`     1|`) and `cat -n` tabs. Do not match `N:` —
// that is valid Go/JSON/YAML content. Grok `content_concise` injects `N→`
// on every tenth line.
const READ_LINE_PREFIX = /^\s*\d+[|\t]/;
const READ_LINE_ARROW = /^\s*\d+→/;

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

function looksLikePath(line: string): boolean {
  const value = line.trim();
  if (!value || value.startsWith("http://") || value.startsWith("https://")) return false;
  if (value.includes("://")) return false;
  if (/\s/.test(value) && !value.includes("/")) return false;
  return /[\\/]/.test(value) || /\.[\w]{1,8}$/.test(value);
}

const SEARCH_HIT_RE = /^(.+?):(\d+)(?::\d+)?:(.*)$/;

export function parseSearchOutput(text: string): { hits: SearchHit[] } | { paths: string[] } | null {
  const lines = text.split("\n").map((line) => line.trimEnd()).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;

  const hits: SearchHit[] = [];
  for (const line of lines) {
    const match = SEARCH_HIT_RE.exec(line.trim());
    if (!match) continue;
    const path = match[1]?.trim();
    if (!path || !looksLikePath(path)) continue;
    hits.push({
      path,
      line: Number(match[2]),
      text: (match[3] ?? "").trim(),
    });
  }
  if (hits.length > 0 && hits.length >= Math.ceil(lines.length * 0.5)) {
    return { hits };
  }

  if (lines.every((line) => looksLikePath(line.trim()))) {
    return { paths: lines.map((line) => line.trim()) };
  }
  return null;
}

function asLineNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

export function parseStructuredSearchHits(value: unknown): SearchHit[] | null {
  const record = asRecord(value);
  if (!record) return null;
  const files = record.file_matches ?? record.matches ?? record.results ?? record.hits;
  if (!Array.isArray(files) || files.length === 0) return null;

  const hits: SearchHit[] = [];
  for (const file of files) {
    if (typeof file === "string") {
      const match = SEARCH_HIT_RE.exec(file.trim());
      if (match?.[1]) {
        hits.push({
          path: match[1].trim(),
          line: Number(match[2]),
          text: (match[3] ?? "").trim(),
        });
      } else if (looksLikePath(file.trim())) {
        hits.push({ path: file.trim(), text: "" });
      }
      continue;
    }
    const row = asRecord(file);
    if (!row) continue;
    const path = stringField(row, ["path", "file", "filename", "uri"]);
    const nested = row.matches ?? row.hits ?? row.lines;
    if (path && Array.isArray(nested) && nested.length > 0) {
      for (const item of nested) {
        if (typeof item === "string") {
          hits.push({ path, text: item.trim() });
          continue;
        }
        const hit = asRecord(item);
        if (!hit) continue;
        hits.push({
          path,
          line: asLineNumber(hit.line_number ?? hit.line ?? hit.lineNumber),
          text: asNonEmptyString(hit.content ?? hit.text ?? hit.line_text) ?? "",
        });
      }
      continue;
    }
    if (path) {
      hits.push({
        path,
        line: asLineNumber(row.line_number ?? row.line ?? row.lineNumber),
        text: asNonEmptyString(row.content ?? row.text ?? row.line_text) ?? "",
      });
    }
  }
  return hits.length > 0 ? hits : null;
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

export function parseListDirTree(text: string): TreeEntry[] | null {
  const entries: TreeEntry[] = [];
  let items = 0;
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    const item = /^( *)(?:[-*] )(.+)$/.exec(raw);
    if (item) {
      let name = item[2].trim();
      const isDir = /[/\\]$/.test(name);
      if (isDir) name = name.replace(/[/\\]+$/, "");
      entries.push({
        name,
        indent: item[1].length,
        isDir,
        kind: "item",
      });
      items += 1;
      continue;
    }
    const note = /^( *)\[(.+)\]\s*$/.exec(raw);
    if (note) {
      entries.push({
        name: note[2],
        indent: note[1].length,
        isDir: false,
        kind: "note",
      });
    }
  }
  return items >= 2 ? entries : null;
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

function lineRangeFrom(
  input: Record<string, unknown> | null,
  output: Record<string, unknown> | null,
): ToolLineRange | null {
  const offset = numberField(output, ["offset"]) ?? numberField(input, ["offset"]);
  const limit = numberField(output, ["limit"]) ?? numberField(input, ["limit"]);
  const startLine = numberField(output, ["start_line", "startLine", "line", "start"])
    ?? numberField(input, ["start_line", "startLine", "line", "start"]);
  const endLine = numberField(output, ["end_line", "endLine", "end"])
    ?? numberField(input, ["end_line", "endLine", "end"]);
  const total = numberField(output, ["total_lines", "totalLines"]) ?? undefined;
  if (offset == null && limit == null && startLine == null && endLine == null) return null;
  const start = Math.max(1, startLine ?? offset ?? 1);
  const requestedEnd = endLine
    ?? (limit != null ? start + Math.max(0, limit) - 1 : (total ?? start));
  const end = total != null ? Math.min(requestedEnd, total) : requestedEnd;
  if (start <= 1 && total != null && end >= total) return null;
  return { start, end, total };
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

function looksLikeMarkdown(text: string): boolean {
  if (!text.trim()) return false;
  return (
    /^#{1,6}\s/m.test(text) ||
    /```/.test(text) ||
    /^\s*[-*+]\s+\S/m.test(text) ||
    /^\s*\d+\.\s+\S/m.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text)
  );
}

function isByteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}

function decodeByteSource(value: unknown): string | null {
  if (value instanceof Uint8Array) {
    return new TextDecoder("utf-8", { fatal: false }).decode(value);
  }
  const record = asRecord(value);
  if (record && record.type === "Buffer" && Array.isArray(record.data)) {
    return decodeByteSource(record.data);
  }
  if (Array.isArray(value) && value.length > 0 && value.every(isByteNumber)) {
    return new TextDecoder("utf-8", { fatal: false }).decode(Uint8Array.from(value));
  }
  return null;
}

function decodeToolText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return decodeByteSource(value);
}

function stripPromptExitPrefix(text: string): string {
  return text.replace(/^exit:\s*-?\d+\s*\n/, "");
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (Array.isArray(value) && value.length > 24 && value.every(isByteNumber)) {
    return `<bytes ${value.length}>`;
  }
  return value;
}

function prettyJson(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!looksLikeJson(trimmed)) return null;
    try {
      return JSON.stringify(JSON.parse(trimmed), jsonReplacer, 2);
    } catch {
      return null;
    }
  }
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value, jsonReplacer, 2);
    } catch {
      return null;
    }
  }
  return null;
}

function extractContentText(content?: AgentToolCallContentItem[]): string | null {
  const parts = (content ?? [])
    .filter((item): item is Extract<AgentToolCallContentItem, { type: "text" }> => item.type === "text")
    .map((item) => item.text)
    .filter((text) => text.trim().length > 0);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

const OUTPUT_TEXT_KEYS = [
  "stdout",
  "raw_output",
  "output",
  "output_for_prompt",
  "text",
  "data",
  "result",
  "content",
] as const;

function extractOutputTextFromValue(raw: unknown): string | null {
  if (raw == null) return null;
  if (Array.isArray(raw) && raw.length > 0 && raw.every((item) => typeof item === "string")) {
    return raw.join("\n");
  }
  const direct = decodeToolText(raw);
  if (direct != null && direct.trim() && !asRecord(raw)) return direct;

  const record = asRecord(raw);
  if (!record) return direct?.trim() ? direct : null;

  for (const key of OUTPUT_TEXT_KEYS) {
    const decoded = decodeToolText(record[key]);
    if (decoded == null || !decoded.trim()) continue;
    return key === "output_for_prompt" ? stripPromptExitPrefix(decoded) : decoded;
  }
  const file = asRecord(record.file);
  if (file) {
    const nested = decodeToolText(file.content) ?? decodeToolText(file.text);
    if (nested?.trim()) return nested;
  }
  const stderr = decodeToolText(record.stderr);
  return stderr?.trim() ? stderr : null;
}

export function extractOutputText(raw: unknown): string | null {
  if (typeof raw === "string" && looksLikeJson(raw)) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        const nested = extractOutputTextFromValue(parsed);
        if (nested?.trim()) return nested;
      }
    } catch {
      // Fall through to the original string.
    }
  }
  return extractOutputTextFromValue(raw);
}

function extractErrorText(args: {
  raw_output?: unknown;
  detail?: unknown;
  description?: string;
  contentText?: string | null;
}): string | null {
  const { raw_output, detail, description, contentText } = args;
  if (typeof raw_output === "string" && raw_output.trim()) return raw_output;
  const outputRecord = asRecord(raw_output);
  if (outputRecord) {
    const msg = outputRecord.message ?? outputRecord.error ?? outputRecord.reason;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  if (contentText?.trim()) return contentText;
  const detailRecord = asRecord(detail);
  if (detailRecord) {
    const msg = detailRecord.message ?? detailRecord.error ?? detailRecord.reason;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  if (typeof detail === "string" && detail.trim()) return detail;
  if (description && description.trim() && description.trim().toLowerCase() !== "tool") {
    return description;
  }
  return null;
}

function pathFromDescription(description?: string): string | null {
  if (!description) return null;
  const match = description.match(
    /^(?:read(?:file)?|view(?:_file)?|read_file|listdir|list_dir):\s+(.+)$/i,
  );
  const path = match?.[1]?.trim();
  return path && looksLikePath(path) ? path : null;
}

function recordWithNestedInputs(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;
  for (const key of NESTED_INPUT_KEYS) {
    const nested = asRecord(record[key]);
    if (nested) return { ...record, ...nested };
  }
  return record;
}

export function extractPath(
  rawInput: unknown,
  content?: AgentToolCallContentItem[],
): string | null {
  const fromInput = stringField(recordWithNestedInputs(rawInput), PATH_KEYS);
  if (fromInput) return fromInput;
  const diff = (content ?? []).find((item) => item.type === "diff");
  if (diff && diff.type === "diff" && diff.path?.trim()) return diff.path;
  return null;
}

function collectDiffFiles(
  content: AgentToolCallContentItem[] | undefined,
  rawOutput: unknown,
  fallbackPath: string | null,
): ToolDiffFile[] {
  const fromContent = (content ?? []).flatMap((item) => {
    if (item.type !== "diff") return [];
    return [{
      path: item.path?.trim() || fallbackPath || "file",
      oldContent: item.old_content ?? "",
      newContent: item.new_content ?? "",
    }];
  });
  if (fromContent.length > 0) return fromContent;
  if (isDiffObject(rawOutput)) {
    return [{
      path: rawOutput.name ?? fallbackPath ?? "file",
      oldContent: rawOutput.old_content,
      newContent: rawOutput.new_content,
    }];
  }
  const record = asRecord(rawOutput);
  if (record) {
    const oldContent = typeof record.old_string === "string"
      ? record.old_string
      : typeof record.old_content === "string"
        ? record.old_content
        : typeof record.oldText === "string"
          ? record.oldText
          : null;
    const newContent = typeof record.new_string === "string"
      ? record.new_string
      : typeof record.new_content === "string"
        ? record.new_content
        : typeof record.newText === "string"
          ? record.newText
          : null;
    if (oldContent != null || newContent != null) {
      return [{
        path: fallbackPath || "file",
        oldContent: oldContent ?? "",
        newContent: newContent ?? "",
      }];
    }
  }
  return [];
}

function parseTodos(value: unknown): TodoItem[] | null {
  const record = asRecord(value);
  const list = Array.isArray(value) ? value : record?.todos;
  if (!Array.isArray(list) || list.length === 0) return null;
  const todos: TodoItem[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const content = asNonEmptyString(row.content)
      ?? asNonEmptyString(row.activeForm)
      ?? asNonEmptyString(row.text);
    if (!content) continue;
    todos.push({
      content,
      status: typeof row.status === "string" ? row.status : "pending",
    });
  }
  return todos.length > 0 ? todos : null;
}

function flattenInputRows(rawInput: unknown): ToolInputRow[] {
  const record = asRecord(rawInput);
  if (!record) return [];
  const rows: ToolInputRow[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (SKIP_INPUT_KEYS.has(key)) continue;
    if (value == null) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const text = String(value);
      if (!text.trim()) continue;
      rows.push({ key, value: text });
      continue;
    }
    if (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number")) {
      rows.push({ key, value: value.map(String).join(", ") });
    }
  }
  return rows;
}

function looksLikeFileBody(text: string): boolean {
  return text.includes("\n") || text.length > 200;
}

function hasSearchQuery(record: Record<string, unknown> | null): boolean {
  return stringField(record, ["pattern", "glob", "query", "regex", "q", "search", "search_term"]) != null;
}

function applySearchOutput(text: string): ToolPresentation | null {
  const parsed = parseSearchOutput(text);
  if (parsed && "hits" in parsed) return { kind: "search", hits: parsed.hits };
  if (parsed && "paths" in parsed) return { kind: "files", paths: parsed.paths };
  return null;
}

function presentationHidesInput(presentation: ToolPresentation): boolean {
  switch (presentation.kind) {
    case "diff":
    case "patch":
    case "code":
    case "todos":
    case "move":
    case "delete":
    case "markdown":
    case "files":
    case "search":
    case "web_search":
    case "web_fetch":
    case "tree":
      return true;
    default:
      return false;
  }
}

export function parseToolResult(block: {
  tool: string;
  description?: string;
  status?: string;
  raw_input?: unknown;
  content?: AgentToolCallContentItem[];
  raw_output?: unknown;
  detail?: unknown;
}): ParsedToolResult {
  const inputEnvelope = unwrapVendorToolEnvelope(block.raw_input);
  const outputEnvelope = unwrapVendorToolEnvelope(block.raw_output)
    ?? unwrapVendorToolEnvelope(block.detail);
  const resolvedTool = !isGenericToolName(block.tool)
    ? block.tool
    : (inputEnvelope?.toolType ?? outputEnvelope?.toolType ?? block.tool);
  const resolvedInput = recordWithNestedInputs(inputEnvelope?.payload ?? block.raw_input)
    ?? inputEnvelope?.payload
    ?? block.raw_input;
  const resolvedOutput = outputEnvelope?.payload ?? block.raw_output;
  const path = extractPath(resolvedInput, block.content)
    ?? extractPath(resolvedOutput, block.content)
    ?? pathFromDescription(block.description);
  const inputRows = flattenInputRows(resolvedInput);
  const failed = (block.status ?? "").toLowerCase() === "failed";
  const contentText = extractContentText(block.content);
  const outputText = extractOutputText(resolvedOutput);
  const inputRecord = asRecord(resolvedInput);
  const primaryText = isReadTool(resolvedTool) || isShellTool(resolvedTool)
    ? (outputText ?? contentText)
    : (contentText ?? outputText);

  const diffs = collectDiffFiles(block.content, resolvedOutput, path);
  let presentation: ToolPresentation = { kind: "empty" };

  if (diffs.length > 0) {
    presentation = { kind: "diff", files: diffs };
  } else if (
    typeof resolvedOutput === "string" &&
    isDiffString(resolvedOutput)
  ) {
    presentation = { kind: "patch", path, patch: resolvedOutput };
  } else {
    const todos = parseTodos(resolvedInput) ?? parseTodos(resolvedOutput);
    const from = stringField(inputRecord, FROM_KEYS);
    const to = stringField(inputRecord, TO_KEYS);

    const written = stringField(inputRecord, ["contents", "content", "new_content", "new_string"]);
    const structuredHits = parseStructuredSearchHits(resolvedOutput);
    const searchPresentation = structuredHits
      ? { kind: "search" as const, hits: structuredHits }
      : (primaryText ? applySearchOutput(primaryText) : null);
    const treeEntries = primaryText ? parseListDirTree(primaryText) : null;
    const webSearch = parseWebSearchPresentation(resolvedTool, resolvedInput, resolvedOutput, primaryText);
    const webFetch = parseWebFetchPresentation(resolvedTool, resolvedInput, resolvedOutput, primaryText);

    if (todos && (isTodoTool(resolvedTool) || parseTodos(resolvedInput))) {
      presentation = { kind: "todos", todos };
    } else if (isMoveTool(resolvedTool) && from && to) {
      presentation = { kind: "move", from, to };
    } else if (isDeleteTool(resolvedTool) && path) {
      presentation = { kind: "delete", path };
    } else if (webSearch) {
      presentation = webSearch;
    } else if (webFetch) {
      presentation = webFetch;
    } else if (isListDirTool(resolvedTool) && treeEntries) {
      presentation = { kind: "tree", entries: treeEntries };
    } else if (isListDirTool(resolvedTool) && primaryText) {
      presentation = { kind: "text", text: primaryText };
    } else if (isSearchTool(resolvedTool) && searchPresentation) {
      presentation = searchPresentation;
    } else if (isSearchTool(resolvedTool) && primaryText) {
      presentation = { kind: "text", text: primaryText };
    } else if (searchPresentation && (hasSearchQuery(inputRecord) || searchPresentation.kind === "search")) {
      presentation = searchPresentation;
    } else if (parseLoadedToolNames(primaryText) || parseLoadedToolNames(resolvedOutput)) {
      const names = parseLoadedToolNames(primaryText) ?? parseLoadedToolNames(resolvedOutput) ?? [];
      presentation = { kind: "text", text: names.join(", ") };
    } else if (isReadTool(resolvedTool) && primaryText) {
      presentation = {
        kind: "code",
        path,
        language: languageFromPath(path),
        code: stripReadLineNumbers(primaryText),
      };
    } else if (isEditTool(resolvedTool) && path && written) {
      presentation = {
        kind: "diff",
        files: [{
          path,
          oldContent: stringField(inputRecord, ["old_string", "old_content", "oldText"]) ?? "",
          newContent: written,
        }],
      };
    } else if (isThinkTool(resolvedTool) && primaryText) {
      presentation = looksLikeMarkdown(primaryText)
        ? { kind: "markdown", markdown: primaryText }
        : { kind: "text", text: primaryText };
    } else if (
      primaryText &&
      path &&
      looksLikePath(path) &&
      looksLikeFileBody(primaryText) &&
      !hasSearchQuery(inputRecord) &&
      !searchPresentation
    ) {
      presentation = {
        kind: "code",
        path,
        language: languageFromPath(path),
        code: stripReadLineNumbers(primaryText),
      };
    } else {
      const jsonFromObject = !primaryText ? prettyJson(resolvedOutput) : null;
      const jsonFromText = primaryText ? prettyJson(primaryText) : null;
      if (jsonFromObject) {
        presentation = { kind: "json", json: jsonFromObject };
      } else if (jsonFromText) {
        presentation = { kind: "json", json: jsonFromText };
      } else if (primaryText) {
        presentation = looksLikeMarkdown(primaryText) && primaryText.length > 80
          ? { kind: "markdown", markdown: primaryText }
          : { kind: "text", text: primaryText };
      }
    }
  }

  if (failed) {
    const errorText = extractErrorText({
      raw_output: block.raw_output,
      detail: block.detail,
      description: block.description,
      contentText,
    });
    if (
      presentation.kind !== "diff"
      && presentation.kind !== "patch"
      && presentation.kind !== "web_search"
      && presentation.kind !== "web_fetch"
    ) {
      presentation = { kind: "error", text: errorText ?? contentText ?? "" };
    } else if (presentation.kind === "web_fetch" && errorText) {
      presentation = { ...presentation, text: errorText };
    }
  }

  const showInput = inputRows.length > 0 && !presentationHidesInput(presentation);

  return {
    path: path ?? (presentation.kind === "diff" ? presentation.files[0]?.path ?? null : null),
    presentation,
    inputRows,
    showInput,
    resolvedTool,
    lineRange: lineRangeFrom(inputRecord, asRecord(resolvedOutput)),
  };
}
