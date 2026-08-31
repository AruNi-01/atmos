import type { AgentPart, AgentToolKind } from "@atmos/api-types/ws/dto/agent-chat";
import {
  detectBackgroundCommand,
  isBackgroundPollTool,
  isBackgroundToolCall as detectBackgroundTool,
} from "@/features/agent/lib/agent/background-command";

export type AgentToolCallPart = Extract<AgentPart, { type: "tool_call" }>;

export type ClassifiedTool =
  | { type: "thinking" }
  | { type: "plan" }
  | { type: "hide" }
  | { type: "tool"; kind: AgentToolKind };

function normalizeLabel(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasPlanMarkdown(input: unknown): boolean {
  const plan = asRecord(input)?.plan;
  return typeof plan === "string" && plan.trim().length > 0;
}

function hasSubagentInput(input: unknown): boolean {
  const record = asRecord(input);
  if (!record) return false;
  if (typeof record.subagent_type === "string" && record.subagent_type.trim()) return true;
  return normalizeLabel(typeof record._toolName === "string" ? record._toolName : "") === "task";
}

function hasSkillInput(input: unknown): boolean {
  const skill = asRecord(input)?.skill;
  return typeof skill === "string" && skill.length > 0;
}

function webActionType(input?: unknown): string | null {
  const action = asRecord(asRecord(input)?.action);
  const type = typeof action?.type === "string" ? action.type.trim().toLowerCase() : "";
  return type || null;
}

function hasHttpUrl(value: unknown): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

const EXECUTE_LABELS = new Set([
  "execute",
  "bash",
  "shell",
  "terminal",
  "run_command",
  "command",
  "run_terminal_cmd",
  "run_script",
  "powershell",
  "cmd",
  "exec",
]);

function isExecuteLabel(value: string): boolean {
  return EXECUTE_LABELS.has(value)
    || value.endsWith("_bash")
    || value.endsWith("_shell")
    || value.endsWith("_exec");
}

function isTodoLabel(value: string): boolean {
  return value === "todowrite" || value === "todo_write" || value === "todo" || value === "todos";
}

export function isActiveToolStatus(status?: string | null): boolean {
  const value = (status ?? "").trim().toLowerCase();
  return value === "running" || value === "in_progress" || value === "pending";
}

export function isBackgroundToolCall(part: {
  name?: string | null;
  title?: string | null;
  status?: string | null;
  input?: unknown;
  output?: unknown;
  tool_call_id?: string;
}): boolean {
  return detectBackgroundTool(part);
}

export { displayBackgroundCommand, isLiveBackgroundToolCall } from "@/features/agent/lib/agent/background-command";

function hasCommandInput(input?: unknown): boolean {
  const record = asRecord(input);
  if (!record) return false;
  for (const key of ["command", "cmd", "script", "bash", "shell"] as const) {
    if (typeof record[key] === "string" && record[key].trim()) return true;
  }
  const nested = asRecord(record.args) ?? asRecord(record.parameters) ?? asRecord(record.input);
  if (!nested) return false;
  for (const key of ["command", "cmd", "script", "bash", "shell"] as const) {
    if (typeof nested[key] === "string" && nested[key].trim()) return true;
  }
  return false;
}

function isWebSearchInput(input?: unknown): boolean {
  const record = asRecord(input);
  if (!record) return false;
  const action = webActionType(input);
  if (action === "search" || action === "web_search") return true;
  if (hasHttpUrl(record.url) || hasHttpUrl(record.uri)) return false;
  const query = record.query ?? record.q ?? record.search_term;
  if (typeof query !== "string" || !query.trim()) return false;
  return Array.isArray(record.sources) || Array.isArray(record.results);
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

function isWebFetchInput(input?: unknown): boolean {
  const action = webActionType(input);
  if (action && WEB_FETCH_ACTIONS.has(action)) return true;
  const record = asRecord(input);
  if (!record) return false;
  const nested = asRecord(record.action);
  return hasHttpUrl(record.url)
    || hasHttpUrl(record.uri)
    || hasHttpUrl(record.href)
    || hasHttpUrl(nested?.url)
    || hasHttpUrl(nested?.uri)
    || hasHttpUrl(nested?.href);
}

function envelopeType(value?: unknown): string {
  const record = asRecord(value);
  const type = typeof record?.type === "string"
    ? record.type
    : typeof record?.variant === "string"
      ? record.variant
      : "";
  return normalizeLabel(type);
}

function toolValueText(value?: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        const row = asRecord(item);
        return typeof row?.text === "string" ? row.text : "";
      })
      .filter((text) => text.trim())
      .join("\n");
  }
  const record = asRecord(value);
  if (!record) return "";
  for (const key of ["text", "content", "output", "result", "markdown"]) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key];
  }
  return "";
}

const LOADED_TOOLS_RE = /^\s*Loaded\s+(\d+)\s+tools?(?:\(s\))?:\s*(.+)\s*$/i;

export function parseLoadedToolNames(value?: unknown): string[] | null {
  const text = toolValueText(value).trim();
  if (!text) return null;
  const match = text.match(LOADED_TOOLS_RE);
  if (!match) return null;
  const names = match[2]
    .split(/,\s*/)
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0 ? names : null;
}

function looksLikeWebFetchOutput(output?: unknown): boolean {
  const type = envelopeType(output);
  if (
    type === "fetch"
    || type === "web_fetch"
    || type === "webfetch"
    || type.includes("web_fetch")
    || type.endsWith("_fetch")
    || type === "browse_page"
    || type === "browse"
  ) {
    return true;
  }
  return /^\s*URL Content from:\s*"?https?:\/\//im.test(toolValueText(output));
}

function looksLikeWebSearchOutput(output?: unknown): boolean {
  const type = envelopeType(output);
  if (type === "web_search" || type === "websearch" || type.includes("web_search")) return true;
  return /^\s*Web Search Results for:/im.test(toolValueText(output));
}

function looksLikeReadOutput(output?: unknown): boolean {
  const type = envelopeType(output);
  return ["read", "readfile", "read_file", "view", "view_file"].includes(type);
}

export function classifyTool(
  name?: string | null,
  title?: string | null,
  input?: unknown,
  output?: unknown,
): ClassifiedTool {
  const toolName = normalizeLabel(name);
  const toolTitle = normalizeLabel(title);
  const inputType = envelopeType(input);
  const outputType = envelopeType(output);

  if (isBackgroundPollTool({ name, title, input, output })) {
    return { type: "hide" };
  }
  if (["think", "thought", "thinking", "reasoning", "reason"].includes(toolName)) {
    return { type: "thinking" };
  }
  if (
    isTodoLabel(toolName)
    || isTodoLabel(toolTitle)
    || toolTitle.includes("todo list updated")
    || planFromToolInput(input) != null
  ) {
    return { type: "plan" };
  }
  if (toolName === "switchmode" || toolName === "switch_mode") {
    if (toolTitle.includes("ready to code") || hasPlanMarkdown(input)) return { type: "plan" };
    return { type: "hide" };
  }
  if (toolName === "task" || toolName === "agent" || toolName === "subagent" || hasSubagentInput(input)) {
    return { type: "tool", kind: "subagent" };
  }
  if (toolName.includes("skill") || hasSkillInput(input)) {
    return { type: "tool", kind: "skill" };
  }

  if (parseLoadedToolNames(output) || parseLoadedToolNames(input)) {
    return { type: "tool", kind: "other" };
  }

  if (
    ["read", "readfile", "read_file", "view", "view_file", "listdir", "list_dir", "list_directory", "ls"].includes(toolName)
    || ["read", "readfile", "read_file", "view", "view_file", "listdir", "list_dir", "list_directory", "ls"].includes(inputType)
    || ["read", "readfile", "read_file", "view", "view_file", "listdir", "list_dir", "list_directory", "ls"].includes(outputType)
    || looksLikeReadOutput(output)
  ) {
    return { type: "tool", kind: "read" };
  }
  if (["edit", "write", "write_file", "searchreplace", "search_replace", "str_replace", "strreplace"].includes(toolName)) {
    return { type: "tool", kind: "edit" };
  }
  if (toolName === "delete") return { type: "tool", kind: "delete" };
  if (toolName === "move") return { type: "tool", kind: "move" };
  if (isWebFetchInput(input) || looksLikeWebFetchOutput(output)) {
    return { type: "tool", kind: "fetch" };
  }
  if (
    ["search", "glob", "grep", "grepsearch", "grep_search", "web_search", "websearch"].includes(toolName)
    || toolName.includes("web_search")
    || isWebSearchInput(input)
    || looksLikeWebSearchOutput(output)
  ) {
    return { type: "tool", kind: "search" };
  }
  if (
    isExecuteLabel(toolName)
    || isExecuteLabel(inputType)
    || isExecuteLabel(outputType)
    || hasCommandInput(input)
    || detectBackgroundCommand({ name, title, input, output }) != null
  ) {
    return { type: "tool", kind: "execute" };
  }
  if (
    toolName === "fetch"
    || toolName === "web_fetch"
    || toolName === "webfetch"
    || toolName.includes("web_fetch")
    || toolName.endsWith("_fetch")
    || toolName === "browse_page"
    || toolName.includes("browse_page")
  ) {
    return { type: "tool", kind: "fetch" };
  }
  return { type: "tool", kind: "other" };
}

export function thinkingText(tool: {
  title?: string | null;
  input?: unknown;
  output?: unknown;
}): string {
  if (typeof tool.output === "string" && tool.output.trim()) return tool.output;
  if (typeof tool.input === "string" && tool.input.trim()) return tool.input;
  const record = asRecord(tool.input);
  if (record) {
    for (const key of ["thought", "text", "content", "prompt"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return (tool.title || "").trim();
}

export function planFromToolInput(input: unknown): unknown | null {
  const record = asRecord(input);
  if (record && Array.isArray(record.entries)) return record;
  const list = Array.isArray(input) ? input : record?.todos;
  if (Array.isArray(list) && list.length > 0) {
    const entries = list.flatMap((item) => {
      const row = asRecord(item);
      if (!row) return [];
      const content =
        (typeof row.content === "string" && row.content.trim() && row.content)
        || (typeof row.activeForm === "string" && row.activeForm.trim() && row.activeForm)
        || (typeof row.text === "string" && row.text.trim() && row.text)
        || "";
      if (!content) return [];
      return [{
        content,
        priority: typeof row.priority === "string" ? row.priority : "medium",
        status: typeof row.status === "string" ? row.status : "pending",
      }];
    });
    if (entries.length > 0) return { entries };
  }
  const plan = record?.plan;
  if (typeof plan === "string" && plan.trim()) {
    return { entries: [{ content: plan, priority: "medium", status: "pending" }] };
  }
  return null;
}

const GENERIC_TOOL_LABELS = new Set([
  "",
  "tool",
  "other",
  "unknown",
  "read",
  "search",
  "execute",
  "edit",
  "fetch",
  "delete",
  "move",
  "run_script",
  "run_command",
  "bash",
  "shell",
  "command",
]);

/** ACP kind titles and empty labels — not rich enough to hide path/command/query. */
export function isGenericToolLabel(value?: string | null): boolean {
  return GENERIC_TOOL_LABELS.has(normalizeLabel(value));
}
