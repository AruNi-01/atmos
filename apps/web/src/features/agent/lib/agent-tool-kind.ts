import type { AgentPart, AgentToolKind } from "@atmos/api-types/ws/dto/agent-chat";

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

export function classifyTool(
  name?: string | null,
  title?: string | null,
  input?: unknown,
): ClassifiedTool {
  const toolName = normalizeLabel(name);
  const toolTitle = normalizeLabel(title);

  if (["think", "thought", "thinking", "reasoning", "reason"].includes(toolName)) {
    return { type: "thinking" };
  }
  if (
    ["todowrite", "todo_write", "todo", "todos"].includes(toolName)
    || toolTitle.includes("todo list updated")
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

  if (["read", "readfile", "read_file", "view", "view_file", "listdir", "list_dir", "list_directory", "ls"].includes(toolName)) {
    return { type: "tool", kind: "read" };
  }
  if (["edit", "write", "write_file", "searchreplace", "search_replace", "str_replace", "strreplace"].includes(toolName)) {
    return { type: "tool", kind: "edit" };
  }
  if (toolName === "delete") return { type: "tool", kind: "delete" };
  if (toolName === "move") return { type: "tool", kind: "move" };
  if (["search", "glob", "grep", "grepsearch", "grep_search"].includes(toolName)) {
    return { type: "tool", kind: "search" };
  }
  if (
    ["execute", "bash", "shell", "terminal", "run_command", "command", "run_terminal_cmd", "powershell", "cmd"].includes(toolName)
    || toolName.endsWith("_bash")
    || toolName.endsWith("_shell")
  ) {
    return { type: "tool", kind: "execute" };
  }
  if (toolName === "fetch") return { type: "tool", kind: "fetch" };
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

export function isGenericToolLabel(value?: string | null): boolean {
  const label = normalizeLabel(value);
  return !label || label === "tool" || label === "other" || label === "unknown";
}
