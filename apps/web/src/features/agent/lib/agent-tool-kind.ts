import type {
  AgentPart,
  AgentToolKind,
  AgentToolParams,
  AgentToolResult,
} from "@atmos/api-types/ws/dto/agent-chat";

export type AgentToolCallPart = Extract<AgentPart, { type: "tool_call" }>;

const TOOL_KINDS = new Set<AgentToolKind>([
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "web_search",
  "execute",
  "fetch",
  "skill",
  "subagent",
  "other",
]);

export function wireToolKind(kind?: string | null): AgentToolKind {
  if (kind && TOOL_KINDS.has(kind as AgentToolKind)) return kind as AgentToolKind;
  return "other";
}

export function defaultToolParams(kind: AgentToolKind): AgentToolParams {
  switch (kind) {
    case "read":
      return { type: "read", path: "" };
    case "edit":
      return { type: "edit", path: "" };
    case "delete":
      return { type: "delete", path: "" };
    case "move":
      return { type: "move", from: "", to: "" };
    case "search":
      return { type: "search", query: "" };
    case "web_search":
      return { type: "web_search", query: "" };
    case "execute":
      return { type: "execute", command: "", background: false };
    case "fetch":
      return { type: "fetch", url: "" };
    case "skill":
      return { type: "skill", skill: "" };
    case "subagent":
      return { type: "subagent", description: "" };
    case "other":
      return { type: "other", value: null };
  }
}

export function isActiveToolStatus(status?: string | null): boolean {
  const value = (status ?? "").trim().toLowerCase();
  return value === "running" || value === "in_progress" || value === "pending";
}

const GENERIC_TOOL_LABELS = new Set([
  "",
  "tool",
  "other",
  "unknown",
  "read",
  "search",
  "web_search",
  "execute",
  "edit",
  "write",
  "filechange",
  "file_change",
  "fetch",
  "delete",
  "move",
  "run_script",
  "run_command",
  "bash",
  "shell",
  "command",
]);

function normalizeLabel(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** ACP kind titles and empty labels — not rich enough to hide path/command/query. */
export function isGenericToolLabel(value?: string | null): boolean {
  return GENERIC_TOOL_LABELS.has(normalizeLabel(value));
}

export function isEmptyToolJson(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

export function isPlaceholderToolParams(params?: AgentToolParams | null): boolean {
  if (!params) return true;
  if (params.type !== "other") return false;
  return isEmptyToolJson(params.value);
}

export function isPlaceholderToolResult(result?: AgentToolResult | null): boolean {
  if (result == null) return true;
  if (result.type === "empty") return true;
  if (result.type === "other") return isEmptyToolJson(result.value);
  if (result.type === "text") return !result.text.trim();
  return false;
}
