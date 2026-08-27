import type { AgentToolCallContentItem } from "@/features/agent/hooks/use-agent-session";
import { isDiffObject, isDiffString } from "@/features/agent/lib/chat-helpers";

export type SearchHit = {
  path: string;
  line?: number;
  text: string;
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

const PATH_KEYS = ["file_path", "target_file", "path", "file", "filename", "uri"] as const;
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

function normalizeTool(tool: string): string {
  return (tool || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
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
  return toolEquals(tool, "search", "grep", "glob", "glob_file_search", "ripgrep", "find", "rg", "search_files");
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

export function languageFromPath(path: string | null | undefined): string {
  if (!path) return "plaintext";
  const base = path.split(/[\\/]/).pop() || path;
  if (/^dockerfile$/i.test(base) || /\.dockerfile$/i.test(base)) return "dockerfile";
  const ext = base.includes(".") ? base.split(".").pop()?.toLowerCase() : "";
  if (!ext) return "plaintext";
  return EXT_TO_LANG[ext] ?? "plaintext";
}

// Claude Read prefixes (`     1|`) and `cat -n` tabs. Do not match `N:` —
// that is valid Go/JSON/YAML content.
const READ_LINE_PREFIX = /^\s*\d+[|\t]/;

export function stripReadLineNumbers(text: string): string {
  const lines = text.split("\n");
  const candidates = lines.filter((line) => line.trim().length > 0);
  if (candidates.length === 0) return text;
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
  for (const key of ["output", "stdout", "content", "result", "text", "data"]) {
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
  const path = extractPath(block.raw_input, block.content);
  const inputRows = flattenInputRows(block.raw_input);
  const failed = (block.status ?? "").toLowerCase() === "failed";
  const contentText = extractContentText(block.content);
  const outputText = extractOutputText(block.raw_output);
  const primaryText = contentText ?? outputText;
  const inputRecord = asRecord(block.raw_input);

  const diffs = collectDiffFiles(block.content, block.raw_output, path);
  let presentation: ToolPresentation = { kind: "empty" };

  if (diffs.length === 1 && !diffs[0].oldContent.trim() && diffs[0].newContent.trim()) {
    presentation = {
      kind: "code",
      path: diffs[0].path,
      language: languageFromPath(diffs[0].path),
      code: diffs[0].newContent,
      hint: "new",
    };
  } else if (diffs.length === 1 && diffs[0].oldContent.trim() && !diffs[0].newContent.trim()) {
    presentation = {
      kind: "code",
      path: diffs[0].path,
      language: languageFromPath(diffs[0].path),
      code: diffs[0].oldContent,
      hint: "deleted",
    };
  } else if (diffs.length > 0) {
    presentation = { kind: "diff", files: diffs };
  } else if (
    typeof block.raw_output === "string" &&
    isDiffString(block.raw_output)
  ) {
    presentation = { kind: "patch", path, patch: block.raw_output };
  } else {
    const todos = parseTodos(block.raw_input) ?? parseTodos(block.raw_output);
    const from = stringField(inputRecord, FROM_KEYS);
    const to = stringField(inputRecord, TO_KEYS);

    const written = stringField(inputRecord, ["contents", "new_content", "new_string"]);
    const searchPresentation = primaryText ? applySearchOutput(primaryText) : null;

    if (todos && (isTodoTool(block.tool) || parseTodos(block.raw_input))) {
      presentation = { kind: "todos", todos };
    } else if (isMoveTool(block.tool) && from && to) {
      presentation = { kind: "move", from, to };
    } else if (isDeleteTool(block.tool) && path) {
      presentation = { kind: "delete", path };
    } else if (isFetchTool(block.tool) && primaryText) {
      presentation = looksLikeMarkdown(primaryText)
        ? { kind: "markdown", markdown: primaryText }
        : { kind: "text", text: primaryText };
    } else if (isSearchTool(block.tool) && primaryText) {
      presentation = searchPresentation ?? { kind: "text", text: primaryText };
    } else if (searchPresentation && (hasSearchQuery(inputRecord) || searchPresentation.kind === "search")) {
      presentation = searchPresentation;
    } else if (isReadTool(block.tool) && primaryText) {
      presentation = {
        kind: "code",
        path,
        language: languageFromPath(path),
        code: stripReadLineNumbers(primaryText),
      };
    } else if (isEditTool(block.tool) && path && written) {
      presentation = {
        kind: "code",
        path,
        language: languageFromPath(path),
        code: written,
        hint: "new",
      };
    } else if (isEditTool(block.tool) && path && primaryText && looksLikeFileBody(primaryText)) {
      presentation = {
        kind: "code",
        path,
        language: languageFromPath(path),
        code: stripReadLineNumbers(primaryText),
      };
    } else if (isThinkTool(block.tool) && primaryText) {
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
      const jsonFromObject = !primaryText ? prettyJson(block.raw_output) : null;
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

  const showInput = inputRows.length > 0 && (
    !presentationHidesInput(presentation) ||
    (presentation.kind === "code" && inputRows.some((row) => row.key === "offset" || row.key === "limit")) ||
    ((presentation.kind === "search" || presentation.kind === "files") &&
      inputRows.some((row) => row.key === "pattern" || row.key === "glob" || row.key === "query"))
  );

  return {
    path: path ?? (presentation.kind === "diff" ? presentation.files[0]?.path ?? null : null),
    presentation,
    inputRows,
    showInput,
  };
}
