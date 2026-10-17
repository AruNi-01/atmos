import type {
  AgentMessage,
  AgentPart,
  GrokGoal,
  GrokWorkflow,
} from "@atmos/api-types/ws/dto/agent-chat";
import {
  deriveAgentActivityState,
  formatAgentToolActivityLine,
  isActiveToolStatus,
  isGrokChromeSubagent,
  isSubagentWaitTool,
  toolKindHeadlineLabel,
  type AgentActivityState,
  type AgentToolCallPart,
} from "@atmos/agent-transcript";
import { copy, fillTemplate, toolGroupLabels } from "./copy";

/** Web `rounded-3xl` is `--radius` (10px) plus 12px. */
export const SUBAGENT_PANEL_RADIUS = 22;
export const SUBAGENT_PANEL_PAD = 12;
export const SUBAGENT_PANEL_BORDER_LIGHT = "rgba(0, 0, 0, 0.1)";
export const SUBAGENT_PANEL_BORDER_DARK = "rgba(255, 255, 255, 0.1)";
export const SUBAGENT_MARK_PX = 20;

export function subagentPanelBorder(isDark: boolean): string {
  return isDark ? SUBAGENT_PANEL_BORDER_DARK : SUBAGENT_PANEL_BORDER_LIGHT;
}

export type SubagentTaskStatus = "running" | "completed" | "failed";

export function subagentTaskStatus(part: AgentToolCallPart): SubagentTaskStatus {
  const status = (part.status ?? "").trim().toLowerCase();
  if (status === "failed" || status === "error") return "failed";
  if (isActiveToolStatus(status)) return "running";
  return "completed";
}

export function titleCaseSubagentType(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function subagentAgentType(part: AgentToolCallPart): string | null {
  if (part.params?.type !== "subagent") return null;
  return part.params.agent_type?.trim() || null;
}

function subagentDescription(part: AgentToolCallPart): string {
  return part.params?.type === "subagent" ? part.params.description.trim() : "";
}

export function displaySubagentType(
  part: AgentToolCallPart,
  fallbackType = copy.subagentTasksFallback,
): string {
  const raw = subagentAgentType(part);
  if (!raw) return fallbackType;
  return titleCaseSubagentType(raw);
}

function subagentTaskSummary(part: AgentToolCallPart): string {
  return subagentDescription(part) || part.title?.trim() || part.name.trim();
}

/** Web `formatSubagentTaskLine`: "{Type} - {summary}". */
export function formatSubagentTaskLine(
  part: AgentToolCallPart,
  fallbackType = copy.subagentTasksFallback,
): string {
  const type = displaySubagentType(part, fallbackType);
  const summary = subagentTaskSummary(part);
  return summary ? `${type} - ${summary}` : type;
}

export function subagentTasksCountLabel(tools: readonly AgentToolCallPart[]): string {
  const total = tools.length;
  let completed = 0;
  let running = 0;
  for (const part of tools) {
    const status = subagentTaskStatus(part);
    if (status === "completed") completed += 1;
    if (status === "running") running += 1;
  }
  if (total > 0 && completed === total) return copy.subagentTasksAllDone;
  if (running > 0) return fillTemplate(copy.subagentTasksRunning, { count: running });
  return fillTemplate(copy.subagentTasksProgress, { completed, total });
}

export function subagentRosterIds(
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

function isRosterSubagent(part: AgentToolCallPart, excludeIds?: Iterable<string> | null): boolean {
  if (isGrokChromeSubagent(part)) return true;
  if (part.kind !== "subagent") return false;
  const ids = excludeIds instanceof Set ? excludeIds : new Set(excludeIds ?? []);
  if (ids.size === 0) return false;
  if (ids.has(part.tool_call_id)) return true;
  const taskId = part.params?.type === "subagent" ? part.params.task_id?.trim() : "";
  return Boolean(taskId && ids.has(taskId));
}

function userMessageText(message: AgentMessage): string {
  return message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
}

function isClaudeTaskNotificationText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("<task-notification>") || trimmed.includes("<task-notification>");
}

function lastUserIndex(messages: readonly AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    if (isClaudeTaskNotificationText(userMessageText(message))) continue;
    return index;
  }
  return -1;
}

function collectToolCalls(messages: readonly AgentMessage[]): AgentToolCallPart[] {
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

/** Live mode keeps the current turn in the composer card. Transcript mode inlines every turn. */
export function inlineSubagentTasksByMessageId(
  messages: readonly AgentMessage[],
  options?: { mode?: "live" | "transcript"; excludeIds?: Iterable<string> | null },
): Map<string, AgentToolCallPart[]> {
  const mode = options?.mode ?? "live";
  const lastUser = lastUserIndex(messages);
  const out = new Map<string, AgentToolCallPart[]>();

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    if (mode === "live" && index > lastUser) continue;

    const items: AgentToolCallPart[] = [];
    const seen = new Set<string>();
    for (const part of message.parts) {
      if (part.type !== "tool_call" || part.kind !== "subagent") continue;
      if (seen.has(part.tool_call_id)) continue;
      seen.add(part.tool_call_id);
      if (part.parent_tool_call_id) continue;
      if (isRosterSubagent(part, options?.excludeIds)) continue;
      items.push(part);
    }
    if (items.length === 0) continue;
    out.set(message.id, items);
  }
  return out;
}

function stripSelectedParent(part: AgentPart, selectedId: string): AgentPart {
  if (!("parent_tool_call_id" in part) || part.parent_tool_call_id !== selectedId) return part;
  const next = { ...part };
  delete next.parent_tool_call_id;
  return next;
}

function descendantIds(tools: readonly AgentToolCallPart[], ancestorId: string): Set<string> {
  const ids = new Set<string>([ancestorId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const tool of tools) {
      if (ids.has(tool.tool_call_id)) continue;
      if (isSubagentWaitTool(tool)) continue;
      if (tool.parent_tool_call_id && ids.has(tool.parent_tool_call_id)) {
        ids.add(tool.tool_call_id);
        grew = true;
      }
    }
  }
  return ids;
}

function activityCopy(state: Extract<AgentActivityState, { busy: true }>): string {
  const show = (base: string) => (state.trail === "none" ? base : `${base}...`);
  switch (state.label.type) {
    case "generating":
      return show(copy.activityGenerating);
    case "thinking":
      return show(copy.thinking);
    case "streaming":
      return show(copy.activityStreaming);
    case "creatingSession":
      return show(copy.activityCreatingSession);
    case "resumingSession":
      return show(copy.activityResumingSession);
    case "waiting":
      return show(
        state.label.count <= 1
          ? copy.activityWaitingOne
          : copy.activityWaitingMany.replaceAll("{count}", String(state.label.count)),
      );
    case "tool":
      return (
        formatAgentToolActivityLine(
          state.label.part,
          toolKindHeadlineLabel(state.label.part.kind),
        ) || toolGroupLabels.working
      );
  }
}

/** Live child operation on a running row. Settled rows have no activity text. */
export function subagentActivityLabel(
  messages: readonly AgentMessage[],
  part: AgentToolCallPart,
): string | null {
  if (subagentTaskStatus(part) !== "running") return null;
  const descendants = descendantIds(collectToolCalls(messages), part.tool_call_id);
  const parts: AgentPart[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const child of message.parts) {
      if (child.type === "tool_call") {
        if (child.tool_call_id === part.tool_call_id) continue;
        if (isSubagentWaitTool(child)) continue;
        if (!descendants.has(child.tool_call_id)) continue;
        parts.push(stripSelectedParent(child, part.tool_call_id));
        continue;
      }
      if (
        (child.type === "text" || child.type === "thinking") &&
        child.parent_tool_call_id === part.tool_call_id
      ) {
        parts.push(stripSelectedParent(child, part.tool_call_id));
      }
    }
  }
  const projected: AgentMessage = {
    id: `subagent:${part.tool_call_id}:assistant`,
    role: "assistant",
    parts,
    streaming: true,
  };
  const state = deriveAgentActivityState([projected], true);
  if (!state.busy) return null;
  return activityCopy(state);
}

const GOLDEN_ANGLE = 137.508;

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mixHue(raw: number, bias: number, pull: number): number {
  const delta = ((bias - raw + 540) % 360) - 180;
  return (raw + delta * pull + 360) % 360;
}

/** Graphite MatrixOrb color. The canvas animation stays on web. */
export function subagentMarkColor(seed: string, isDark: boolean): string {
  const hash = hashString(seed);
  const hue = mixHue((hash * GOLDEN_ANGLE) % 360, 215, 0.1);
  const satJitter = hash % 8;
  const lightJitter = (hash >>> 8) % 6;
  if (isDark) {
    return `hsl(${hue.toFixed(1)}, ${52 + satJitter}%, ${66 + lightJitter}%)`;
  }
  return `hsl(${hue.toFixed(1)}, ${58 + satJitter}%, ${44 + lightJitter}%)`;
}

export type SubagentMarkDot = { x: number; y: number; radius: number };

const ORBITERS = [
  { radius: 0.62, speed: 2.2, phase: 0, spread: 0.42 },
  { radius: 0.4, speed: -1.7, phase: 2.1, spread: 0.36 },
  { radius: 0.8, speed: 1.15, phase: 4, spread: 0.34 },
];

function markIntensity(
  state: "idle" | "thinking",
  distance: number,
  nx: number,
  ny: number,
): number {
  if (state === "thinking") {
    let heat = 0;
    for (const orbiter of ORBITERS) {
      const dx = nx - Math.cos(orbiter.phase) * orbiter.radius;
      const dy = ny - Math.sin(orbiter.phase) * orbiter.radius;
      heat += Math.exp(-(dx * dx + dy * dy) / (orbiter.spread * orbiter.spread));
    }
    return 0.26 + 0.8 * Math.min(1, heat);
  }
  return 0.62 + 0.12 * Math.sin(-distance * 2.4);
}

/** Reduced-motion MatrixOrb frame at 20px: five-dot grid, t = 0. */
export function subagentMarkDots(state: "idle" | "thinking"): SubagentMarkDot[] {
  const size = SUBAGENT_MARK_PX;
  const cells = 5;
  const half = (cells - 1) / 2;
  const spacing = (size * 0.9) / (cells - 1);
  const maxRadius = spacing * 0.74;
  const center = size / 2;
  const scale = state === "thinking" ? 1 : 0.96;
  const dots: SubagentMarkDot[] = [];
  for (let iy = 0; iy < cells; iy += 1) {
    for (let ix = 0; ix < cells; ix += 1) {
      const nx = (ix - half) / half;
      const ny = (iy - half) / half;
      const distance = Math.hypot(nx, ny);
      if (distance > 1.12) continue;
      const radius =
        maxRadius *
        Math.exp(-distance * distance * 1.7) *
        markIntensity(state, distance, nx, ny) *
        scale;
      if (radius < 0.15) continue;
      dots.push({
        x: center + (ix - half) * spacing * scale,
        y: center + (iy - half) * spacing * scale,
        radius,
      });
    }
  }
  return dots;
}
