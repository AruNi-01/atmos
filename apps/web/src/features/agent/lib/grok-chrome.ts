import type {
  AgentMessage,
  AgentPart,
  GrokGoal,
  GrokWorkflow,
  GrokWorkflowPhase,
} from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";

export const GROK_CHROME_SUBAGENT_NAME = "grok_chrome";
export const GROK_IMPLEMENTER_ID = "grok_implementer";

export function isGrokChromeSubagent(
  part: Pick<AgentToolCallPart, "kind" | "name">,
): boolean {
  return part.kind === "subagent" && part.name === GROK_CHROME_SUBAGENT_NAME;
}

export function grokChromeAgentIds(
  goal?: GrokGoal | null,
  workflow?: GrokWorkflow | null,
): Set<string> {
  const ids = new Set<string>();
  if (goal && goal.status !== "cleared") {
    for (const child of goal.children) {
      if (child.id) ids.add(child.id);
    }
  }
  if (workflow && workflow.status !== "cleared") {
    for (const agent of workflow.agents) {
      if (agent.id) ids.add(agent.id);
    }
  }
  return ids;
}

export function isGrokChromeRosterSubagent(
  part: Pick<AgentToolCallPart, "kind" | "name" | "tool_call_id" | "params">,
  rosterIds?: Iterable<string> | null,
): boolean {
  if (isGrokChromeSubagent(part)) return true;
  if (part.kind !== "subagent") return false;
  const ids = rosterIds instanceof Set ? rosterIds : new Set(rosterIds ?? []);
  if (ids.size === 0) return false;
  if (ids.has(part.tool_call_id)) return true;
  const taskId = part.params?.type === "subagent" ? part.params.task_id?.trim() : "";
  return Boolean(taskId && ids.has(taskId));
}

export type GrokChromePhaseSection = {
  id: string;
  title: string;
  state: string;
  agents: AgentToolCallPart[];
};

export function formatGrokTokens(tokens: number): string {
  const sign = tokens < 0 ? "-" : "";
  const abs = Math.abs(tokens);
  if (abs < 1000) return `${sign}${abs}`;
  if (abs < 1_000_000) {
    return `${sign}${(abs / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function formatGrokElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}h${String(mins).padStart(2, "0")}m`;
  if (mins > 0) return `${mins}m${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
}

export function grokGoalStatusKey(goal: GrokGoal): {
  status: string;
  phase: string | null;
} {
  const status = (goal.status || "active").toLowerCase();
  if (status === "complete" || status === "cleared") {
    return { status: "complete", phase: null };
  }
  if (
    status === "user_paused"
    || status === "back_off_paused"
    || status === "no_progress_paused"
    || status === "infra_paused"
    || status === "blocked"
    || status === "failed"
    || status === "interrupted"
    || status === "budget_limited"
  ) {
    return { status, phase: null };
  }
  if (goal.verifying_completion) return { status: "active", phase: "verifying" };
  if (goal.planning) return { status: "active", phase: "planning" };
  const phase = (goal.phase || "executing").toLowerCase();
  if (phase === "idle" || phase === "planning" || phase === "executing") {
    return { status: "active", phase };
  }
  return { status: "active", phase: "executing" };
}

const GOAL_PHASES = [
  { id: "planning", title: "Plan" },
  { id: "implementing", title: "Implement" },
  { id: "verifying", title: "Verify" },
  { id: "summarizing", title: "Summarize" },
] as const;

function grokGoalPhaseState(goal: GrokGoal, phaseId: string): string {
  const complete = goal.status === "complete" || goal.status === "cleared";
  const last = goal.last_event ?? "";
  if (phaseId === "planning") {
    if (goal.planning || last.includes("planning")) return "running";
    if (
      complete
      || goal.verifying_completion
      || goal.phase === "executing"
      || last.includes("worker")
      || last.includes("goal_completed")
    ) {
      return "completed";
    }
    return "pending";
  }
  if (phaseId === "implementing") {
    if (goal.verifying_completion || last.includes("verify") || last.includes("classifier")) {
      return "completed";
    }
    if (complete || last.includes("goal_completed") || last.includes("summar")) return "completed";
    if (goal.phase === "executing" && !goal.planning) return "running";
    return "pending";
  }
  if (phaseId === "verifying") {
    if (goal.verifying_completion || last.includes("verify") || last.includes("classifier")) {
      return "running";
    }
    if (complete || last.includes("goal_completed")) return "completed";
    return "pending";
  }
  if (last.includes("summar")) return "running";
  if (complete) return "completed";
  return "pending";
}

function stubAgent(
  id: string,
  label: string,
  state: string,
  agentType?: string | null,
): AgentToolCallPart {
  return {
    type: "tool_call",
    tool_call_id: id,
    name: GROK_CHROME_SUBAGENT_NAME,
    title: label,
    kind: "subagent",
    status: state === "running" || state === "active" ? "running" : state === "failed" ? "failed" : "completed",
    params: {
      type: "subagent",
      description: label,
      agent_type: agentType ?? null,
      task_id: id,
    },
  };
}

function resolveAgent(
  byId: Map<string, AgentToolCallPart>,
  id: string,
  label: string,
  state: string,
  agentType?: string | null,
): AgentToolCallPart {
  return byId.get(id) ?? stubAgent(id, label, state, agentType);
}

function collectToolCalls(messages: AgentMessage[]): AgentToolCallPart[] {
  const tools: AgentToolCallPart[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== "tool_call") continue;
      if (seen.has(part.tool_call_id)) continue;
      seen.add(part.tool_call_id);
      tools.push(part);
    }
  }
  return tools;
}

export function grokGoalPhaseSections(
  goal: GrokGoal | null | undefined,
  messages: AgentMessage[],
): GrokChromePhaseSection[] {
  if (!goal || goal.status === "cleared") return [];
  const tools = collectToolCalls(messages);
  const byId = new Map(tools.map((tool) => [tool.tool_call_id, tool]));
  return GOAL_PHASES.map((phase) => {
    const state = grokGoalPhaseState(goal, phase.id);
    const agents = goal.children
      .filter((child) => child.role === phase.id)
      .map((child) => resolveAgent(byId, child.id, child.label, state, child.agent_type));
    if (phase.id === "implementing") {
      agents.unshift(
        stubAgent(GROK_IMPLEMENTER_ID, "Implementer", state, "general-purpose"),
      );
    }
    return {
      id: phase.id,
      title: phase.title,
      state,
      agents,
    };
  });
}

export function grokWorkflowPhaseSections(
  workflow: GrokWorkflow | null | undefined,
  messages: AgentMessage[],
): GrokChromePhaseSection[] {
  if (!workflow || workflow.status === "cleared") return [];
  const tools = collectToolCalls(messages);
  const byId = new Map(tools.map((tool) => [tool.tool_call_id, tool]));
  return workflow.phases.map((phase: GrokWorkflowPhase) => ({
    id: phase.id,
    title: phase.title,
    state: phase.state,
    agents: workflow.agents
      .filter((agent) => agent.phase_id === phase.id)
      .map((agent) => resolveAgent(byId, agent.id, agent.label, phase.state, agent.agent_type)),
  }));
}

function subagentDescriptionOf(
  part: Pick<AgentToolCallPart, "params">,
): string {
  return part.params?.type === "subagent" ? part.params.description.trim() : "";
}

function subagentTaskIdOf(
  part: Pick<AgentToolCallPart, "params">,
): string {
  return part.params?.type === "subagent" ? (part.params.task_id?.trim() || "") : "";
}

/** True when a synthesized `grok_chrome` row is a second card for a user `spawn_subagent`. */
export function grokChromeDuplicatesUserSpawn(
  part: Pick<AgentToolCallPart, "kind" | "name" | "tool_call_id" | "params">,
  parts: AgentPart[],
): boolean {
  if (!isGrokChromeSubagent(part)) return false;
  const desc = subagentDescriptionOf(part);
  const taskId = subagentTaskIdOf(part);
  return parts.some((other) => {
    if (other.type !== "tool_call") return false;
    if (other.kind !== "subagent") return false;
    if (other.tool_call_id === part.tool_call_id) return false;
    if (isGrokChromeSubagent(other)) return false;
    const otherTask = subagentTaskIdOf(other);
    if (taskId && (other.tool_call_id === taskId || otherTask === taskId)) return true;
    const otherDesc = subagentDescriptionOf(other);
    return Boolean(desc && otherDesc && desc === otherDesc);
  });
}

/**
 * Nested chrome work stays off the parent process fold.
 * Synthesized `grok_chrome` rows that duplicate a user spawn are also hidden;
 * orphan goal/workflow chrome spawn rows stay visible.
 */
export function isHiddenGrokChromePart(part: AgentPart, parts: AgentPart[]): boolean {
  const chromeIds = new Set(
    parts
      .filter((item): item is AgentToolCallPart => item.type === "tool_call" && isGrokChromeSubagent(item))
      .map((item) => item.tool_call_id),
  );
  if (chromeIds.size === 0) return false;
  if (part.type === "tool_call" && chromeIds.has(part.tool_call_id)) {
    return grokChromeDuplicatesUserSpawn(part, parts);
  }
  let parent = "parent_tool_call_id" in part ? part.parent_tool_call_id : undefined;
  const tools = parts.filter((item): item is AgentToolCallPart => item.type === "tool_call");
  while (parent) {
    if (chromeIds.has(parent)) return true;
    const next = tools.find((tool) => tool.tool_call_id === parent);
    parent = next?.parent_tool_call_id;
  }
  return false;
}
