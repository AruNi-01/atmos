import type {
  AgentChatSnapshot,
  AgentMessage,
  AgentQueueItem,
  AgentSessionOpRequest,
  AgentSessionUsage,
  GrokGoal,
  GrokWorkflow,
} from "@atmos/api-types/ws/dto/agent-chat";
import {
  isActiveToolStatus,
  isGrokChromeSubagent,
  isNestedSubagentChild,
  type AgentToolCallPart,
} from "@atmos/agent-transcript";
import { type CardId, orderedCardIds } from "./card-lane";
import { copy, historicPermissionTitle } from "./copy";

export type PendingPermission = NonNullable<AgentChatSnapshot["pending_permission"]>;

export type ContextUsageStats = {
  used: number;
  context_window: number;
  percent: number;
};

export type ComposerCardInput = {
  messages: AgentMessage[];
  pendingPermission: PendingPermission | null;
  pendingSessionOp: AgentSessionOpRequest | null;
  queue: AgentQueueItem[];
  grokGoal: GrokGoal | null;
  grokWorkflow: GrokWorkflow | null;
  sessionUsage: AgentSessionUsage | null;
};

export type BackgroundCommand = {
  id: string;
  command: string;
};

export type SubagentTitle = {
  id: string;
  title: string;
};

export type ComposerCards = {
  available: CardId[];
  permission: PendingPermission | null;
  sessionOp: AgentSessionOpRequest | null;
  plan: unknown | null;
  planText: string;
  planFilePath: string | null;
  background: BackgroundCommand[];
  queue: AgentQueueItem[];
  subagents: SubagentTitle[];
  /** Live tool parts for the current-turn panel. Fixture cards leave this empty. */
  subagentTools: AgentToolCallPart[];
  goal: GrokGoal | null;
  workflow: GrokWorkflow | null;
  context: ContextUsageStats | null;
};

const PLAN_FILE_RE = /(?:^|[/\\])(?:plan|PLAN)\.md$/i;

export function planBodyMarkdown(plan: unknown): string {
  if (typeof plan === "string") return plan;
  if (!plan || typeof plan !== "object") return "";
  const record = plan as { markdown?: unknown; content?: unknown };
  if (typeof record.markdown === "string") return record.markdown;
  if (typeof record.content === "string") return record.content;
  return "";
}

/** Panels that paint their own `rounded-3xl` border sit outside the lane frame. */
export function laneCardDrawsOwnFrame(
  visible: CardId | null,
  cards: Pick<ComposerCards, "subagentTools">,
): boolean {
  if (visible === "subagents") return cards.subagentTools.length > 0;
  return (
    visible === "goal" ||
    visible === "workflow" ||
    visible === "context" ||
    visible === "permission"
  );
}

export function contextUsageStats(
  usage: AgentSessionUsage | null | undefined,
): ContextUsageStats | null {
  if (usage?.used == null) return null;
  const window = usage.context_window ?? usage.size ?? null;
  if (window == null || window <= 0) return null;
  const percent = Math.min(100, Math.max(0, (usage.used / window) * 100));
  return { used: usage.used, context_window: window, percent };
}

export function isLiveBackgroundExecute(part: AgentToolCallPart): part is AgentToolCallPart & {
  params: Extract<AgentToolCallPart["params"], { type: "execute" }>;
} {
  return (
    part.kind === "execute" &&
    part.params?.type === "execute" &&
    part.params.background === true &&
    isActiveToolStatus(part.status)
  );
}

export function moveQueueItem(
  ids: readonly string[],
  id: string,
  direction: "up" | "down",
): string[] | null {
  const index = ids.indexOf(id);
  if (index < 0) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return null;
  const next = [...ids];
  const [moved] = next.splice(index, 1);
  if (!moved) return null;
  next.splice(target, 0, moved);
  return next;
}

export function cardPillTitle(
  id: CardId,
  source: {
    permission: Parameters<typeof historicPermissionTitle>[0] | null;
    goal: GrokGoal | null;
    workflow: GrokWorkflow | null;
  },
): string {
  switch (id) {
    case "permission":
      return source.permission
        ? historicPermissionTitle(source.permission)
        : copy.permissionRequested;
    case "session_op":
      return copy.sessionOpRequested;
    case "plan":
      return copy.planTitle;
    case "background":
      return copy.backgroundCommandsTitle;
    case "queue":
      return copy.messageQueueTitle;
    case "subagents":
      return copy.subagentTasksTitle;
    case "goal": {
      const objective = source.goal?.objective.trim() ?? "";
      return objective || copy.grokGoalTitle;
    }
    case "workflow": {
      const objective = source.workflow?.objective.trim() || source.workflow?.name.trim() || "";
      return objective || copy.grokWorkflowTitle;
    }
    case "context":
      return copy.contextWindowTitle;
  }
}

export function deriveComposerCards(input: ComposerCardInput): ComposerCards {
  const goal =
    input.grokGoal != null && input.grokGoal.status !== "cleared" ? input.grokGoal : null;
  const workflow =
    input.grokWorkflow != null && input.grokWorkflow.status !== "cleared"
      ? input.grokWorkflow
      : null;
  const planValue = latestPlanValue(input.messages);
  const plan = planValue != null && goal == null ? planValue : null;
  const background = liveBackgroundCommands(input.messages);
  const subagentTools = visibleSubagentParts(
    input.messages,
    goal,
    workflow,
    input.queue.length > 0,
  );
  const subagents = subagentTools.map((part) => ({
    id: part.tool_call_id,
    title: subagentTitle(part),
  }));
  const context = contextUsageStats(input.sessionUsage);
  const present: CardId[] = [];
  if (input.pendingPermission) present.push("permission");
  if (input.pendingSessionOp) present.push("session_op");
  if (plan != null) present.push("plan");
  if (input.queue.length > 0) present.push("queue");
  if (background.length > 0) present.push("background");
  if (subagents.length > 0) present.push("subagents");
  if (goal) present.push("goal");
  if (workflow) present.push("workflow");
  if (context) present.push("context");

  return {
    available: orderedCardIds(present),
    permission: input.pendingPermission,
    sessionOp: input.pendingSessionOp,
    plan,
    planText: planBodyMarkdown(plan),
    planFilePath: planExitFilePath(input.pendingPermission, input.messages),
    background,
    queue: input.queue,
    subagents,
    subagentTools,
    goal,
    workflow,
    context,
  };
}

function lastPromptIndex(messages: AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    const text = message.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n");
    if (isClaudeTaskNotification(text)) continue;
    return index;
  }
  return -1;
}

function isClaudeTaskNotification(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("<task-notification>") || trimmed.includes("<task-notification>");
}

function latestPlanValue(messages: AgentMessage[]): unknown | null {
  const start = lastPromptIndex(messages) + 1;
  for (let index = messages.length - 1; index >= start; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (part?.type !== "plan") continue;
      return part.plan === undefined ? null : part.plan;
    }
  }
  return null;
}

function liveBackgroundCommands(messages: AgentMessage[]): BackgroundCommand[] {
  const found: BackgroundCommand[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== "tool_call" || !isLiveBackgroundExecute(part)) continue;
      if (seen.has(part.tool_call_id)) continue;
      seen.add(part.tool_call_id);
      found.push({ id: part.tool_call_id, command: part.params.command.trim() });
    }
  }
  return found;
}

function grokChromeIds(goal: GrokGoal | null, workflow: GrokWorkflow | null): Set<string> {
  const ids = new Set<string>();
  if (goal) {
    for (const child of goal.children) {
      if (child.id) ids.add(child.id);
    }
  }
  if (workflow) {
    for (const agent of workflow.agents) {
      if (agent.id) ids.add(agent.id);
    }
  }
  return ids;
}

function isRosterSubagent(part: AgentToolCallPart, ids: Set<string>): boolean {
  if (isGrokChromeSubagent(part)) return true;
  if (part.kind !== "subagent" || ids.size === 0) return false;
  if (ids.has(part.tool_call_id)) return true;
  const taskId = part.params?.type === "subagent" ? part.params.task_id?.trim() : "";
  return Boolean(taskId && ids.has(taskId));
}

function subagentIsRunning(part: AgentToolCallPart): boolean {
  const status = (part.status ?? "").trim().toLowerCase();
  if (status === "failed" || status === "error") return false;
  return isActiveToolStatus(status);
}

function subagentTitle(part: AgentToolCallPart): string {
  const description = part.params?.type === "subagent" ? part.params.description.trim() : "";
  return part.title?.trim() || description || part.name.trim() || part.tool_call_id;
}

function visibleSubagentParts(
  messages: AgentMessage[],
  goal: GrokGoal | null,
  workflow: GrokWorkflow | null,
  followUpPending: boolean,
): AgentToolCallPart[] {
  const exclude = grokChromeIds(goal, workflow);
  const start = lastPromptIndex(messages) + 1;
  const items: AgentToolCallPart[] = [];
  const seen = new Set<string>();
  for (let index = start; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== "tool_call") continue;
      if (part.kind !== "subagent" || seen.has(part.tool_call_id)) continue;
      seen.add(part.tool_call_id);
      if (isNestedSubagentChild(part) || isRosterSubagent(part, exclude)) continue;
      items.push(part);
    }
  }
  return followUpPending ? items.filter(subagentIsRunning) : items;
}

function toolPath(part: AgentToolCallPart): string | null {
  const params = part.params;
  if (params?.type === "read" || params?.type === "edit" || params?.type === "delete") {
    return params.path.trim() || null;
  }
  if (params?.type === "move") return params.to.trim() || params.from.trim() || null;
  const result = part.result;
  if (result && "path" in result && typeof result.path === "string" && result.path.trim()) {
    return result.path.trim();
  }
  const title = (part.title || "").trim();
  if (PLAN_FILE_RE.test(title)) return title;
  return null;
}

export function planExitFilePath(
  permission: { description?: string | null } | null | undefined,
  messages: AgentMessage[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (part?.type !== "tool_call") continue;
      if (part.kind !== "edit" && part.kind !== "read" && part.kind !== "other") continue;
      const path = toolPath(part);
      if (path && PLAN_FILE_RE.test(path)) return path;
    }
  }
  const description = permission?.description?.trim() ?? "";
  if (!description) return null;
  if (PLAN_FILE_RE.test(description) || /[/\\].+\.md$/i.test(description)) return description;
  return null;
}

export function queueItemText(item: Pick<AgentQueueItem, "display_prompt" | "prompt">): string {
  return item.display_prompt ?? item.prompt;
}
