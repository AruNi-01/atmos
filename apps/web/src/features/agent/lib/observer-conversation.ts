import type { AgentMessage, AgentToolKind } from "@atmos/api-types/ws/dto/agent-chat";
import type {
  AgentActivity,
  AgentChildActivity,
  AgentToolLine,
  AgentTurn,
} from "@atmos/api-types/ws/dto/events";
import { defaultToolParams, type AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";

const CHILD_PROMPT_CHARS = 40;

export function isObserverChromeToolName(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (
    n === "task"
    || n === "agent"
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

function toolKindForName(name: string): AgentToolKind {
  const n = name.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (
    n === "read"
    || n === "read_file"
    || n === "readfile"
    || n === "view"
    || n === "view_file"
    || n === "list_dir"
    || n === "list_directory"
    || n === "ls"
  ) {
    return "read";
  }
  if (
    n === "edit"
    || n === "write"
    || n === "write_file"
    || n === "str_replace"
    || n === "search_replace"
  ) {
    return "edit";
  }
  if (n === "grep" || n === "search" || n === "glob") return "search";
  if (n === "bash" || n === "shell" || n === "execute" || n === "run_command") return "execute";
  if (n === "web_search" || n === "websearch") return "web_search";
  if (n === "fetch" || n === "web_fetch") return "fetch";
  return "other";
}

function lineStatus(state: string | undefined): AgentToolCallPart["status"] {
  const value = (state ?? "").trim().toLowerCase();
  if (value === "pending" || value === "running" || value === "in_progress") return "running";
  if (value === "error" || value === "failed") return "failed";
  return "completed";
}

function paramsForLine(kind: AgentToolKind, detail: string) {
  const params = defaultToolParams(kind);
  const text = detail.trim();
  if (!text) return params;
  switch (params.type) {
    case "read":
    case "edit":
    case "delete":
      return { ...params, path: text };
    case "search":
    case "web_search":
      return { ...params, query: text };
    case "execute":
      return { ...params, command: text };
    case "fetch":
      return { ...params, url: text };
    case "other":
      return { ...params, value: { detail: text } };
    default:
      return params;
  }
}

export function toolLineToPart(line: AgentToolLine, id: string): AgentToolCallPart {
  const kind = toolKindForName(line.name);
  return {
    type: "tool_call",
    tool_call_id: id,
    name: line.name,
    title: line.detail || null,
    kind,
    status: lineStatus(line.state),
    params: paramsForLine(kind, line.detail),
  };
}

function visibleTurnTools(turn: AgentTurn): AgentToolLine[] {
  return turn.tools.filter((tool) => !isObserverChromeToolName(tool.name));
}

function userMessage(id: string, text: string, createdAt: string): AgentMessage {
  return {
    id,
    role: "user",
    kind: "normal",
    created_at: createdAt,
    parts: [{ type: "text", text }],
  };
}

function assistantMessage(
  id: string,
  parts: AgentMessage["parts"],
  createdAt: string,
  streaming: boolean,
): AgentMessage {
  return {
    id,
    role: "assistant",
    created_at: createdAt,
    streaming,
    parts,
  };
}

export function activityToConversation(activity: AgentActivity): AgentMessage[] {
  const children = activity.children ?? [];
  const messages: AgentMessage[] = [];
  for (const turn of activity.turns ?? []) {
    if (isLeakedChildTurn(turn, children)) continue;
    if (turn.prompt.trim()) {
      messages.push(userMessage(`obs-user-${turn.turn_id}`, turn.prompt, turn.started_at));
    }
    const tools = visibleTurnTools(turn);
    if (tools.length > 0) {
      messages.push(
        assistantMessage(
          `obs-asst-${turn.turn_id}`,
          tools.map((tool, index) => toolLineToPart(tool, `${turn.turn_id}:${tool.name}:${index}`)),
          turn.started_at,
          tools.some((tool) => lineStatus(tool.state) === "running"),
        ),
      );
    }
  }
  const current = activity.current_tool;
  if (current && !isObserverChromeToolName(current.name)) {
    const last = messages[messages.length - 1];
    const part = toolLineToPart(current, `current:${current.name}`);
    if (last?.role === "assistant") {
      const already = last.parts.some(
        (item) => item.type === "tool_call" && item.name === current.name && item.title === (current.detail || null),
      );
      if (!already) last.parts = [...last.parts, part];
      last.streaming = true;
    } else {
      messages.push(
        assistantMessage("obs-asst-current", [part], current.started_at, true),
      );
    }
  }
  return messages;
}

export function childToConversation(child: AgentChildActivity): AgentMessage[] {
  const messages: AgentMessage[] = [];
  if (child.prompt?.trim()) {
    messages.push(userMessage(`obs-child-user-${child.child_id}`, child.prompt, child.started_at));
  }
  const tools = [...(child.recent_tools ?? [])];
  if (child.current_tool) {
    const current = child.current_tool;
    const already = tools.some(
      (tool) => tool.name === current.name && tool.detail === current.detail && tool.state === current.state,
    );
    if (!already) tools.push(current);
  }
  if (tools.length > 0) {
    messages.push(
      assistantMessage(
        `obs-child-asst-${child.child_id}`,
        tools.map((tool, index) => toolLineToPart(tool, `${child.child_id}:${tool.name}:${index}`)),
        child.last_event_at || child.started_at,
        child.state === "running" || child.current_tool?.state === "pending",
      ),
    );
  }
  return messages;
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
