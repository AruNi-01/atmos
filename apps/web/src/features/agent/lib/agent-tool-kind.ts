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
  "mcp_list",
  "mcp_call",
  "image_gen",
  "plan_document",
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
    case "mcp_list":
      return { type: "mcp_list", server: null };
    case "mcp_call":
      return { type: "mcp_call", server: null, tool: null };
    case "image_gen":
      return { type: "image_gen", prompt: "" };
    case "plan_document":
      return { type: "plan_document", plan: "", todos: [] };
    case "other":
      return { type: "other", value: null };
  }
}

export function isActiveToolStatus(status?: string | null): boolean {
  const value = (status ?? "").trim().toLowerCase();
  return value === "running" || value === "in_progress" || value === "pending";
}

/** Vendor poll that waits on a background subagent (`TaskOutput`, `AgentOutput`, …). */
export function isSubagentWaitTool(
  part: Pick<AgentToolCallPart, "name" | "title"> & Partial<Pick<AgentToolCallPart, "params">>,
): boolean {
  const name = normalizeLabel(part.name);
  const title = normalizeLabel(part.title);
  const raw = `${part.name} ${part.title ?? ""}`;
  const blob = `${name} ${title}`;
  if (
    blob.includes("taskoutput")
    || blob.includes("task_output")
    || blob.includes("agentoutput")
    || blob.includes("agent_output")
    || blob.includes("subagent_output")
    || blob.includes("get_command_or_subagent")
  ) {
    return true;
  }
  // Grok labels the poll with the child command instead of TaskOutput.
  if (raw.includes("[subagent:")) return true;
  if (otherParamsLookLikeWaitPoll(part.params)) return true;
  return blob.includes("wait") && (
    blob.includes("subagent")
    || blob.includes("background_agent")
    || blob.includes("backgroundagent")
  );
}

function otherParamsLookLikeWaitPoll(params: AgentToolCallPart["params"] | undefined): boolean {
  if (params?.type !== "other" || !params.value || typeof params.value !== "object") return false;
  const value = params.value as Record<string, unknown>;
  const variant = String(value.variant ?? value.type ?? "").toLowerCase();
  if (
    variant === "taskoutput"
    || variant === "task_output"
    || variant === "agentoutput"
    || variant === "agent_output"
  ) {
    return true;
  }
  return Array.isArray(value.task_ids) && value.task_ids.length > 0;
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
  "run_terminal_command",
  "bash",
  "shell",
  "command",
  "commandexecution",
  "command_execution",
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
