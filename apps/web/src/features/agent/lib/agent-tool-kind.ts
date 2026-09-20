import type {
  AgentPart,
  AgentToolKind,
  AgentToolParams,
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

function normalizeLabel(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function isPlanModeChromeTool(
  part: Pick<AgentToolCallPart, "name" | "title">,
): boolean {
  const blob = `${normalizeLabel(part.name)} ${normalizeLabel(part.title)}`;
  if (blob.includes("update_plan") || blob.includes("updateplan")) return false;
  return (
    blob.includes("enter_plan")
    || blob.includes("enterplan")
    || blob.includes("exit_plan")
    || blob.includes("exitplan")
    || blob.includes("approve_plan")
    || blob.includes("approveplan")
  );
}

/** Composer overlays own these — never extra transcript cards. */
export function isHiddenTranscriptChromePart(part: AgentPart): boolean {
  if (part.type === "plan" || part.type === "attachment") return true;
  if (part.type === "tool_call" && isPlanModeChromeTool(part)) return true;
  if (part.type === "session_config_change") {
    const hasModel = Boolean(part.model?.to?.trim());
    const hasMode = Boolean(part.mode?.to?.trim());
    return hasMode && !hasModel;
  }
  return false;
}

export function isEmptyToolJson(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}
