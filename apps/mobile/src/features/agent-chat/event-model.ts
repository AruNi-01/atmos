import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  classifyTranscriptPart,
  subagentChildParts,
  type TranscriptDetail,
} from "@atmos/agent-transcript";
import { collapsedToolTitle } from "./tool-kind";

export type EventBlock = {
  label: string;
  text: string;
  format: "plain" | "markdown";
};

export type EventViewModel = {
  kind: string;
  title: string;
  blocks: EventBlock[];
  nested: EventViewModel[];
  /** Set only on a transcript row that may open one sheet. A leaf sheet model keeps this null. */
  sheet: null | {
    title: string;
    blocks: EventBlock[];
    nested: EventViewModel[];
  };
};

export type SheetFrame = {
  id: string;
  model: EventViewModel;
};

export type ExpandState = {
  waitForOpen: Readonly<Record<string, boolean>>;
  sheets: SheetFrame[];
};

function block(label: string, text: string, format: EventBlock["format"] = "plain"): EventBlock[] {
  const value = text.trim();
  if (!value) return [];
  return [{ label, text: value, format }];
}

function joinLines(lines: Array<string | null | undefined>): string {
  return lines.map((line) => line?.trim() ?? "").filter((line) => line.length > 0).join("\n");
}

function detailBlocks(detail: TranscriptDetail): EventBlock[] {
  switch (detail.kind) {
    case "diff":
      return detail.files.flatMap((file) => [
        ...block("Path", file.path),
        ...block("Before", file.oldContent),
        ...block("After", file.newContent),
      ]);
    case "patch":
      return [...block("Path", detail.path ?? ""), ...block("Patch", detail.patch)];
    case "diff_stats":
      return [
        ...block("Path", detail.path ?? ""),
        ...block("Changes", `+${detail.additions} -${detail.deletions}`),
      ];
    case "code":
      return [
        ...block("Path", detail.path ?? ""),
        ...block("Language", detail.language),
        ...block(detail.hint === "deleted" ? "Deleted" : detail.hint === "new" ? "New" : "Code", detail.code),
      ];
    case "search":
      return [
        ...block("Query", joinLines([detail.query, detail.glob, detail.path])),
        ...block("Summary", detail.summary ?? ""),
        ...block(
          "Hits",
          detail.hits.map((hit) => joinLines([
            hit.line != null ? `${hit.path}:${hit.line}` : hit.path,
            hit.text,
          ])).join("\n\n"),
        ),
      ];
    case "web_search":
      return [
        ...block("Query", detail.query),
        ...block(
          "Links",
          detail.links.map((link) => joinLines([link.title, link.url, link.snippet])).join("\n\n"),
        ),
      ];
    case "web_fetch":
      return [
        ...block("Title", detail.title ?? ""),
        ...block("URL", detail.url),
        ...block("Page", detail.markdown || detail.text || "", detail.markdown ? "markdown" : "plain"),
      ];
    case "images":
      return block(
        "Images",
        detail.images.map((image) => image.path || image.url || image.mime || "").filter(Boolean).join("\n"),
      );
    case "files":
      return block("Files", detail.paths.join("\n"));
    case "tree":
      return block(
        "Tree",
        detail.entries.map((entry) => `${"  ".repeat(entry.indent)}${entry.name}${entry.isDir ? "/" : ""}`).join("\n"),
      );
    case "markdown":
      return block("Markdown", detail.markdown, "markdown");
    case "todos":
      return block("Todos", detail.todos.map((todo) => `${todo.status}: ${todo.content}`).join("\n"));
    case "json":
      return block("JSON", detail.json);
    case "text":
      return block("Output", detail.text);
    case "move":
      return [...block("From", detail.from), ...block("To", detail.to)];
    case "delete":
      return block("Path", detail.path);
    case "error":
      return block("Error", detail.text);
    case "empty":
      if (detail.path) {
        return [
          ...block("Path", detail.path),
          ...block("Preview", detail.preview === "image" ? "Image" : "Text"),
        ];
      }
      return detail.paramsJson ? [] : block("Output", "No output");
    case "image_gen":
      return [
        ...block("Prompt", detail.prompt),
        ...block("Aspect", detail.aspectRatio ?? ""),
        ...block("Size", detail.size ?? ""),
        ...block("Status", detail.status),
        ...block(
          "Images",
          detail.images.map((image) => image.path || image.url || "").filter(Boolean).join("\n"),
        ),
      ];
    case "plan_document":
      return [
        ...block("Overview", detail.overview ?? ""),
        ...block("Plan", detail.plan, "markdown"),
        ...block("Todos", detail.todos.map((todo) => `${todo.status}: ${todo.content}`).join("\n")),
      ];
    case "execute":
      return [
        ...block("Command", detail.command),
        ...block("Directory", detail.cwd ?? ""),
        ...block("Background", detail.background ? "Yes" : ""),
        ...block("Exit", detail.exitCode == null ? "" : String(detail.exitCode)),
        ...block("Output", detail.output ?? ""),
      ];
    case "subagent":
      return [
        ...block("Description", detail.description),
        ...block("Agent", detail.agentType ?? ""),
        ...block("Prompt", detail.prompt),
        ...block("Status", detail.status),
        ...block("Result", detail.resultText ?? "", "markdown"),
      ];
    case "text_part":
      return block("Message", detail.text, "markdown");
    case "thinking":
      return block("Thinking", detail.text, "markdown");
    case "error_part":
      return block("Error", detail.message);
    case "session_lifecycle":
      return [
        ...block("Status", detail.label),
        ...block("Error", detail.error ?? ""),
      ];
    case "session_config_change":
      return block("Change", detail.label);
    case "session_hint":
      return block("Hint", detail.label);
    case "permission":
      return [
        ...block("Tool", detail.tool),
        ...block("Description", detail.description),
        ...block("Details", detail.markdown ?? "", "markdown"),
        ...block("Options", detail.options.map((option) => option.name).join("\n")),
        ...block(
          "Questions",
          detail.questions.map((question) => joinLines([question.prompt, ...question.options])).join("\n\n"),
        ),
        ...block("Plan", detail.planTodos.map((todo) => `${todo.status}: ${todo.content}`).join("\n")),
        ...block("Status", detail.status),
      ];
    case "hidden":
      return block("Hidden", detail.reason);
  }
}

function blocksFor(detail: TranscriptDetail): EventBlock[] {
  return [...(detail.paramsJson ? block("Parameters", detail.paramsJson) : []), ...detailBlocks(detail)];
}

function firstLine(text: string, fallback: string): string {
  const line = text.trim().split("\n").find((row) => row.trim().length > 0)?.trim() ?? "";
  if (!line) return fallback;
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

function titleFor(part: AgentPart, detail: TranscriptDetail): string {
  switch (detail.kind) {
    case "thinking":
      return detail.durationMs != null && detail.durationMs > 0
        ? `Thought for ${formatDuration(detail.durationMs)}`
        : "Thought for a few seconds";
    case "text_part":
      return firstLine(detail.text, "Message");
    case "error_part":
      return firstLine(detail.message, "Error");
    case "session_lifecycle":
      return detail.status === "failed" && detail.error
        ? `${detail.label}: ${detail.error}`
        : detail.label;
    case "session_config_change":
    case "session_hint":
      return detail.label;
    case "permission":
      return detail.tool.trim() || "Permission";
    case "image_gen":
      return detail.prompt || "Image";
    case "plan_document":
      return detail.name || "Plan";
    case "subagent":
      return detail.description || "Subagent";
    case "execute":
      return part.type === "tool_call" ? collapsedToolTitle(part) : detail.command || "Run Script";
    case "hidden":
      return "Hidden";
    default:
      return part.type === "tool_call" ? collapsedToolTitle(part) : detail.kind;
  }
}

function formatDuration(durationMs: number): string {
  const total = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h${minutes}m${seconds}s`;
  if (minutes > 0) return `${minutes}m${seconds}s`;
  return `${seconds}s`;
}

const INLINE_KINDS = new Set([
  "text_part",
  "error_part",
  "session_lifecycle",
  "session_config_change",
  "session_hint",
  "permission",
  "hidden",
]);

function filled(detail: TranscriptDetail, title: string): EventBlock[] {
  const blocks = blocksFor(detail);
  if (blocks.length > 0) return blocks;
  return [{ label: "Output", text: title || "No output", format: "plain" }];
}

/** View model for one classified part. Kinds that expand carry a sheet payload. */
export function eventViewModel(part: AgentPart): EventViewModel {
  const classified = classifyTranscriptPart(part);
  const title = titleFor(part, classified.detail);
  const blocks = filled(classified.detail, title);
  const expandable = !INLINE_KINDS.has(classified.detail.kind);
  return {
    kind: classified.detail.kind,
    title,
    blocks,
    nested: [],
    sheet: expandable ? { title, blocks, nested: [] } : null,
  };
}

export function asLeaf(model: EventViewModel): EventViewModel {
  const source = model.sheet ?? { title: model.title, blocks: model.blocks, nested: model.nested };
  return {
    kind: model.kind,
    title: source.title,
    blocks: source.blocks,
    nested: source.nested.map(asLeaf),
    sheet: null,
  };
}

export function transcriptEventModel(
  part: AgentPart,
  siblings: AgentPart[] = [],
  messages: Array<Pick<AgentMessage, "role" | "parts">> = [],
): EventViewModel {
  const model = eventViewModel(part);
  if (part.type !== "tool_call" || part.kind !== "subagent" || !model.sheet) return model;
  const scope = messages.length > 0 ? messages : [{ role: "assistant", parts: siblings }];
  const nested = subagentChildParts(scope, part.tool_call_id).map((row) => asLeaf(eventViewModel(row)));
  return {
    ...model,
    sheet: { ...model.sheet, nested },
  };
}

export function furtherSheetTarget(model: EventViewModel): EventViewModel["sheet"] {
  return model.sheet;
}

export function initialExpandState(): ExpandState {
  return { waitForOpen: {}, sheets: [] };
}

export function isWaitForOpen(state: ExpandState, id: string): boolean {
  return state.waitForOpen[id] === true;
}

/** The whole Wait-for bar toggles in place and does not touch the sheet stack. */
export function activateWaitForBar(state: ExpandState, id: string): ExpandState {
  return {
    waitForOpen: { ...state.waitForOpen, [id]: !state.waitForOpen[id] },
    sheets: state.sheets,
  };
}

/** Opens one leaf sheet. A sheet that is already open does not gain another level. */
export function openLeafSheet(state: ExpandState, id: string, model: EventViewModel): ExpandState {
  if (state.sheets.length > 0) return state;
  return {
    ...state,
    sheets: [{ id, model: asLeaf(model) }],
  };
}

export function openGroupSheet(
  state: ExpandState,
  id: string,
  title: string,
  models: EventViewModel[],
): ExpandState {
  if (state.sheets.length > 0) return state;
  return {
    ...state,
    sheets: [{
      id,
      model: asLeaf({
        kind: "group",
        title,
        blocks: [],
        nested: models,
        sheet: { title, blocks: [], nested: models },
      }),
    }],
  };
}

export function activateFromSheet(state: ExpandState, model: EventViewModel): ExpandState {
  if (state.sheets.length > 0 || model.sheet == null) return state;
  return openLeafSheet(state, "sheet", model);
}

export function dismissSheet(state: ExpandState): ExpandState {
  return { ...state, sheets: state.sheets.slice(0, -1) };
}

export function waitForLabel(count: number): string {
  const n = Math.max(1, count);
  return n === 1 ? "Wait for 1 background agent" : `Wait for ${n} background agents`;
}
