import type {
  AgentMessage,
  AgentPart,
  AgentToolKind,
  SessionConfigValueChange,
  SessionHintTone,
  SessionLifecycleAction,
  SessionLifecycleStatus,
} from "@atmos/api-types/ws/dto/agent-chat";
import {
  isActiveToolStatus,
  isHiddenTranscriptChromePart,
  isNestedSubagentChild,
  isSubagentWaitTool,
  partParentToolCallId,
  transcriptVisibility,
  type AgentToolCallPart,
  type TranscriptVisibility,
} from "./tool-kind";
import {
  isImageToolPath,
  otherToolBodies,
  presentAgentTool,
  type SearchHit,
  type TodoItem,
  type ToolDiffFile,
  type ToolPresentation,
  type TreeEntry,
  type WebResultLink,
} from "./present";

export type ClassifyOptions = {
  /** Web hides a pending permission in the live transcript; history review shows it. */
  historicPermissions?: boolean;
};

export type ImageDetail = {
  url?: string;
  path?: string;
  mime?: string;
};

export type TranscriptDetail = (
  | { kind: "diff"; files: ToolDiffFile[] }
  | { kind: "patch"; path: string | null; patch: string }
  | { kind: "diff_stats"; path: string | null; additions: number; deletions: number }
  | { kind: "code"; path: string | null; language: string; code: string; hint?: "new" | "deleted" }
  | { kind: "search"; query: string; glob?: string | null; path?: string | null; hits: SearchHit[]; summary?: string }
  | { kind: "web_search"; query: string; links: WebResultLink[] }
  | { kind: "web_fetch"; url: string; title?: string; markdown?: string; text?: string }
  | { kind: "images"; images: ImageDetail[] }
  | { kind: "files"; paths: string[] }
  | { kind: "tree"; entries: TreeEntry[] }
  | { kind: "markdown"; markdown: string }
  | { kind: "todos"; todos: TodoItem[] }
  | { kind: "json"; json: string }
  | { kind: "text"; text: string }
  | { kind: "move"; from: string; to: string }
  | { kind: "delete"; path: string }
  | { kind: "error"; text: string }
  | { kind: "empty"; path?: string | null; preview?: "image" | "text" | null }
  | {
      kind: "image_gen";
      prompt: string;
      aspectRatio: string | null;
      size: string | null;
      images: ImageDetail[];
      status: string;
    }
  | {
      kind: "plan_document";
      name: string;
      overview: string | null;
      plan: string;
      todos: TodoItem[];
    }
  | {
      kind: "execute";
      command: string;
      cwd: string | null;
      background: boolean;
      output: string | null;
      exitCode: number | null;
    }
  | {
      kind: "subagent";
      description: string;
      agentType: string | null;
      prompt: string;
      resultText: string | null;
      status: "running" | "completed" | "failed";
    }
  | { kind: "text_part"; text: string }
  | { kind: "thinking"; text: string; durationMs: number | null }
  | { kind: "error_part"; message: string }
  | {
      kind: "session_lifecycle";
      action: SessionLifecycleAction;
      status: SessionLifecycleStatus;
      durationMs: number | null;
      error: string | null;
      label: string;
    }
  | {
      kind: "session_config_change";
      modelFrom: string | null;
      modelTo: string | null;
      modeFrom: string | null;
      modeTo: string | null;
      label: string;
    }
  | {
      kind: "session_hint";
      tone: SessionHintTone;
      hintKind: string;
      label: string;
    }
  | {
      kind: "permission";
      requestId: string;
      tool: string;
      description: string;
      markdown: string | null;
      options: Array<{ optionId: string; name: string; kind: string }>;
      questions: Array<{ id: string; prompt: string; options: string[] }>;
      planTodos: TodoItem[];
      status: string;
      shownInTranscript: boolean;
    }
  | { kind: "hidden"; reason: "plan" | "attachment" | "plan_mode" | "mode_only" }
  ) & { paramsJson?: string | null };

export type ClassifiedTranscriptPart = {
  visibility: TranscriptVisibility;
  /** Tool kind for a tool call; otherwise the wire part type. */
  kind: AgentToolKind | AgentPart["type"];
  detail: TranscriptDetail;
};

export type WaitForRow = { part: AgentPart; index: number };

export type WaitForSection = {
  anchors: Array<{ part: AgentToolCallPart; index: number }>;
  /** Concrete event rows inside the bar. These are the Tour rows. */
  rows: WaitForRow[];
};

function formatWorkDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h${minutes}m${seconds}s`;
  if (minutes > 0) return `${minutes}m${seconds}s`;
  return `${seconds}s`;
}

function changeTo(change: SessionConfigValueChange | null | undefined): string {
  return change?.to?.trim() || "";
}

function changeFrom(change: SessionConfigValueChange | null | undefined): string {
  return change?.from?.trim() || "";
}

function sessionLifecycleLabel(part: Extract<AgentPart, { type: "session_lifecycle" }>): string {
  const running = part.status === "running";
  const failed = part.status === "failed";
  const resume = part.action === "resume";
  const duration = part.duration_ms != null && part.duration_ms >= 1000
    ? formatWorkDuration(part.duration_ms)
    : null;
  if (running) return resume ? "Resuming session..." : "Creating session...";
  if (failed) return resume ? "Failed to resume session" : "Failed to create session";
  if (duration) {
    return resume ? `Resumed session in ${duration}` : `Created session in ${duration}`;
  }
  return resume ? "Resumed session" : "Created session";
}

function sessionConfigLabel(part: Extract<AgentPart, { type: "session_config_change" }>): string {
  const model = changeTo(part.model);
  const mode = changeTo(part.mode);
  const modelFrom = changeFrom(part.model);
  const modeFrom = changeFrom(part.mode);
  if (model && mode) return `Switched model to ${model} · mode to ${mode}`;
  if (model) {
    return modelFrom ? `Switched model from ${modelFrom} to ${model}` : `Switched model to ${model}`;
  }
  return modeFrom ? `Switched mode from ${modeFrom} to ${mode}` : `Switched mode to ${mode}`;
}

function sessionHintLabel(kind: string): string {
  if (kind === "model_switch_failed") return "Couldn't switch model in this session";
  if (kind === "mode_switch_failed") return "Couldn't switch mode in this session";
  if (kind === "session_op_failed") return "Couldn't complete that session action";
  return kind;
}

function isSubagentDispatchAckText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith("Async agent launched successfully.")
    || trimmed.includes("This tool result is internal metadata")
    || trimmed.includes("The agent is working in the background.")
    || trimmed.startsWith("Subagent started in background.")
    || trimmed.includes("moved to the background to keep the conversation responsive")
    || trimmed.startsWith("The task is working in the background.")
  );
}

function subagentResultText(part: AgentToolCallPart): string | null {
  if (part.result?.type === "text" && part.result.text.trim()) {
    return isSubagentDispatchAckText(part.result.text) ? null : part.result.text;
  }
  if (part.result?.type === "error" && part.result.message.trim()) {
    return isSubagentDispatchAckText(part.result.message) ? null : part.result.message;
  }
  return null;
}

function subagentStatus(part: AgentToolCallPart): "running" | "completed" | "failed" {
  const status = (part.status ?? "").trim().toLowerCase();
  if (status === "failed" || status === "error") return "failed";
  if (isActiveToolStatus(status)) return "running";
  return "completed";
}

function imagesFromTool(part: AgentToolCallPart): ImageDetail[] {
  if (part.result?.type === "images") {
    return part.result.images.map((image) => ({
      url: image.url ?? undefined,
      path: image.path ?? undefined,
      mime: image.mime ?? undefined,
    }));
  }
  if (part.params?.type === "image_gen" && part.params.path) {
    return [{ path: part.params.path }];
  }
  return [];
}

function presentationDetail(presentation: ToolPresentation): TranscriptDetail {
  switch (presentation.kind) {
    case "diff":
    case "patch":
    case "diff_stats":
    case "code":
    case "search":
    case "web_search":
    case "web_fetch":
    case "files":
    case "tree":
    case "markdown":
    case "todos":
    case "json":
    case "text":
    case "move":
    case "delete":
    case "error":
    case "empty":
      return presentation;
    case "images":
      return {
        kind: "images",
        images: presentation.images.map((image) => ({
          url: image.url,
          path: image.path,
          mime: image.mime,
        })),
      };
  }
}

function toolDetail(part: AgentToolCallPart): TranscriptDetail {
  if (part.kind === "image_gen") {
    const params = part.params?.type === "image_gen" ? part.params : null;
    return {
      kind: "image_gen",
      prompt: params?.prompt?.trim() ?? "",
      aspectRatio: params?.aspect_ratio?.trim() || null,
      size: params?.size?.trim() || null,
      images: imagesFromTool(part),
      status: (part.status ?? "").trim() || "running",
    };
  }
  if (part.kind === "plan_document") {
    const params = part.params?.type === "plan_document" ? part.params : null;
    const todos = (params?.todos ?? [])
      .map((todo) => ({
        content: todo.content?.trim() ?? "",
        status: todo.status?.trim() || "pending",
      }))
      .filter((todo) => todo.content.length > 0);
    return {
      kind: "plan_document",
      name: params?.name?.trim() || part.title?.trim() || part.name.trim() || "Plan",
      overview: params?.overview?.trim() || null,
      plan: params?.plan?.trim() ?? "",
      todos,
    };
  }
  if (part.kind === "execute") {
    const params = part.params?.type === "execute" ? part.params : null;
    const result = part.result?.type === "execute" ? part.result : null;
    const text = part.result?.type === "text" ? part.result.text : null;
    const error = part.result?.type === "error" ? part.result.message : null;
    return {
      kind: "execute",
      command: params?.command?.trim() ?? "",
      cwd: params?.cwd?.trim() || null,
      background: Boolean(params?.background),
      output: result?.output ?? text ?? error,
      exitCode: result?.exit_code ?? null,
    };
  }
  if (part.kind === "subagent") {
    const params = part.params?.type === "subagent" ? part.params : null;
    return {
      kind: "subagent",
      description: params?.description?.trim() || part.title?.trim() || part.name.trim(),
      agentType: params?.agent_type?.trim() || null,
      prompt: params?.prompt?.trim() || "",
      resultText: subagentResultText(part),
      status: subagentStatus(part),
    };
  }
  const parsed = presentAgentTool(part);
  let detail = presentationDetail(parsed.presentation);
  if (detail.kind === "empty" && part.kind === "read" && parsed.path) {
    detail = {
      kind: "empty",
      path: parsed.path,
      preview: isImageToolPath(parsed.path) ? "image" : "text",
    };
  }
  if (part.kind === "other") {
    const paramsJson = otherToolBodies(part).paramsJson;
    if (paramsJson) return { ...detail, paramsJson };
  }
  return detail;
}

function hiddenReason(part: AgentPart): TranscriptDetail {
  if (part.type === "plan") return { kind: "hidden", reason: "plan" };
  if (part.type === "attachment") return { kind: "hidden", reason: "attachment" };
  if (part.type === "tool_call") return { kind: "hidden", reason: "plan_mode" };
  return { kind: "hidden", reason: "mode_only" };
}

/** Shared, UI-free classification for one Agent Chat transcript part. */
export function classifyTranscriptPart(
  part: AgentPart,
  options: ClassifyOptions = {},
): ClassifiedTranscriptPart {
  const visibility = transcriptVisibility(part);
  if (visibility === "hidden_chrome") {
    return { visibility, kind: part.type, detail: hiddenReason(part) };
  }
  if (part.type === "tool_call") {
    return { visibility, kind: part.kind, detail: toolDetail(part) };
  }
  if (part.type === "text") {
    return { visibility, kind: "text", detail: { kind: "text_part", text: part.text } };
  }
  if (part.type === "thinking") {
    return {
      visibility,
      kind: "thinking",
      detail: { kind: "thinking", text: part.text, durationMs: part.duration_ms ?? null },
    };
  }
  if (part.type === "error") {
    return { visibility, kind: "error", detail: { kind: "error_part", message: part.message } };
  }
  if (part.type === "session_lifecycle") {
    return {
      visibility,
      kind: "session_lifecycle",
      detail: {
        kind: "session_lifecycle",
        action: part.action,
        status: part.status,
        durationMs: part.duration_ms ?? null,
        error: part.error?.trim() || null,
        label: sessionLifecycleLabel(part),
      },
    };
  }
  if (part.type === "session_config_change") {
    return {
      visibility,
      kind: "session_config_change",
      detail: {
        kind: "session_config_change",
        modelFrom: changeFrom(part.model) || null,
        modelTo: changeTo(part.model) || null,
        modeFrom: changeFrom(part.mode) || null,
        modeTo: changeTo(part.mode) || null,
        label: sessionConfigLabel(part),
      },
    };
  }
  if (part.type === "session_hint") {
    return {
      visibility,
      kind: "session_hint",
      detail: {
        kind: "session_hint",
        tone: part.tone,
        hintKind: part.kind,
        label: sessionHintLabel(part.kind),
      },
    };
  }
  if (part.type === "permission") {
    const pending = part.request.status === "pending";
    const shownInTranscript = !pending || Boolean(options.historicPermissions);
    return {
      visibility,
      kind: "permission",
      detail: {
        kind: "permission",
        requestId: part.request.request_id,
        tool: part.request.tool,
        description: part.request.description,
        markdown: part.request.content_markdown?.trim() || null,
        options: (part.request.options ?? []).map((option) => ({
          optionId: option.option_id,
          name: option.name,
          kind: option.kind || option.option_id,
        })),
        questions: (part.request.questions ?? []).map((question) => ({
          id: question.id,
          prompt: question.prompt,
          options: question.options ?? [],
        })),
        planTodos: (part.request.plan_todos ?? [])
          .map((todo) => ({
            content: todo.content?.trim() ?? "",
            status: todo.status?.trim() || "pending",
          }))
          .filter((todo) => todo.content.length > 0),
        status: part.request.status,
        shownInTranscript,
      },
    };
  }
  return { visibility, kind: part.type, detail: { kind: "hidden", reason: "plan" } };
}

/**
 * Parts Web omits as subagent-wait polls, plus the nested events those polls own.
 * When a poll has no children, the poll itself is the Tour row.
 */
export function waitForSection(parts: AgentPart[]): WaitForSection | null {
  const anchors: WaitForSection["anchors"] = [];
  parts.forEach((part, index) => {
    if (isHiddenTranscriptChromePart(part)) return;
    if (part.type !== "tool_call" || !isSubagentWaitTool(part)) return;
    anchors.push({ part, index });
  });
  if (anchors.length === 0) return null;
  const ids = new Set(anchors.map((anchor) => anchor.part.tool_call_id));
  const rows: WaitForRow[] = [];
  parts.forEach((part, index) => {
    if (isHiddenTranscriptChromePart(part)) return;
    const parent = partParentToolCallId(part);
    if (!parent || !ids.has(parent)) return;
    if (part.type === "tool_call" && isSubagentWaitTool(part)) return;
    rows.push({ part, index });
  });
  if (rows.length === 0) {
    for (const anchor of anchors) rows.push(anchor);
  }
  return { anchors, rows };
}

function descendantToolIds(tools: AgentToolCallPart[], ancestorId: string): Set<string> {
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
  ids.delete(ancestorId);
  return ids;
}

function stripSelectedParent(part: AgentPart, selectedId: string): AgentPart {
  if (!("parent_tool_call_id" in part) || part.parent_tool_call_id !== selectedId) return part;
  const next = { ...part };
  delete next.parent_tool_call_id;
  return next;
}

/**
 * Child rows Web shows inside a subagent overlay, including rows that arrived
 * on a later assistant message. Wait polls stay out. One sheet lists these
 * rows in place.
 */
export function subagentChildParts(
  messages: Array<Pick<AgentMessage, "role" | "parts">>,
  toolCallId: string,
): AgentPart[] {
  const tools: AgentToolCallPart[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== "tool_call" || seen.has(part.tool_call_id)) continue;
      seen.add(part.tool_call_id);
      tools.push(part);
    }
  }
  if (!tools.some((tool) => tool.tool_call_id === toolCallId && tool.kind === "subagent")) return [];
  const descendants = descendantToolIds(tools, toolCallId);
  const parts: AgentPart[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type === "tool_call") {
        if (part.tool_call_id === toolCallId || isSubagentWaitTool(part)) continue;
        if (!descendants.has(part.tool_call_id)) continue;
        parts.push(stripSelectedParent(part, toolCallId));
        continue;
      }
      if ((part.type === "text" || part.type === "thinking") && part.parent_tool_call_id === toolCallId) {
        if (part.type === "text" && isSubagentDispatchAckText(part.text)) continue;
        parts.push(stripSelectedParent(part, toolCallId));
      }
    }
  }
  return parts;
}

export function nestedPartsFor(parentId: string, parts: AgentPart[]): WaitForRow[] {
  const rows: WaitForRow[] = [];
  parts.forEach((part, index) => {
    if (partParentToolCallId(part) !== parentId) return;
    if (isHiddenTranscriptChromePart(part)) return;
    if (isNestedSubagentChild(part) && part.type === "tool_call" && isSubagentWaitTool(part)) return;
    rows.push({ part, index });
  });
  return rows;
}
