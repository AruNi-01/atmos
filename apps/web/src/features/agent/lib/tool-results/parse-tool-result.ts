import type { AgentToolCallContentItem } from "@/features/agent/hooks/use-agent-session";
import { isDiffObject, isDiffString } from "@/features/agent/lib/chat-helpers";

export type SearchHit = {
  path: string;
  line?: number;
  text: string;
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
  "target_file",
  "absolute_path",
  "path",
  "file",
  "filename",
  "uri",
  "absolute_root_path",
  "dir_path",
  "directory",
  "target_directory",
] as const;
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

function isFetchTool(tool: string): boolean {
  return toolEquals(tool, "fetch", "web_fetch", "webfetch", "web_search", "websearch");
}

function isSearchTool(tool: string): boolean {
  if (isFetchTool(tool)) return false;
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

function isThinkTool(tool: string): boolean {
  return toolEquals(tool, "think", "thought", "reasoning", "reason");
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

function lineRangeFrom(
  input: Record<string, unknown> | null,
  output: Record<string, unknown> | null,
): ToolLineRange | null {
  const offset = numberField(output, ["offset"]) ?? numberField(input, ["offset"]);
  const limit = numberField(output, ["limit"]) ?? numberField(input, ["limit"]);
  const total = numberField(output, ["total_lines", "totalLines"]) ?? undefined;
  if (offset == null && limit == null) return null;
  const start = Math.max(1, offset ?? 1);
  const requestedEnd = limit != null ? start + Math.max(0, limit) - 1 : (total ?? start);
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

function prettyJson(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!looksLikeJson(trimmed)) return null;
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return null;
    }
  }
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
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

export function extractOutputText(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    if (raw.length > 0 && raw.every((item) => typeof item === "string")) {
      return raw.join("\n");
    }
    return null;
  }
  const record = asRecord(raw);
  if (!record) return null;
  for (const key of ["raw_output", "output", "stdout", "content", "result", "text", "data"]) {
    const value = asNonEmptyString(record[key]);
    if (value) return value;
  }
  const file = asRecord(record.file);
  if (file) {
    const nested = asNonEmptyString(file.content) ?? asNonEmptyString(file.text);
    if (nested) return nested;
  }
  const stderr = asNonEmptyString(record.stderr);
  return stderr;
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

export function extractPath(
  rawInput: unknown,
  content?: AgentToolCallContentItem[],
): string | null {
  const fromInput = stringField(asRecord(rawInput), PATH_KEYS);
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
  return stringField(record, ["pattern", "glob", "query", "regex"]) != null;
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
  const resolvedInput = inputEnvelope?.payload ?? block.raw_input;
  const resolvedOutput = outputEnvelope?.payload ?? block.raw_output;
  const path = extractPath(resolvedInput, block.content)
    ?? extractPath(resolvedOutput, block.content);
  const inputRows = flattenInputRows(resolvedInput);
  const failed = (block.status ?? "").toLowerCase() === "failed";
  const contentText = extractContentText(block.content);
  const outputText = extractOutputText(resolvedOutput);
  const inputRecord = asRecord(resolvedInput);
  const primaryText = isReadTool(resolvedTool)
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

    if (todos && (isTodoTool(resolvedTool) || parseTodos(resolvedInput))) {
      presentation = { kind: "todos", todos };
    } else if (isMoveTool(resolvedTool) && from && to) {
      presentation = { kind: "move", from, to };
    } else if (isDeleteTool(resolvedTool) && path) {
      presentation = { kind: "delete", path };
    } else if (isListDirTool(resolvedTool) && treeEntries) {
      presentation = { kind: "tree", entries: treeEntries };
    } else if (isListDirTool(resolvedTool) && primaryText) {
      presentation = { kind: "text", text: primaryText };
    } else if (isFetchTool(resolvedTool) && primaryText) {
      presentation = looksLikeMarkdown(primaryText)
        ? { kind: "markdown", markdown: primaryText }
        : { kind: "text", text: primaryText };
    } else if (isSearchTool(resolvedTool) && searchPresentation) {
      presentation = searchPresentation;
    } else if (isSearchTool(resolvedTool) && primaryText) {
      presentation = { kind: "text", text: primaryText };
    } else if (searchPresentation && (hasSearchQuery(inputRecord) || searchPresentation.kind === "search")) {
      presentation = searchPresentation;
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
    if (presentation.kind !== "diff" && presentation.kind !== "patch") {
      presentation = { kind: "error", text: errorText ?? contentText ?? "" };
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
