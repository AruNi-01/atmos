import type {
  AgentActivity,
  AgentChildActivity,
  AgentToolLine,
  AgentTurn,
} from "@atmos/api-types/ws/dto/events";

const CHILD_PROMPT_CHARS = 40;

export type ObserverStep = {
  id: string;
  kind: "prompt" | "tool";
  label: string;
  detail?: string;
  state?: string;
};

export function isObserverChromeToolName(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (
    n === "task"
    || n === "subagent"
    || n === "spawn_subagent"
    || n === "spawn_agent"
    || n === "agent_spawn"
  ) {
    return true;
  }
  return (
    n.includes("get_command_or_subagent")
    || n.includes("subagent_output")
    || n.includes("task_output")
    || n.includes("agent_output")
    || n.includes("taskoutput")
    || n.includes("agentoutput")
  );
}

export function looksLikeChildPrompt(text: string | undefined | null): boolean {
  return (text ?? "").trim().length >= CHILD_PROMPT_CHARS;
}

export function isLeakedChildTurn(turn: AgentTurn, children: AgentChildActivity[]): boolean {
  const prompt = turn.prompt.trim();
  if (!prompt) return false;
  if (children.some((child) => {
    const childPrompt = child.prompt?.trim();
    if (!childPrompt) return false;
    return (
      childPrompt === prompt
      || childPrompt.startsWith(prompt)
      || prompt.startsWith(childPrompt)
    );
  })) {
    return true;
  }
  const onlyChrome = turn.tools.every((tool) => isObserverChromeToolName(tool.name));
  return looksLikeChildPrompt(prompt) && (turn.tools.length === 0 || onlyChrome);
}

function visibleTurnTools(turn: AgentTurn): AgentToolLine[] {
  return turn.tools.filter((tool) => !isObserverChromeToolName(tool.name));
}

function toolStep(id: string, line: AgentToolLine): ObserverStep {
  const detail = line.detail.trim();
  return {
    id,
    kind: "tool",
    label: line.name,
    detail: detail || undefined,
    state: line.state,
  };
}

export function activityToSteps(activity: AgentActivity): ObserverStep[] {
  const children = activity.children ?? [];
  const steps: ObserverStep[] = [];
  for (const turn of activity.turns ?? []) {
    if (isLeakedChildTurn(turn, children)) continue;
    if (turn.prompt.trim()) {
      steps.push({
        id: `prompt-${turn.turn_id}`,
        kind: "prompt",
        label: turn.prompt.trim(),
      });
    }
    for (const [index, tool] of visibleTurnTools(turn).entries()) {
      steps.push(toolStep(`${turn.turn_id}:${tool.name}:${index}`, tool));
    }
  }
  const current = activity.current_tool;
  if (current && !isObserverChromeToolName(current.name)) {
    const already = steps.some(
      (step) =>
        step.kind === "tool"
        && step.label === current.name
        && step.detail === (current.detail.trim() || undefined)
        && step.state === current.state,
    );
    if (!already) steps.push(toolStep(`current:${current.name}`, current));
  }
  return steps;
}

export function childToSteps(child: AgentChildActivity): ObserverStep[] {
  const steps: ObserverStep[] = [];
  if (child.prompt?.trim()) {
    steps.push({
      id: `prompt-${child.child_id}`,
      kind: "prompt",
      label: child.prompt.trim(),
    });
  }
  const tools = [...(child.recent_tools ?? [])];
  if (child.current_tool) {
    const current = child.current_tool;
    const already = tools.some(
      (tool) => tool.name === current.name && tool.detail === current.detail && tool.state === current.state,
    );
    if (!already) tools.push(current);
  }
  for (const [index, tool] of tools.entries()) {
    if (isObserverChromeToolName(tool.name)) continue;
    steps.push(toolStep(`${child.child_id}:${tool.name}:${index}`, tool));
  }
  return steps;
}

export function childToolLine(child: AgentChildActivity): string | undefined {
  const current = child.current_tool;
  if (current) {
    const detail = current.detail?.trim();
    return detail ? `${current.name} ${detail}` : current.name;
  }
  const last = child.recent_tools?.length
    ? child.recent_tools[child.recent_tools.length - 1]
    : undefined;
  if (last) {
    const detail = last.detail?.trim();
    return detail ? `${last.name} ${detail}` : last.name;
  }
  const prompt = child.prompt?.trim();
  return prompt || undefined;
}
