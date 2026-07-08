import type {
  TerminalSideChatRecord,
  TerminalSideChatStatus,
  TerminalSideContextCaptureResponse,
} from "@/api/ws-api";
import type { TerminalPaneAgent } from "@/features/terminal/types";
import type { TerminalPromptContext } from "./terminal-ai-context-protocol";
import type { PendingTerminalRun } from "@/features/terminal/lib/terminal-agent-run-delivery";

export type SourceSurfaceKind = "terminal_pane" | "canvas_terminal";

export type LocalSideChatRecord = TerminalSideChatRecord & {
  agent?: TerminalPaneAgent;
  hasSentInitialCommand?: boolean;
  pendingInitialRun?: PendingTerminalRun;
  isNew: boolean;
  sessionId: string;
};

type LegacySideChatStatus = TerminalSideChatStatus | "visible" | "closed" | string;

const BRIGHT_SIDE_CHAT_COLORS = [
  "#06b6d4",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#84cc16",
  "#3b82f6",
  "#f97316",
];

export const SIDE_CHAT_INLINE_PROMPT_MAX_LINES = 30;

export function sideChatTabLabel(
  record: LocalSideChatRecord,
  index: number,
  fallbackTitle: string,
): string {
  return record.agent?.label?.trim() || `${fallbackTitle} ${index + 1}`;
}

export function sideChatRecordMatchesSource(
  record: TerminalSideChatRecord,
  sourceSurfaceRefJson: string | null,
  sourceTmuxWindowName?: string | null,
): boolean {
  if (sourceSurfaceRefJson && record.source_surface_ref_json) {
    return record.source_surface_ref_json === sourceSurfaceRefJson;
  }
  return record.source_tmux_window_name === sourceTmuxWindowName;
}

export function mergeSideChatRecords(
  current: LocalSideChatRecord[],
  incoming: LocalSideChatRecord[],
  workspaceId: string,
) {
  const currentInWorkspace = current.filter((record) => record.workspace_id === workspaceId);
  const incomingInWorkspace = incoming.filter((record) => record.workspace_id === workspaceId);
  const currentById = new Map(
    currentInWorkspace.map((record) => [sideChatRecordScopedId(record), record]),
  );
  const incomingIds = new Set(incomingInWorkspace.map((record) => sideChatRecordScopedId(record)));
  const merged = incomingInWorkspace.map((record) => {
    const currentRecord = currentById.get(sideChatRecordScopedId(record));
    if (!currentRecord) return record;
    return {
      ...record,
      agent: currentRecord.agent ?? record.agent,
      hasSentInitialCommand: currentRecord.hasSentInitialCommand,
      pendingInitialRun: currentRecord.pendingInitialRun,
      isNew: currentRecord.isNew,
      sessionId: currentRecord.sessionId,
    };
  });
  for (const record of currentInWorkspace) {
    if (!incomingIds.has(sideChatRecordScopedId(record)) && record.isNew) {
      merged.push(record);
    }
  }
  return merged;
}

function sideChatRecordScopedId(record: LocalSideChatRecord): string {
  return `${record.workspace_id}\0${record.side_chat_id}`;
}

export function toSideChatDto(record: LocalSideChatRecord): TerminalSideChatRecord {
  return {
    side_chat_id: record.side_chat_id,
    workspace_id: record.workspace_id,
    project_name: record.project_name,
    workspace_name: record.workspace_name,
    source_pane_id: record.source_pane_id,
    source_tmux_window_name: record.source_tmux_window_name,
    source_surface_kind: record.source_surface_kind,
    source_surface_ref_json: record.source_surface_ref_json,
    side_tmux_window_name: record.side_tmux_window_name,
    agent_ref_json: record.agent_ref_json,
    color_hex: record.color_hex,
    status: normalizeSideChatStatus(record.status),
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export function normalizeSideChatStatus(status: LegacySideChatStatus): TerminalSideChatStatus {
  if (status === "visible") return "open";
  if (status === "closed") return "closing";
  if (status === "open" || status === "hidden" || status === "closing") return status;
  return "hidden";
}

export function isSideChatOpen(status: LegacySideChatStatus): boolean {
  return normalizeSideChatStatus(status) === "open";
}

export function isSideChatClosing(status: LegacySideChatStatus): boolean {
  return normalizeSideChatStatus(status) === "closing";
}

export function getAvailableSideChatRecords(records: LocalSideChatRecord[]): LocalSideChatRecord[] {
  return records.filter((record) => !isSideChatClosing(record.status));
}

export function getFirstOpenSideChatRecord(records: LocalSideChatRecord[]): LocalSideChatRecord | undefined {
  return records.find((record) => isSideChatOpen(record.status));
}

export function hasOpenSideChatRecord(records: LocalSideChatRecord[]): boolean {
  return getFirstOpenSideChatRecord(records) !== undefined;
}

export function pickUniqueBrightColor(existingColors: string[]) {
  const used = new Set(existingColors.map((color) => color.toLowerCase()));
  const available = BRIGHT_SIDE_CHAT_COLORS.filter((color) => !used.has(color.toLowerCase()));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const hue = Math.floor(Math.random() * 360);
    const color = hslToHex(hue, 78, 54);
    if (!used.has(color.toLowerCase())) return color;
  }
  return hslToHex(Math.floor(Math.random() * 360), 78, 54);
}

export function buildSideChatPrompt({
  capture,
  selectedContexts = [],
  sourceTmuxWindowName,
  userPrompt,
}: {
  capture: TerminalSideContextCaptureResponse;
  selectedContexts?: TerminalSelectionPromptContext[];
  sourceTmuxWindowName: string;
  userPrompt: string;
}) {
  const metadata = buildSideChatContextMetadata(capture, sourceTmuxWindowName);

  return [
    "You are continuing in a side chat forked from an Atmos terminal.",
    "Use the captured terminal context below as background. Do not assume it is complete.",
    "",
    metadata.join("\n"),
    "",
    "Captured terminal context:",
    "```text",
    capture.text,
    "```",
    "",
    ...buildSelectedContextPromptLines(selectedContexts),
    "User prompt:",
    userPrompt.trim(),
  ].join("\n");
}

export function shouldInlineSideChatPrompt(
  prompt: string,
  maxLines = SIDE_CHAT_INLINE_PROMPT_MAX_LINES,
): boolean {
  return countTextLines(prompt) <= maxLines;
}

export function buildSideChatContextFilePath({
  rootPath,
  workspaceId,
  timestampMs,
}: {
  rootPath: string;
  workspaceId: string;
  timestampMs: number;
}): string {
  return joinLocalPath(
    rootPath,
    ".atmos",
    "tmp",
    "context",
    sanitizeSideChatContextId(workspaceId),
    `side_${timestampMs}.txt`,
  );
}

export function buildSideChatContextFileContent({
  capture,
  selectedContexts = [],
  sourceTmuxWindowName,
}: {
  capture: TerminalSideContextCaptureResponse;
  selectedContexts?: TerminalSelectionPromptContext[];
  sourceTmuxWindowName: string;
}): string {
  const metadata = buildSideChatContextMetadata(capture, sourceTmuxWindowName);

  return [
    "Atmos terminal side chat context",
    "",
    metadata.join("\n"),
    "",
    "Captured terminal context:",
    "```text",
    capture.text,
    "```",
    "",
    ...buildSelectedContextPromptLines(selectedContexts),
  ].join("\n");
}

export function buildSideChatPromptWithContextFile({
  capture,
  contextFilePath,
  selectedContexts = [],
  sourceTmuxWindowName,
  userPrompt,
}: {
  capture: TerminalSideContextCaptureResponse;
  contextFilePath: string;
  selectedContexts?: TerminalSelectionPromptContext[];
  sourceTmuxWindowName: string;
  userPrompt: string;
}): string {
  const metadata = buildSideChatContextMetadata(capture, sourceTmuxWindowName);

  return [
    "You are continuing in a side chat forked from an Atmos terminal.",
    "The captured terminal context is stored in a local file instead of this prompt.",
    selectedContexts.length > 0
      ? "Read the file before relying on the terminal context. It also includes terminal text explicitly selected by the user. Do not assume either context is complete."
      : "Read the file before relying on the terminal context. Do not assume it is complete.",
    "",
    metadata.join("\n"),
    `Context file: ${contextFilePath}`,
    "",
    "User prompt:",
    userPrompt.trim(),
  ].join("\n");
}

export function parseAgentRef(value: string | null | undefined): TerminalPaneAgent | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<TerminalPaneAgent>;
    if (
      typeof parsed.id === "string" &&
      typeof parsed.label === "string" &&
      typeof parsed.command === "string" &&
      (parsed.iconType === "built-in" || parsed.iconType === "custom")
    ) {
      return {
        id: parsed.id,
        label: parsed.label,
        command: parsed.command,
        iconType: parsed.iconType,
        pipeCommand: typeof parsed.pipeCommand === "string" ? parsed.pipeCommand : undefined,
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function buildSideChatContextMetadata(
  capture: TerminalSideContextCaptureResponse,
  sourceTmuxWindowName: string,
): string[] {
  const metadata = [
    `Source terminal: ${sourceTmuxWindowName}`,
    `Captured lines: ${capture.captured_lines}`,
    `Captured bytes: ${capture.captured_bytes}/${capture.prompt_budget_bytes}`,
  ];
  if (capture.omitted_older_bytes > 0 || capture.omitted_middle_bytes > 0 || capture.truncated_bytes) {
    metadata.push("Capture was bounded; omitted content may exist outside this excerpt.");
  }
  return metadata;
}

type TerminalSelectionPromptContext = TerminalPromptContext & { kind: "terminal_selection" };

function buildSelectedContextPromptLines(
  selectedContexts: TerminalSelectionPromptContext[],
): string[] {
  if (selectedContexts.length === 0) return [];
  const blocks: string[] = [];
  selectedContexts.forEach((context, index) => {
    if (index > 0) blocks.push("");
    blocks.push(
      "User-selected terminal context:",
      "The user explicitly selected this terminal text as context for the side chat.",
      `Source terminal: ${context.sourceTmuxWindowName?.trim() || "unknown"}`,
      `Selected lines: ${context.lineCount}`,
      `Selected bytes: ${context.byteCount}`,
      `Selection was truncated: ${context.truncated ? "yes" : "no"}`,
      "```text",
      context.text,
      "```",
    );
  });
  blocks.push("");
  return blocks;
}

function countTextLines(text: string): number {
  if (!text) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

function joinLocalPath(rootPath: string, ...segments: string[]): string {
  const trimmedRoot = rootPath.trim();
  const normalizedRoot = trimmedRoot.replace(/[\\/]+$/, "") || trimmedRoot;
  const separator = normalizedRoot.endsWith("/") || normalizedRoot.endsWith("\\") ? "" : "/";
  return `${normalizedRoot}${separator}${segments.join("/")}`;
}

function sanitizeSideChatContextId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]/g, "_") || "workspace";
}

function hslToHex(h: number, s: number, l: number) {
  const saturation = s / 100;
  const lightness = l / 100;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${[r, g, b]
    .map((value) => Math.round((value + m) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}
