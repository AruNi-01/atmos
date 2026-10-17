import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  formatWorkDuration,
  formatWorkedAt,
  USER_MESSAGE_COLLAPSE_LINES,
  type ToolOverviewKind,
} from "@atmos/agent-transcript";

export const copy = {
  newChat: "New chat",
  emptyTitle: "Start chatting",
  emptyDescription: "Send a message to begin this chat.",
  placeholder: "Send a message to create a session",
  resumePlaceholder: "Send a message to resume the session",
  connectedPlaceholder: "Do anything with {agent}",
  send: "Send",
  stop: "Stop",
  queue: "Queue",
  steer: "Steer",
  agent: "Agent",
  model: "Model",
  noAgent: "No agent",
  thinking: "Thinking",
  permissionTitle: "Permission needed",
  sendFailed: "Could not send that message",
  history: "Chats",
  messages: "Messages",
  parameters: "Parameters",
  result: "Result",
  rename: "Rename chat",
  deleteChat: "Delete",
  attach: "Attach",
  context: "Context",
  pasteChip: "Pasted: {count} lines",
  close: "Close",
  mode: "Mode",
  permission: "Permission",
  add: "Add",
  photos: "Photos",
  allowPhotos: "Allow photo access",
  photosNeedRebuild: "Rebuild the app to attach photos.",
  effort: "Effort",
  fast: "Fast",
  favorites: "Favorites",
  searchModels: "Search models",
  noFavorites: "No favorites yet",
  noModels: "No models",
  addFavorite: "Add favorite",
  removeFavorite: "Remove favorite",
  scrollBelowPrefix: "",
  scrollBelowSuffix: "below",
  scrollBelowUnit: "{count, plural, one {message} other {messages}}",
  permissionRequested: "Permission requested",
  askUserTitle: "Questions for you",
  planApprovalTitle: "Plan ready",
  sessionOpRequested: "Session action requested",
  bottom: "Bottom",
  planTitle: "Plan",
  messageQueueTitle: "Message Queue",
  backgroundCommandsTitle: "Background",
  subagentTasksTitle: "Subagent Tasks",
  grokGoalTitle: "Goal",
  grokWorkflowTitle: "Research",
  contextWindowTitle: "Context Usage",
  planViewerEmpty: "No plan content available yet.",
  queueEdit: "Edit",
  queueSave: "Save",
  queueDelete: "Delete",
  queueMoveUp: "Move up",
  queueMoveDown: "Move down",
  copyMessage: "Copy message",
  thinkingStream: "Thinking...",
  thoughtFor: "Thought for {duration}",
  thoughtForFew: "Thought for a few seconds",
  workedFor: "Worked for {duration}",
  processLabel: "Process",
  collapseLabel: "Collapse",
  showMore: "Show more",
  showLess: "Show less",
  subagentStatus: {
    running: "Running",
    failed: "Failed",
    completed: "Completed",
  },
  answerCaret: "\u258d",
  session: {
    creating: "Creating session...",
    created: "Created session",
    createdIn: "Created session in {duration}",
    createFailed: "Failed to create session",
    resuming: "Resuming session...",
    resumed: "Resumed session",
    resumedIn: "Resumed session in {duration}",
    resumeFailed: "Failed to resume session",
    switchedModel: "Switched model to {to}",
    switchedModelFrom: "Switched model from {from} to {to}",
    switchedMode: "Switched mode to {to}",
    switchedModeFrom: "Switched mode from {from} to {to}",
    switchedBoth: "Switched model to {model} · mode to {mode}",
    hints: {
      modelSwitchFailed: "Couldn't switch model in this session",
      modeSwitchFailed: "Couldn't switch mode in this session",
      sessionOpFailed: "Couldn't complete that session action",
    },
  },
  filesChanged: "{count, plural, one {# file changed} other {# files changed}}",
  filesShowMore: "… Show {count} more",
  filesShowLess: "Show less",
  usageTurn: {
    title: "Turn usage",
    input: "Input",
    output: "Output",
    thought: "Thought",
    cacheRead: "Cache read",
    cacheWrite: "Cache write",
    total: "Total",
  },
} as const;

export const toolGroupLabels = {
  join: ", ",
  locale: "en",
  thinking: "Thinking",
  working: "Working",
} as const;

export function toolGroupCountLabel(kind: ToolOverviewKind, count: number): string {
  const one = count === 1;
  switch (kind) {
    case "write":
      return one ? `${count} write` : `${count} writes`;
    case "command":
      return one ? `ran ${count} command` : `ran ${count} commands`;
    case "skill":
      return one ? `${count} skill` : `${count} skills`;
    case "subagent":
      return one ? `${count} subagent` : `${count} subagents`;
    case "other":
      return one ? `${count} tool` : `${count} tools`;
    case "fetch":
      return one ? `${count} fetch` : `${count} fetches`;
    case "search":
      return one ? `${count} search` : `${count} searches`;
    case "read":
      return one ? `${count} read` : `${count} reads`;
  }
}

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : `{${key}}`,
  );
}

/** Renders an en.json `{count, plural, one {# …} other {# …}}` string. */
export function formatCountChoice(template: string, count: number): string {
  const match = template.match(/\{count,\s*plural,\s*one\s*\{([^}]*)\}\s*other\s*\{([^}]*)\}\s*\}/);
  if (!match) return fillTemplate(template, { count });
  const branch = count === 1 ? match[1]! : match[2]!;
  return branch.replaceAll("#", String(count));
}

export function filesChangedLabel(count: number): string {
  return formatCountChoice(copy.filesChanged, count);
}

export function filesShowMoreLabel(count: number): string {
  return fillTemplate(copy.filesShowMore, { count });
}

export function isPendingPhoneUserEcho(message: { role: string; id: string }): boolean {
  return message.role === "user" && message.id.startsWith("pending:");
}

export function attachmentChipLabel(part: { name?: string | null; path: string }): string {
  const name = part.name?.trim();
  if (name) return name;
  const base = part.path.split(/[\\/]/).filter(Boolean).pop();
  return base || part.path;
}

/** Phone has no paste registry. The `[#paste:id]` token stays literal text. */
export function userMessageDisplayText(text: string): string {
  return text;
}

export function userMessageIsCollapsed(lineCount: number, expanded: boolean): boolean {
  return !expanded && lineCount > USER_MESSAGE_COLLAPSE_LINES;
}

export function compactTurnTokenLabel(usage: {
  total_tokens?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
}): string | null {
  if (usage.total_tokens == null && usage.input_tokens == null && usage.output_tokens == null) {
    return null;
  }
  const total = usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
  return String(total);
}

export function workedForPresentation(
  workedMs: number | null | undefined,
  completedAt: string,
): { durationLabel: string | null; clock: string | null } {
  const hasDuration = (workedMs ?? 0) > 0;
  return {
    durationLabel: hasDuration
      ? fillTemplate(copy.workedFor, { duration: formatWorkDuration(workedMs ?? 0) })
      : null,
    clock: formatWorkedAt(completedAt, "en"),
  };
}

/** Matches web `getThinkingMessage`: open or zero seconds stays on the streaming title. */
export function thinkingTitle(isStreaming: boolean, seconds: number | undefined): string {
  if (isStreaming || seconds === 0) return copy.thinkingStream;
  if (seconds === undefined) return copy.thoughtForFew;
  return fillTemplate(copy.thoughtFor, { duration: formatWorkDuration(seconds * 1000) });
}

export type SessionChromeIcon = "resume" | "create" | "model" | "layers" | "hint";
export type SessionChromeTone = "secondary" | "failed" | "warning" | "error";

type SessionChromePart = Extract<
  AgentPart,
  { type: "session_lifecycle" | "session_config_change" | "session_hint" }
>;

export function sessionChromeCopy(part: SessionChromePart): {
  icon: SessionChromeIcon;
  text: string;
  tone: SessionChromeTone;
} {
  if (part.type === "session_lifecycle") {
    const resume = part.action === "resume";
    const running = part.status === "running";
    const failed = part.status === "failed";
    const duration =
      part.duration_ms != null && part.duration_ms >= 1000
        ? formatWorkDuration(part.duration_ms)
        : null;
    const label = running
      ? resume
        ? copy.session.resuming
        : copy.session.creating
      : failed
        ? resume
          ? copy.session.resumeFailed
          : copy.session.createFailed
        : duration
          ? fillTemplate(resume ? copy.session.resumedIn : copy.session.createdIn, { duration })
          : resume
            ? copy.session.resumed
            : copy.session.created;
    const error = failed ? (part.error?.trim() ?? "") : "";
    return {
      icon: resume ? "resume" : "create",
      text: error ? `${label}: ${error}` : label,
      tone: failed ? "failed" : "secondary",
    };
  }

  if (part.type === "session_config_change") {
    const model = part.model?.to?.trim() || "";
    const mode = part.mode?.to?.trim() || "";
    const modelFrom = part.model?.from?.trim() || "";
    const modeFrom = part.mode?.from?.trim() || "";
    const text =
      model && mode
        ? fillTemplate(copy.session.switchedBoth, { model, mode })
        : model
          ? modelFrom
            ? fillTemplate(copy.session.switchedModelFrom, { from: modelFrom, to: model })
            : fillTemplate(copy.session.switchedModel, { to: model })
          : modeFrom
            ? fillTemplate(copy.session.switchedModeFrom, { from: modeFrom, to: mode })
            : fillTemplate(copy.session.switchedMode, { to: mode });
    return { icon: model && !mode ? "model" : "layers", text, tone: "secondary" };
  }

  const text =
    part.kind === "model_switch_failed"
      ? copy.session.hints.modelSwitchFailed
      : part.kind === "mode_switch_failed"
        ? copy.session.hints.modeSwitchFailed
        : part.kind === "session_op_failed"
          ? copy.session.hints.sessionOpFailed
          : part.kind;
  const tone: SessionChromeTone =
    part.tone === "warning" ? "warning" : part.tone === "error" ? "error" : "secondary";
  return { icon: "hint", text, tone };
}

export function isPlanExitRequest(request: {
  tool?: string | null;
  description?: string | null;
  content_markdown?: string | null;
}): boolean {
  const tool = request.tool ?? "";
  const description = request.description ?? "";
  const markdown = request.content_markdown?.trim() ?? "";
  if (
    /exit.?plan|approve.?plan|plan.?mode/i.test(tool) ||
    /exit.?plan|approve.?plan/i.test(description)
  ) {
    return true;
  }
  return /^#\s*plan\b/im.test(markdown);
}

export function historicPermissionTitle(request: {
  tool?: string | null;
  description?: string | null;
  content_markdown?: string | null;
  questions?: Array<unknown> | null;
}): string {
  if ((request.questions?.length ?? 0) > 0) return copy.askUserTitle;
  if (isPlanExitRequest(request)) return copy.planApprovalTitle;
  return copy.permissionRequested;
}
