import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  formatSearchScript,
  formatToolLineRange,
  hostFromUrl,
  isActiveToolStatus,
  isImageToolPath,
  isNestedSubagentChild,
  isSubagentWaitTool,
  matchCountFromSearchSummary,
  preferredCollapsedToolTitle,
  presentAgentTool,
  relativeDisplayPath,
  resolveAgentToolCardHeading,
  resolveTreeEntryPaths,
  toolKindHeadlineLabel,
  type AgentToolCallPart,
  type TreeEntry,
  type ParsedToolResult,
  type ToolPresentation,
} from "@atmos/agent-transcript";
import { copy, fillTemplate, formatCountChoice } from "./copy";
import { toolDiffSegments, type ToolDiffSegment } from "./tool-diff-hunks";

export const TOOL_BODY_LINE_CAP = 12;

export type UnifiedDiffLine = {
  op: "add" | "del" | "ctx";
  text: string;
  oldNo: number | null;
  newNo: number | null;
};

export type ImageGenStatus = "queued" | "generating" | "refining" | "complete" | "error";

export type ToolTreeRow = {
  name: string;
  path: string;
  indent: number;
  isDir: boolean;
  note: boolean;
};

export type ToolBodyModel =
  | {
      kind: "diff";
      title: string;
      files: Array<{
        path: string;
        additions: number;
        deletions: number;
        lines: UnifiedDiffLine[];
        segments: ToolDiffSegment[];
      }>;
    }
  | { kind: "diff_stats"; title: string; path: string | null; additions: number; deletions: number }
  | { kind: "patch"; title: string; path: string | null; text: string }
  | {
      kind: "code";
      title: string;
      path: string | null;
      text: string;
      language: string;
      hint: "new" | "deleted" | null;
      /** First gutter number. Reads with a range use the file line. */
      lineStart: number;
    }
  | {
      kind: "web_search";
      title: string;
      query: string;
      links: Array<{ title: string; url: string; openable: boolean }>;
    }
  | {
      kind: "web_fetch";
      title: string;
      url: string;
      body: string;
      format: "markdown" | "text" | "error";
    }
  | {
      kind: "search";
      title: string;
      query: string;
      script: string;
      groups: Array<{
        path: string;
        shown: string;
        hits: Array<{ line?: number; text: string }>;
      }>;
      summary: string;
      matchCount: number | null;
    }
  | { kind: "files"; title: string; paths: string[]; shown: string[] }
  | { kind: "tree"; title: string; rows: ToolTreeRow[] }
  | { kind: "markdown"; title: string; markdown: string }
  | {
      kind: "todos";
      title: string;
      items: Array<{ content: string; status: TodoStatusKind }>;
    }
  | { kind: "preview"; title: string; text: string; language: "json" | "plaintext" }
  | { kind: "prose"; title: string; text: string }
  | { kind: "execute"; title: string; command: string; output: string; failed: boolean }
  | { kind: "move"; title: string; from: string; to: string }
  | { kind: "delete"; title: string; path: string }
  | {
      kind: "plan_document";
      title: string;
      overview: string | null;
      plan: string;
      todos: Array<{ content: string; status: TodoStatusKind }>;
    }
  | { kind: "error"; title: string; text: string }
  | { kind: "empty"; title: string; path: string | null; message: string | null }
  | {
      kind: "images";
      title: string;
      items: Array<{ uri: string } | { path: string }>;
    }
  | {
      kind: "image_gen";
      title: string;
      prompt: string;
      path: string | null;
      aspect: number;
      status: ImageGenStatus;
      items: Array<{ uri: string } | { path: string }>;
    }
  | { kind: "subagent"; title: string; status: string };

export function toolRowTitle(
  part: { title?: string | null; name: string },
  parsed: { resolvedTool: string },
): string {
  const title = part.title?.trim();
  if (title) return title;
  const resolved = parsed.resolvedTool.trim();
  if (resolved) return resolved;
  return part.name;
}

export type ToolRowChrome = {
  title: string;
  fileName: string | null;
  lineRange: string | null;
};

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function skillNameFromPart(part: AgentToolCallPart): string | null {
  if (part.kind !== "skill") return null;
  if (part.params?.type === "skill" && part.params.skill.trim()) return part.params.skill.trim();
  const title = part.title?.trim();
  if (title) return title;
  const name = part.name?.trim();
  return name || null;
}

/** Collapsed tool trigger: kind verb plus a filename chip, matching web. */
export function toolRowChrome(part: AgentToolCallPart, parsed: ParsedToolResult): ToolRowChrome {
  const plan = planDocumentFields(part);
  if (plan) return { title: plan.title, fileName: null, lineRange: null };
  const image = imageGenFields(part);
  if (image) {
    return {
      title: image.title,
      fileName: image.path ? fileNameFromPath(image.path) : null,
      lineRange: null,
    };
  }
  if (parsed.presentation.kind === "web_search" || part.kind === "web_search") {
    const query =
      parsed.presentation.kind === "web_search"
        ? parsed.presentation.query.trim()
        : part.params?.type === "web_search"
          ? part.params.query
          : "";
    return {
      title: query ? fillTemplate(copy.webSearchSearchingFor, { query }) : copy.webSearch,
      fileName: null,
      lineRange: null,
    };
  }
  if (parsed.presentation.kind === "web_fetch" || part.kind === "fetch") {
    const url =
      parsed.presentation.kind === "web_fetch"
        ? parsed.presentation.url
        : part.params?.type === "fetch"
          ? part.params.url
          : "";
    const host = hostFromUrl(url) ?? url;
    return {
      title: fillTemplate(copy.fetchUrl, { host }),
      fileName: null,
      lineRange: null,
    };
  }
  const path = parsed.path?.trim() || null;
  const showChip = Boolean(
    path &&
    (part.kind === "read" ||
      part.kind === "edit" ||
      part.kind === "delete" ||
      parsed.presentation.kind === "code"),
  );
  const kindLabel = part.kind === "execute" ? copy.runScript : toolKindHeadlineLabel(part.kind);
  const skillName = skillNameFromPart(part);
  const created =
    (parsed.presentation.kind === "code" && parsed.presentation.hint === "new") ||
    diffIsCreatedFile(parsed.presentation);
  const title = created
    ? copy.createdFile
    : part.kind === "skill" && skillName
      ? `Skill: ${skillName}`
      : resolveAgentToolCardHeading({
          heading: preferredCollapsedToolTitle(part, kindLabel),
          path,
          kindLabel,
          omitPathInTitle: showChip,
          formatWithPath: (tool, filePath) => `${tool}: ${filePath}`,
        });
  return {
    title,
    fileName: showChip && path ? fileNameFromPath(path) : null,
    lineRange: showChip && part.kind === "read" ? formatToolLineRange(parsed.lineRange) : null,
  };
}

/** Web `SubAgentBlockView`: description, then the wire title, then the tool name. */
export function subagentRowTitle(part: AgentToolCallPart): string {
  const description = part.params?.type === "subagent" ? part.params.description.trim() : "";
  const name = description || part.title?.trim() || part.name.trim();
  return fillTemplate(copy.subagentRan, { name });
}

export function subagentStatusText(status: string | null | undefined): string {
  const value = (status ?? "").trim().toLowerCase();
  if (value === "failed" || value === "error") return copy.subagentStatus.failed;
  if (isActiveToolStatus(status)) return copy.subagentStatus.running;
  return copy.subagentStatus.completed;
}

/** Timeline rows skip nested children and vendor wait polls. Web omits both. */
export function showToolRow(part: AgentPart): boolean {
  if (part.type !== "tool_call") return true;
  if (isSubagentWaitTool(part)) return false;
  return !isNestedSubagentChild(part);
}

export function canOpenHttpUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

export type TodoStatusKind = "pending" | "in_progress" | "completed";

/** Same branches as web `AgentToolTodosBody`. Unknown statuses stay pending. */
export function todoStatusKind(status: string): TodoStatusKind {
  const value = status.trim().toLowerCase().replace(/-/g, "_");
  if (value === "completed") return "completed";
  if (value === "in_progress") return "in_progress";
  return "pending";
}

export function todoStatusLabel(kind: TodoStatusKind): string {
  if (kind === "completed") return copy.todoCompleted;
  if (kind === "in_progress") return copy.todoInProgress;
  return copy.todoPending;
}

/**
 * Web `AgentToolEmptyBody`. A read, edit, or delete that already has a path
 * keeps that path on the title chip instead of this line.
 */
export function emptyToolMessage(
  kind: string,
  status: string | null | undefined,
  path: string | null,
): string | null {
  if (path && (kind === "read" || kind === "edit" || kind === "delete")) return null;
  const completed = (status ?? "").toLowerCase() === "completed";
  return completed ? copy.noOutput : copy.processing;
}

/** Web `AgentToolErrorBody`: blank errors say Execution failed. */
export function toolErrorText(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : copy.executionFailed;
}

/** Web `deletedFileLabel`. The path is stored as-is; the phone row has no cwd. */
export function deletedFileLabel(path: string): string {
  return fillTemplate(copy.deletedFile, { path });
}

/** Web `AgentToolPlanDocument` fields. `presentAgentTool` drops this kind to empty. */
export function planDocumentFields(part: AgentToolCallPart): {
  kind: "plan_document";
  title: string;
  overview: string | null;
  plan: string;
  todos: Array<{ content: string; status: TodoStatusKind }>;
} | null {
  if (part.kind !== "plan_document" || part.params?.type !== "plan_document") return null;
  const params = part.params;
  const todos = (params.todos ?? [])
    .map((todo) => ({
      content: todo.content?.trim() ?? "",
      status: todoStatusKind(todo.status),
    }))
    .filter((todo) => todo.content.length > 0);
  const plan = params.plan?.trim() ?? "";
  return {
    kind: "plan_document",
    title: params.name?.trim() || part.title?.trim() || copy.planDocument,
    overview: params.overview?.trim() || null,
    plan,
    todos,
  };
}

/** Web opens a plan card when it has markdown or to-dos. */
export function planDocumentStartsOpen(model: {
  plan: string;
  todos: readonly unknown[];
}): boolean {
  return model.plan.length > 0 || model.todos.length > 0;
}

/** Label on the plan pane switch. `showing` is the pane currently on screen. */
export function planPaneSwitchLabel(showing: "body" | "todos", todoCount: number): string {
  if (showing === "body") return formatCountChoice(copy.planTodos, todoCount);
  return copy.planBody;
}

export function splitToolLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  return lines;
}

export function cappedToolText(
  text: string,
  expanded: boolean,
  cap = TOOL_BODY_LINE_CAP,
): { text: string; overflow: boolean } {
  const lines = splitToolLines(text);
  if (expanded || lines.length <= cap) return { text, overflow: lines.length > cap };
  return { text: lines.slice(0, cap).join("\n"), overflow: true };
}

export function imageBodyItem(image: {
  url?: string;
  path?: string;
}): { uri: string } | { path: string } | null {
  const url = image.url?.trim() ?? "";
  if (canOpenHttpUrl(url) || url.startsWith("data:image/")) return { uri: url };
  const path = image.path?.trim() ?? "";
  if (path) return { path };
  if (url) return { path: url };
  return null;
}

/** Same words as web `ImageGeneration` STATUS_TEXT. They are not in en.json. */
export const IMAGE_GEN_STATUS_TEXT: Record<ImageGenStatus, string> = {
  queued: "Waiting to generate",
  generating: "Generating image",
  refining: "Refining details",
  complete: "Image ready",
  error: "Generation failed",
};

/** Web `statusFromPart`. Pending is queued; an active tool is generating. */
export function imageGenStatus(part: AgentToolCallPart): ImageGenStatus {
  const status = (part.status ?? "").toLowerCase();
  if (status === "failed" || part.result?.type === "error") return "error";
  if (status === "completed") return "complete";
  if (status === "pending") return "queued";
  if (isActiveToolStatus(status)) return "generating";
  return "generating";
}

/** Web `aspectCss`, as a width/height number. `auto` and unknown values are square. */
export function imageGenAspectRatio(ratio: string | null | undefined): number {
  if (!ratio) return 1;
  const trimmed = ratio.trim();
  if (!trimmed || trimmed.toLowerCase() === "auto") return 1;
  const match = trimmed.match(/^(\d+)\s*[:/x×]\s*(\d+)$/i);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width > 0 && height > 0) return width / height;
  }
  if (trimmed.includes("/")) {
    const [widthText, heightText] = trimmed.split("/");
    const width = Number(widthText?.trim());
    const height = Number(heightText?.trim());
    if (width > 0 && height > 0) return width / height;
  }
  return 1;
}

/** Web keeps the card open while `isActiveToolStatus` is true, including pending. */
export function imageGenStaysOpen(status: string | null | undefined): boolean {
  return isActiveToolStatus(status);
}

/** Web `AgentToolImageGen` fields. `presentAgentTool` drops a bare image_gen to empty. */
export function imageGenFields(
  part: AgentToolCallPart,
): Extract<ToolBodyModel, { kind: "image_gen" }> | null {
  if (part.kind !== "image_gen") return null;
  const params = part.params?.type === "image_gen" ? part.params : null;
  const images =
    part.result?.type === "images"
      ? part.result.images
      : params?.path
        ? [{ path: params.path }]
        : [];
  const path =
    params?.path?.trim() || images.find((image) => image.path?.trim())?.path?.trim() || null;
  return {
    kind: "image_gen",
    title: (part.title || part.name || copy.imageGen).trim() || copy.imageGen,
    prompt: params?.prompt.trim() ?? "",
    path,
    aspect: imageGenAspectRatio(params?.aspect_ratio),
    status: imageGenStatus(part),
    items: images.flatMap((image) => {
      const item = imageBodyItem({
        url: image.url ?? undefined,
        path: image.path ?? undefined,
      });
      return item ? [item] : [];
    }),
  };
}

export function unifiedLineDiff(
  oldContent: string,
  newContent: string,
): {
  lines: UnifiedDiffLine[];
  segments: ToolDiffSegment[];
  additions: number;
  deletions: number;
} {
  return toolDiffSegments(oldContent, newContent);
}

/** Unified patch lines with hunk line numbers. File headers and hunk markers are skipped. */
export function patchDiffLines(patch: string): UnifiedDiffLine[] {
  const lines: UnifiedDiffLine[] = [];
  let oldNo = 1;
  let newNo = 1;
  for (const raw of patch.split("\n")) {
    if (
      raw.startsWith("@@") ||
      raw.startsWith("---") ||
      raw.startsWith("+++") ||
      raw.startsWith("diff ") ||
      raw.startsWith("index ")
    ) {
      const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(raw);
      if (hunk) {
        oldNo = Number(hunk[1]);
        newNo = Number(hunk[2]);
      }
      continue;
    }
    if (raw.startsWith("+")) {
      lines.push({ op: "add", text: raw.slice(1), oldNo: null, newNo });
      newNo += 1;
      continue;
    }
    if (raw.startsWith("-")) {
      lines.push({ op: "del", text: raw.slice(1), oldNo, newNo: null });
      oldNo += 1;
      continue;
    }
    if (raw.startsWith(" ")) {
      lines.push({ op: "ctx", text: raw.slice(1), oldNo, newNo });
      oldNo += 1;
      newNo += 1;
    }
  }
  return lines;
}

type SearchHitFields = { path: string; line?: number; text: string };

export type SearchHitGroup = {
  path: string;
  shown: string;
  hits: Array<{ line?: number; text: string }>;
};

/** Web shows the hit count, and falls back to the summary when there are no hits. */
export function searchMatchCount(hitCount: number, summary: string | undefined): number | null {
  if (hitCount > 0) return hitCount;
  return matchCountFromSearchSummary(summary);
}

export function searchMatchLabel(count: number | null): string | null {
  if (count == null) return null;
  return formatCountChoice(copy.searchMatchCount, count);
}

/** First-seen path order. The label drops the shared directory, matching `relativeDisplayPath`. */
export function groupSearchHits(hits: readonly SearchHitFields[]): SearchHitGroup[] {
  const grouped = new Map<string, Array<{ line?: number; text: string }>>();
  for (const hit of hits) {
    const list = grouped.get(hit.path) ?? [];
    list.push(hit.line != null ? { line: hit.line, text: hit.text } : { text: hit.text });
    grouped.set(hit.path, list);
  }
  const paths = [...grouped.keys()];
  return [...grouped.entries()].map(([path, pathHits]) => ({
    path,
    shown: relativeDisplayPath(path, paths),
    hits: pathHits,
  }));
}

type WithoutTitle<T> = T extends { title: string } ? Omit<T, "title"> : never;
type ToolBodyFields = WithoutTitle<ToolBodyModel>;

function fieldsForPresentation(part: AgentToolCallPart, parsed: ParsedToolResult): ToolBodyFields {
  const presentation: ToolPresentation = parsed.presentation;
  switch (presentation.kind) {
    case "diff":
      return {
        kind: "diff",
        files: presentation.files.map((file) => {
          const diff = unifiedLineDiff(file.oldContent, file.newContent);
          return {
            path: file.path,
            additions: diff.additions,
            deletions: diff.deletions,
            lines: diff.lines,
            segments: diff.segments,
          };
        }),
      };
    case "diff_stats":
      return {
        kind: "diff_stats",
        path: presentation.path,
        additions: presentation.additions,
        deletions: presentation.deletions,
      };
    case "patch":
      return { kind: "patch", path: presentation.path, text: presentation.patch };
    case "code":
      return {
        kind: "code",
        path: presentation.path,
        text: presentation.code,
        language: presentation.language,
        hint: presentation.hint ?? null,
        lineStart: Math.max(1, parsed.lineRange?.start ?? 1),
      };
    case "web_search":
      return {
        kind: "web_search",
        query: presentation.query,
        links: presentation.links.map((link) => ({
          title: link.title.trim() || hostFromUrl(link.url) || link.url,
          url: link.url,
          openable: canOpenHttpUrl(link.url),
        })),
      };
    case "web_fetch": {
      const markdown = presentation.markdown?.trim() ?? "";
      const text = presentation.text?.trim() ?? "";
      const failed = (part.status ?? "").toLowerCase() === "failed";
      const format = failed ? "error" : markdown ? "markdown" : "text";
      return {
        kind: "web_fetch",
        url: presentation.url,
        body: format === "markdown" ? markdown : text,
        format,
      };
    }
    case "search": {
      const hits = presentation.hits.map((hit) => ({
        path: hit.path,
        ...(hit.line != null ? { line: hit.line } : {}),
        text: hit.text,
      }));
      return {
        kind: "search",
        query: presentation.query,
        script: formatSearchScript(presentation.query, presentation.glob, presentation.path),
        groups: groupSearchHits(hits),
        summary: presentation.summary?.trim() ?? "",
        matchCount: searchMatchCount(hits.length, presentation.summary),
      };
    }
    case "files":
      return {
        kind: "files",
        paths: presentation.paths,
        shown: fileListShown(presentation.paths),
      };
    case "tree":
      return { kind: "tree", rows: treeRows(presentation.entries) };
    case "markdown":
      return { kind: "markdown", markdown: presentation.markdown };
    case "todos":
      return {
        kind: "todos",
        items: presentation.todos.map((todo) => ({
          content: todo.content,
          status: todoStatusKind(todo.status),
        })),
      };
    case "json":
      return { kind: "preview", text: presentation.json, language: "json" };
    case "text":
      return toolTextUsesPreview(presentation.text)
        ? { kind: "preview", text: presentation.text, language: "plaintext" }
        : { kind: "prose", text: presentation.text };
    case "move":
      return { kind: "move", from: presentation.from, to: presentation.to };
    case "delete":
      return { kind: "delete", path: presentation.path };
    case "error":
      return { kind: "error", text: toolErrorText(presentation.text) };
    case "empty":
      return {
        kind: "empty",
        path: part.kind === "read" ? parsed.path : null,
        message: emptyToolMessage(part.kind, part.status, parsed.path),
      };
    case "images":
      return {
        kind: "images",
        items: presentation.images.flatMap((image) => {
          const item = imageBodyItem(image);
          return item ? [item] : [];
        }),
      };
    default: {
      const unreachable: never = presentation;
      return unreachable;
    }
  }
}

/** Plan and image generation read the tool part. Other kinds use `presentAgentTool`. */
export function toolBodyModel(part: AgentToolCallPart): ToolBodyModel {
  const parsed = presentAgentTool(part);
  const title = toolRowTitle(part, parsed);
  if (part.kind === "subagent") {
    return {
      kind: "subagent",
      title: subagentRowTitle(part),
      status: subagentStatusText(part.status),
    };
  }
  const plan = planDocumentFields(part);
  if (plan) return plan;
  const image = imageGenFields(part);
  if (image) return image;
  if (part.kind === "execute") {
    const terminal = executeTerminalFields(part);
    if (!terminal.command && !terminal.output) {
      return {
        kind: "empty",
        title,
        path: null,
        message: emptyToolMessage(part.kind, part.status, null),
      };
    }
    return { kind: "execute", title, ...terminal };
  }
  const fields = fieldsForPresentation(part, parsed);
  return { ...fields, title };
}

function patchLineStats(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}

export function toolRowDiffStats(model: ToolBodyModel): { additions: number; deletions: number } {
  if (model.kind === "diff") {
    return model.files.reduce(
      (sum, file) => ({
        additions: sum.additions + file.additions,
        deletions: sum.deletions + file.deletions,
      }),
      { additions: 0, deletions: 0 },
    );
  }
  if (model.kind === "diff_stats") {
    return { additions: model.additions, deletions: model.deletions };
  }
  if (model.kind === "patch") return patchLineStats(model.text);
  if (model.kind === "code" && model.hint === "new") {
    return { additions: splitToolLines(model.text).length, deletions: 0 };
  }
  if (model.kind === "code" && model.hint === "deleted") {
    return { additions: 0, deletions: splitToolLines(model.text).length };
  }
  return { additions: 0, deletions: 0 };
}

/** Web titles a write Created when every file has no old body and some new body. */
export function diffIsCreatedFile(presentation: ToolPresentation): boolean {
  if (presentation.kind !== "diff" || presentation.files.length === 0) return false;
  return presentation.files.every((file) => !file.oldContent && Boolean(file.newContent));
}

/** Web `AgentToolTextBody` opens a preview once the text has a newline or passes this length. */
export const TOOL_TEXT_PREVIEW_LIMIT = 160;

/**
 * Web plaintext preview lines (`text-[13px] leading-relaxed`, `px-3 py-0.5`).
 * `leading-relaxed` is 1.625, so 13px type is a 21px line. The row padding is
 * that `py-0.5`, so each line's pitch is 25px. Highlighted fences stay on
 * `text-sm leading-5`.
 *
 * Numbers are `text-xs` mono with `min-width: 3ch` and grow with the last
 * label. Geist Mono's `0` is 0.6em, so 12px type makes one `ch` 7.2px.
 */
export const TOOL_PLAIN_LINE_FONT = 13;
export const TOOL_PLAIN_LINE_HEIGHT = 21;
export const TOOL_PLAIN_LINE_PAD_X = 12;
export const TOOL_PLAIN_LINE_PAD_Y = 2;
export const TOOL_PLAIN_NUMBER_FONT = 12;
export const TOOL_PLAIN_NUMBER_CH = 7.2;

/** Web gutter: at least 3ch, wider once the last label needs more digits. */
export function toolPlainLineNumberWidth(lastLine: number): number {
  const digits = String(Math.max(1, Math.trunc(lastLine))).length;
  const columns = Math.max(3, digits);
  return Math.round(TOOL_PLAIN_NUMBER_FONT * 0.6 * columns * 10) / 10;
}

export function toolTextUsesPreview(text: string): boolean {
  return text.includes("\n") || text.length > TOOL_TEXT_PREVIEW_LIMIT;
}

/** Web `max-h-96` on a collapsed Markdown code fence and on terminal output. */
export const TOOL_CODE_MAX_HEIGHT = 384;

/**
 * Web `ExpandButton` is a 14px chevron, `text-neutral-600` /
 * `dark:text-neutral-400`. A markdown fence header is 36px with `px-2`.
 * The chevron sits one `gap-2` (8px) left of the 14px copy glyph, so its
 * top is `(36 - 14) / 2` and its right inset is `8 + 14 + 8`.
 * `AgentToolCodePreview` floats the same glyph at `top-1.5` `right-2`.
 */
export const CODE_EXPAND_ICON = 14;
export const CODE_EXPAND_LIGHT = "#52525b";
export const CODE_EXPAND_DARK = "#a3a3a3";
export const CODE_FENCE_EXPAND_TOP = 11;
export const CODE_FENCE_EXPAND_RIGHT = 30;
export const CODE_PREVIEW_EXPAND_TOP = 6;
export const CODE_PREVIEW_EXPAND_RIGHT = 8;

export function codeExpandColor(isDark: boolean): string {
  return isDark ? CODE_EXPAND_DARK : CODE_EXPAND_LIGHT;
}

/** Web `max-h-56` on the terminal command line. */
export const TOOL_COMMAND_MAX_HEIGHT = 224;

/**
 * Web execute copy menu: `top-1.5` `right-1.5`, `size-6` button,
 * `size-3.5` glyph, `min-w-40` menu. The command uses `pr-9` so the
 * text clears that button.
 */
export const EXECUTE_MENU_INSET = 6;
export const EXECUTE_MENU_BUTTON = 24;
export const EXECUTE_MENU_ICON = 14;
export const EXECUTE_MENU_RADIUS = 8;
export const EXECUTE_MENU_MIN_WIDTH = 160;
export const EXECUTE_COMMAND_PAD_RIGHT = 36;

/** Web discussion diff `max-h-[28rem]`. */
export const TOOL_DIFF_MAX_HEIGHT = 448;

/** Web file list `max-h-72`. */
export const TOOL_FILE_LIST_MAX_HEIGHT = 288;

/**
 * Tailwind v4 `text-green-500` and `text-red-500`.
 * Those utilities do not change in dark mode. Values are the sRGB clip of the theme OKLCH.
 */
export const TOOL_ADDITION_COLOR = "#00c950";
export const TOOL_DELETION_COLOR = "#fb2c36";

/** Same directory guess as web `agentChatPathLooksLikeDirectory`. */
export function pathLooksLikeDirectory(path: string): boolean {
  const trimmed = path.trim().replace(/^['"`]+|['"`]+$/g, "");
  if (!trimmed) return false;
  if (/[/\\]$/.test(trimmed)) return true;
  const name = trimmed.split(/[\\/]/).filter(Boolean).pop() || trimmed;
  if (!name || name === "." || name === "..") return true;
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0) return true;
  return !/^[A-Za-z0-9]{1,12}$/.test(name.slice(lastDot + 1));
}

export function fileListShown(paths: readonly string[]): string[] {
  return paths.map((path) => relativeDisplayPath(path, [...paths]));
}

export function treeRows(entries: readonly TreeEntry[]): ToolTreeRow[] {
  const paths = resolveTreeEntryPaths([...entries]);
  return entries.map((entry, index) => ({
    name: entry.name,
    path: paths[index] ?? entry.name,
    indent: entry.indent,
    isDir: entry.kind === "note" ? false : entry.isDir,
    note: entry.kind === "note",
  }));
}

/**
 * Web `TerminalBlock` keeps the command and paints a failed run in red.
 * An empty command and empty output use the shared empty line instead.
 */
export function executeTerminalFields(part: AgentToolCallPart): {
  command: string;
  output: string;
  failed: boolean;
} {
  const command = part.params?.type === "execute" ? part.params.command : "";
  const result = part.result;
  const output =
    result?.type === "execute"
      ? result.output
      : result?.type === "text"
        ? result.text
        : result?.type === "error"
          ? result.message
          : "";
  const failed = (part.status ?? "").toLowerCase() === "failed" || result?.type === "error";
  return { command, output, failed };
}

/** Same fence wrapper web uses before `MarkdownRenderer` for a read or code preview. */
export function fenceForMarkdown(code: string, language: string): string {
  let ticks = "```";
  while (code.includes(ticks)) ticks += "`";
  return `${ticks}${language}\n${code}\n${ticks}`;
}

/** 11px word beside a new or deleted code preview. A plain read has none. */
export function codePreviewMeta(hint: "new" | "deleted" | null | undefined): string | null {
  if (hint === "new") return copy.newFile;
  if (hint === "deleted") return copy.deletedFileStatus;
  return null;
}

/** Edit tools only, matching web `sumToolGroupDiffStats`. */
export function toolGroupDiffTotals(parts: AgentPart[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const part of parts) {
    if (part.type !== "tool_call" || part.kind !== "edit") continue;
    const result = part.result;
    if (result?.type === "diff_stats") {
      additions += result.additions;
      deletions += result.deletions;
      continue;
    }
    if (result?.type === "diff") {
      const next = unifiedLineDiff(result.old_content ?? "", result.new_content);
      additions += next.additions;
      deletions += next.deletions;
      continue;
    }
    const presentation = presentAgentTool(part).presentation;
    if (presentation.kind === "patch") {
      const next = patchLineStats(presentation.patch);
      additions += next.additions;
      deletions += next.deletions;
    } else if (presentation.kind === "code" && presentation.hint === "new") {
      additions += splitToolLines(presentation.code).length;
    } else if (presentation.kind === "code" && presentation.hint === "deleted") {
      deletions += splitToolLines(presentation.code).length;
    }
  }
  return { additions, deletions };
}

/** Web discussion diff `rounded-lg` (`--radius` 0.625rem). */
export const TOOL_DIFF_RADIUS = 10;
/**
 * `border-border/60` and `border-border/40`. `--border` is black or white at 10%,
 * mixed toward transparent by the slash amount.
 */
export const TOOL_DIFF_BORDER_LIGHT = "rgba(0, 0, 0, 0.06)";
export const TOOL_DIFF_BORDER_DARK = "rgba(255, 255, 255, 0.06)";
export const TOOL_DIFF_HEADER_RULE_LIGHT = "rgba(0, 0, 0, 0.04)";
export const TOOL_DIFF_HEADER_RULE_DARK = "rgba(255, 255, 255, 0.04)";
/** `bg-muted/30`. */
export const TOOL_DIFF_HEADER_LIGHT = "rgba(222, 222, 224, 0.3)";
export const TOOL_DIFF_HEADER_DARK = "rgba(39, 39, 42, 0.3)";

/**
 * Pierre unified diff (`diffStyle: "unified"`). One number column, 13px on a
 * 20px line. `ch` is 0.6em of that face. Web sizes the column as content-box:
 * 2ch before the digits, at least 3ch of digits, and 1ch after. The code line
 * has 1ch of side padding. A changed number carries a 4px bar on its left edge.
 */
export const TOOL_DIFF_CODE_FONT = 13;
export const TOOL_DIFF_LINE_HEIGHT = 20;
export const TOOL_DIFF_NUMBER_PAD_LEFT = 15.6;
export const TOOL_DIFF_NUMBER_PAD_RIGHT = 7.8;
export const TOOL_DIFF_CODE_PAD = 7.8;
export const TOOL_DIFF_BAR = 4;
export const TOOL_DIFF_NUMBER_ADD_LIGHT = "#0dbe4e";
export const TOOL_DIFF_NUMBER_ADD_DARK = "#5ecc71";
export const TOOL_DIFF_NUMBER_DEL_LIGHT = "#ff2e3f";
export const TOOL_DIFF_NUMBER_DEL_DARK = "#ff6762";
/**
 * Pierre `--diffs-fg-number`: `color-mix(in lab, fg 65%, canvas)` with fg
 * `#000` / `#fff`. Context rows are transparent, so the canvas is the chat
 * page (`#f4f4f6` / `#000000`).
 */
export const TOOL_DIFF_NUMBER_CONTEXT_LIGHT = "#4f4f50";
export const TOOL_DIFF_NUMBER_CONTEXT_DARK = "#9e9e9e";

export function toolDiffContextNumber(isDark: boolean): string {
  return isDark ? TOOL_DIFF_NUMBER_CONTEXT_DARK : TOOL_DIFF_NUMBER_CONTEXT_LIGHT;
}

/** Unified rows show the new-file number, and the old-file number on a deletion. */
export function toolDiffUnifiedLineNo(
  line: Pick<UnifiedDiffLine, "op" | "oldNo" | "newNo">,
): number | null {
  if (line.op === "del") return line.oldNo;
  return line.newNo ?? line.oldNo;
}

/** Border-box width of the Pierre number column for the widest label. */
export function toolDiffNumberColumnWidth(lastLine: number): number {
  const digits = String(Math.max(1, Math.trunc(lastLine))).length;
  const columns = Math.max(3, digits);
  const chTenths = TOOL_DIFF_CODE_FONT * 6;
  return (chTenths * 2 + chTenths * columns + chTenths) / 10;
}

function toolDiffLastNumber(lines: readonly UnifiedDiffLine[]): number {
  let last = 1;
  for (const line of lines) {
    const value = toolDiffUnifiedLineNo(line);
    if (value != null && value > last) last = value;
  }
  return last;
}

/**
 * Pierre's gutter rule. `[data-column-number]` is content-box, and the gutter
 * adds `2px solid var(--diffs-bg)` after that column.
 */
export const TOOL_DIFF_GUTTER_RULE = 2;

/**
 * Pierre row fills. `color-mix(in lab, canvas P%, base)` with the line at
 * 88% light / 80% dark and the number column at 91% light / 85% dark.
 * The canvas is this chat page (`#f4f4f6` / `#000000`). Web mixes the same
 * percentages against its own `--background`.
 */
export const TOOL_DIFF_LINE_ADD_LIGHT = "#dfeee2";
export const TOOL_DIFF_LINE_ADD_DARK = "#1a291b";
export const TOOL_DIFF_LINE_DEL_LIGHT = "#fbe0de";
export const TOOL_DIFF_LINE_DEL_DARK = "#321a18";
export const TOOL_DIFF_NUMBER_FILL_ADD_LIGHT = "#e4f0e7";
export const TOOL_DIFF_NUMBER_FILL_ADD_DARK = "#152016";
export const TOOL_DIFF_NUMBER_FILL_DEL_LIGHT = "#fae5e4";
export const TOOL_DIFF_NUMBER_FILL_DEL_DARK = "#271614";

export function toolDiffLineFill(op: "add" | "del", isDark: boolean): string {
  if (op === "add") return isDark ? TOOL_DIFF_LINE_ADD_DARK : TOOL_DIFF_LINE_ADD_LIGHT;
  return isDark ? TOOL_DIFF_LINE_DEL_DARK : TOOL_DIFF_LINE_DEL_LIGHT;
}

export function toolDiffNumberFill(op: "add" | "del", isDark: boolean): string {
  if (op === "add") {
    return isDark ? TOOL_DIFF_NUMBER_FILL_ADD_DARK : TOOL_DIFF_NUMBER_FILL_ADD_LIGHT;
  }
  return isDark ? TOOL_DIFF_NUMBER_FILL_DEL_DARK : TOOL_DIFF_NUMBER_FILL_DEL_LIGHT;
}

/**
 * Web `bg-muted/50` (`oklch(0.9 0.004 286)` / `oklch(0.274 0.006 286.033)` at 50%).
 * `rounded-md` is `--radius` (10px) minus 2px.
 */
export const TOOL_PANEL_LIGHT = "rgba(222, 222, 224, 0.5)";
export const TOOL_PANEL_DARK = "rgba(39, 39, 42, 0.5)";
export const TOOL_PANEL_RADIUS = 8;

/**
 * Web row filename chip `rounded-md bg-muted`. Opaque muted, unlike the panel's `/50`.
 * Hover, tooltip, and click stay on web. Per-extension glyphs stay on web.
 */
export const TOOL_FILE_CHIP_LIGHT = "#dedee0";
export const TOOL_FILE_CHIP_DARK = "#27272a";
export const TOOL_FILE_CHIP_RADIUS = 8;

/**
 * Web image box `rounded-xl` (`--radius` + 4px). The empty fill is opaque
 * `bg-muted`, the same solid as the filename chip. The dither field stays on web.
 */
export const IMAGE_GEN_RADIUS = 14;

/**
 * Web wraps execute, other, and the default tool body in `mt-1 rounded-md bg-muted/50`.
 * Code, markdown, json, diffs, search-the-web, plan, and image generation stay plain.
 * A failed or non-markdown fetch uses the panel. An empty image read does not.
 */
export function toolBodyUsesPanel(model: ToolBodyModel, partKind: string): boolean {
  if (partKind === "other" || partKind === "execute") return true;
  switch (model.kind) {
    case "search":
    case "files":
    case "tree":
    case "prose":
    case "execute":
    case "move":
    case "delete":
    case "error":
    case "images":
      return true;
    case "preview":
      return model.language !== "json";
    case "web_fetch":
      return model.format !== "markdown";
    case "empty":
      return !(model.path && isImageToolPath(model.path));
    default:
      return false;
  }
}

// @view

import { useEffect, useId, useState, type ReactNode } from "react";
import { Animated, Image, Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";
import * as Clipboard from "expo-clipboard";
import { useMobileTheme } from "@/theme/theme-store";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  CircleIcon,
  FileTextIcon,
  FolderIcon,
  ListTodoIcon,
  MoreHorizontalIcon,
  ScrollTextIcon,
  XCircleIcon,
} from "@/ui/icons/lucide-native";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { TOOL_MARKDOWN_LINE_HEIGHT, TOOL_PROSE_LINE_HEIGHT } from "./markdown-chrome";
import { chatForeground, chatForeground80, chatMutedForeground } from "./chat-ink";
import { chatDestructiveColor } from "./destructive-color";
import { terminalAnsiPieces } from "./terminal-ansi";
import { toolDiffLineWordPieces, toolDiffWordFill } from "./tool-diff-words";
import {
  TOOL_DIFF_SEPARATOR_HEIGHT,
  TOOL_DIFF_SEPARATOR_INSET,
  TOOL_DIFF_SEPARATOR_RADIUS,
  toolDiffRevealMore,
  toolDiffSegmentsFromPatch,
  toolDiffSeparatorFill,
  toolDiffUnmodifiedLabel,
  toolDiffVisibleRows,
  type ToolDiffReveal,
} from "./tool-diff-hunks";
import { agentChatToolExpandKey, useAgentChatExpand } from "./expand-store";
import { useReducedMotion } from "./motion/use-reduced-motion";
import { TextShimmer } from "./motion/text-shimmer";
import { toolTriggerMetrics } from "./tool-chrome";
import { ToolKindIcon } from "./tool-kind-icon";
import { ExpandChevron } from "./tool-tree";
import { HttpFavicon } from "./web-search-sources";
import { webSearchResultMeta } from "./web-search-stack";
import { WebSearchSources } from "./web-search-sources";

const BODY_TEXT = { fontSize: 14, lineHeight: 20 } as const;
const CHIP_TEXT = { fontFamily: "Menlo", fontSize: 12, lineHeight: 16 } as const;

function PathChip({ path }: { path: string }) {
  const theme = useMobileTheme();
  if (!path) return null;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: theme.colors.cardSubtle,
        borderRadius: 6,
        maxWidth: "100%",
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text numberOfLines={1} style={{ ...CHIP_TEXT, color: chatForeground(theme.isDark) }}>
        {path}
      </Text>
    </View>
  );
}

export function ToolDiffStats({ additions, deletions }: { additions: number; deletions: number }) {
  const theme = useMobileTheme();
  if (additions <= 0 && deletions <= 0) return null;
  return (
    <Text style={{ fontFamily: "Menlo", fontSize: 12, lineHeight: 16 }}>
      {deletions > 0 ? <Text style={{ color: TOOL_DELETION_COLOR }}>-{deletions}</Text> : null}
      {deletions > 0 && additions > 0 ? (
        <Text style={{ color: chatMutedForeground(theme.isDark), marginHorizontal: 4 }}>/</Text>
      ) : null}
      {additions > 0 ? <Text style={{ color: TOOL_ADDITION_COLOR }}>+{additions}</Text> : null}
    </Text>
  );
}

function ShowMoreButton({ expanded, onPress }: { expanded: boolean; onPress: () => void }) {
  const theme = useMobileTheme();
  return (
    <Pressable accessibilityRole="button" hitSlop={6} onPress={onPress}>
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 }}>
        {expanded ? copy.showLess : copy.showMore}
      </Text>
    </Pressable>
  );
}

function CodeExpandButton({
  expanded,
  onPress,
  top,
  right,
}: {
  expanded: boolean;
  onPress: () => void;
  top: number;
  right: number;
}) {
  const theme = useMobileTheme();
  const Icon = expanded ? ChevronsDownUpIcon : ChevronsUpDownIcon;
  return (
    <Pressable
      accessibilityLabel={expanded ? copy.collapseCode : copy.expandCode}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={{ position: "absolute", right, top, zIndex: 1 }}
    >
      <Icon color={codeExpandColor(theme.isDark)} size={CODE_EXPAND_ICON} strokeWidth={2} />
    </Pressable>
  );
}

function ToolCodeFence({
  text,
  language,
  lineStart,
}: {
  text: string;
  language: string;
  lineStart: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  if (!text) return null;
  return (
    <View style={{ paddingBottom: 8, paddingHorizontal: 8 }}>
      <View>
        <View
          onLayout={(event) => {
            if (!expanded && event.nativeEvent.layout.height >= TOOL_CODE_MAX_HEIGHT) {
              setOverflow(true);
            }
          }}
          style={expanded ? undefined : { maxHeight: TOOL_CODE_MAX_HEIGHT, overflow: "hidden" }}
        >
          <AgentChatMarkdown
            codeBlockLineStart={lineStart}
            codeBlockMargin={8}
            codeBlockMaxHeight={0}
            text={fenceForMarkdown(text, language)}
          />
        </View>
        {overflow ? (
          <CodeExpandButton
            expanded={expanded}
            onPress={() => setExpanded((current) => !current)}
            right={CODE_FENCE_EXPAND_RIGHT}
            top={CODE_FENCE_EXPAND_TOP}
          />
        ) : null}
      </View>
    </View>
  );
}

function HeightClip({ maxHeight, children }: { maxHeight: number; children: ReactNode }) {
  const [contentHeight, setContentHeight] = useState(0);
  const height = contentHeight > 0 ? Math.min(contentHeight, maxHeight) : undefined;
  return (
    <View style={{ height, maxHeight }}>
      <ScrollView
        nestedScrollEnabled
        onContentSizeChange={(_width, next) => setContentHeight(next)}
        scrollEnabled={contentHeight > maxHeight}
        style={{ maxHeight }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function ExecuteCopyMenu({ command, output }: { command: string; output: string }) {
  const theme = useMobileTheme();
  const [open, setOpen] = useState(false);
  const muted = chatMutedForeground(theme.isDark);
  const copyText = (text: string) => {
    const value = text.trimEnd();
    if (!value) return;
    void Clipboard.setStringAsync(value).catch(() => {});
    setOpen(false);
  };
  const item = (label: string, text: string, enabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      disabled={!enabled}
      onPress={() => copyText(text)}
      style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6 }}
    >
      <Text
        style={{
          color: enabled ? chatForeground(theme.isDark) : muted,
          fontSize: 14,
          lineHeight: 20,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
  return (
    <>
      {open ? (
        <Pressable
          onPress={() => setOpen(false)}
          style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0, zIndex: 1 }}
        />
      ) : null}
      <View
        style={{
          position: "absolute",
          right: EXECUTE_MENU_INSET,
          top: EXECUTE_MENU_INSET,
          zIndex: 2,
        }}
      >
        <Pressable
          accessibilityLabel={copy.terminalMore}
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => setOpen((current) => !current)}
          style={{
            alignItems: "center",
            borderRadius: EXECUTE_MENU_RADIUS,
            height: EXECUTE_MENU_BUTTON,
            justifyContent: "center",
            width: EXECUTE_MENU_BUTTON,
          }}
        >
          <MoreHorizontalIcon color={muted} size={EXECUTE_MENU_ICON} strokeWidth={2} />
        </Pressable>
        {open ? (
          <View
            style={{
              backgroundColor: theme.colors.cardElevated,
              borderColor: theme.colors.glassBorder,
              borderRadius: EXECUTE_MENU_RADIUS,
              borderWidth: 1,
              minWidth: EXECUTE_MENU_MIN_WIDTH,
              padding: 4,
              position: "absolute",
              right: 0,
              top: EXECUTE_MENU_BUTTON + 4,
            }}
          >
            {item(copy.copyCommand, command, command.length > 0)}
            {item(copy.copyResult, output, output.length > 0)}
          </View>
        ) : null}
      </View>
    </>
  );
}

function ExecuteTerminal({
  command,
  output,
  failed,
}: {
  command: string;
  output: string;
  failed: boolean;
}) {
  const theme = useMobileTheme();
  if (!command && !output) return null;
  const mono = { fontFamily: "Menlo", fontSize: 13, lineHeight: 20 } as const;
  return (
    <View>
      {command ? (
        <HeightClip maxHeight={TOOL_COMMAND_MAX_HEIGHT}>
          <Text
            selectable
            style={{
              ...mono,
              color: chatForeground(theme.isDark),
              paddingLeft: 12,
              paddingRight: EXECUTE_COMMAND_PAD_RIGHT,
              paddingTop: 10,
              paddingBottom: output ? 0 : 10,
            }}
          >
            <Text style={{ color: chatMutedForeground(theme.isDark) }}>$ </Text>
            {command}
          </Text>
        </HeightClip>
      ) : null}
      {output ? (
        <HeightClip maxHeight={TOOL_CODE_MAX_HEIGHT}>
          <Text
            selectable
            style={{
              ...mono,
              color: failed
                ? chatDestructiveColor(theme.isDark)
                : chatMutedForeground(theme.isDark),
              paddingHorizontal: 12,
              paddingTop: command ? 4 : 10,
              paddingBottom: 10,
            }}
          >
            {terminalAnsiPieces(output).map((piece, index) => (
              <Text key={`${index}:${piece.text}`} style={piece.style}>
                {piece.text}
              </Text>
            ))}
          </Text>
        </HeightClip>
      ) : null}
      <ExecuteCopyMenu command={command} output={output} />
    </View>
  );
}

function ToolPlainPreview({ text }: { text: string }) {
  const theme = useMobileTheme();
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  if (!text) return null;
  const lines = text.split("\n");
  const numbered = lines.length >= 2;
  const numberWidth = toolPlainLineNumberWidth(lines.length);
  const lineBox = {
    fontFamily: "Menlo",
    fontSize: TOOL_PLAIN_LINE_FONT,
    lineHeight: TOOL_PLAIN_LINE_HEIGHT,
  } as const;
  return (
    <View>
      <View
        onLayout={(event) => {
          if (!expanded && event.nativeEvent.layout.height >= TOOL_CODE_MAX_HEIGHT) {
            setOverflow(true);
          }
        }}
        style={expanded ? undefined : { maxHeight: TOOL_CODE_MAX_HEIGHT, overflow: "hidden" }}
      >
        <View style={{ paddingVertical: 12 }}>
          {lines.map((line, index) => (
            <View
              key={`${index}:${line}`}
              style={{
                alignItems: "flex-start",
                flexDirection: "row",
                paddingHorizontal: TOOL_PLAIN_LINE_PAD_X,
                paddingVertical: TOOL_PLAIN_LINE_PAD_Y,
              }}
            >
              {numbered ? (
                <Text
                  style={{
                    color: chatMutedForeground(theme.isDark),
                    fontFamily: "Menlo",
                    fontSize: TOOL_PLAIN_NUMBER_FONT,
                    lineHeight: TOOL_PLAIN_LINE_HEIGHT,
                    marginLeft: 4,
                    marginRight: 16,
                    minWidth: numberWidth,
                    textAlign: "right",
                  }}
                >
                  {index + 1}
                </Text>
              ) : null}
              <Text
                selectable
                style={{
                  ...lineBox,
                  color: chatForeground(theme.isDark),
                  flexShrink: 1,
                }}
              >
                {line.length > 0 ? line : " "}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {overflow ? (
        <CodeExpandButton
          expanded={expanded}
          onPress={() => setExpanded((current) => !current)}
          right={CODE_PREVIEW_EXPAND_RIGHT}
          top={CODE_PREVIEW_EXPAND_TOP}
        />
      ) : null}
    </View>
  );
}

function CappedMono({ text }: { text: string }) {
  const theme = useMobileTheme();
  const [expanded, setExpanded] = useState(false);
  const view = cappedToolText(text, expanded);
  if (!text) return null;
  return (
    <View style={{ gap: 4 }}>
      <Text
        selectable
        style={{
          color: chatMutedForeground(theme.isDark),
          fontFamily: "Menlo",
          fontSize: 14,
          lineHeight: 20,
        }}
      >
        {view.text}
      </Text>
      {view.overflow ? (
        <ShowMoreButton expanded={expanded} onPress={() => setExpanded((current) => !current)} />
      ) : null}
    </View>
  );
}

/**
 * Pierre's deletion indicator is a 4px bar of 1px bands. `linear-gradient(0deg)`
 * paints the deletion base at the top of each 2px tile, then the line fill.
 * An addition bar stays solid.
 */
function DiffDeletionBar({ band, ink }: { band: string; ink: string }) {
  const id = `diffDel${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <View
      pointerEvents="none"
      style={{
        bottom: 0,
        left: 0,
        overflow: "hidden",
        position: "absolute",
        top: 0,
        width: TOOL_DIFF_BAR,
      }}
    >
      <Svg height={TOOL_DIFF_MAX_HEIGHT} width={TOOL_DIFF_BAR}>
        <Defs>
          <Pattern height={2} id={id} patternUnits="userSpaceOnUse" width={TOOL_DIFF_BAR}>
            <Rect fill={ink} height={1} width={TOOL_DIFF_BAR} />
            <Rect fill={band} height={1} width={TOOL_DIFF_BAR} y={1} />
          </Pattern>
        </Defs>
        <Rect fill={`url(#${id})`} height={TOOL_DIFF_MAX_HEIGHT} width={TOOL_DIFF_BAR} />
      </Svg>
    </View>
  );
}

function DiscussionDiff({
  path,
  segments,
  fallback,
}: {
  path: string | null;
  segments: ToolDiffSegment[];
  fallback?: string;
}) {
  const theme = useMobileTheme();
  const [revealed, setRevealed] = useState<Record<number, ToolDiffReveal>>({});
  const rows = toolDiffVisibleRows(segments, revealed);
  const lines = rows.flatMap((row) => (row.kind === "line" ? [row.line] : []));
  const wordPieces = toolDiffLineWordPieces(lines);
  const numberWidth = toolDiffNumberColumnWidth(toolDiffLastNumber(lines));
  const borderColor = theme.isDark ? TOOL_DIFF_BORDER_DARK : TOOL_DIFF_BORDER_LIGHT;
  const numberInk = (op: UnifiedDiffLine["op"]) => {
    if (op === "add") return theme.isDark ? TOOL_DIFF_NUMBER_ADD_DARK : TOOL_DIFF_NUMBER_ADD_LIGHT;
    if (op === "del") return theme.isDark ? TOOL_DIFF_NUMBER_DEL_DARK : TOOL_DIFF_NUMBER_DEL_LIGHT;
    return toolDiffContextNumber(theme.isDark);
  };
  return (
    <View
      style={{
        borderRadius: TOOL_DIFF_RADIUS,
        elevation: 1,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      }}
    >
      <View
        style={{
          borderColor,
          borderRadius: TOOL_DIFF_RADIUS,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        {path ? (
          <View
            style={{
              alignItems: "center",
              backgroundColor: theme.isDark ? TOOL_DIFF_HEADER_DARK : TOOL_DIFF_HEADER_LIGHT,
              borderBottomColor: theme.isDark
                ? TOOL_DIFF_HEADER_RULE_DARK
                : TOOL_DIFF_HEADER_RULE_LIGHT,
              borderBottomWidth: 1,
              flexDirection: "row",
              gap: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <FileTextIcon color={theme.colors.secondaryLabel} size={16} strokeWidth={2} />
            <Text
              numberOfLines={1}
              style={{
                color: chatForeground80(theme.isDark),
                flexShrink: 1,
                fontFamily: "Menlo",
                fontSize: 12,
                lineHeight: 16,
              }}
            >
              {path}
            </Text>
          </View>
        ) : null}
        {rows.length > 0 ? (
          <HeightClip maxHeight={TOOL_DIFF_MAX_HEIGHT}>
            {(() => {
              let lineIndex = 0;
              return rows.map((row, index) => {
                if (row.kind === "gap") {
                  return (
                    <Pressable
                      key={`gap:${row.segment}:${index}`}
                      accessibilityRole="button"
                      onPress={() => {
                        setRevealed((current) => ({
                          ...current,
                          [row.segment]: toolDiffRevealMore(current[row.segment], row.edge),
                        }));
                      }}
                      style={{
                        backgroundColor: theme.colors.background,
                        height: TOOL_DIFF_SEPARATOR_HEIGHT,
                        justifyContent: "center",
                        paddingHorizontal: TOOL_DIFF_SEPARATOR_INSET,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: toolDiffSeparatorFill(theme.isDark),
                          borderRadius: TOOL_DIFF_SEPARATOR_RADIUS,
                          flex: 1,
                          justifyContent: "center",
                          paddingHorizontal: TOOL_DIFF_SEPARATOR_INSET,
                        }}
                      >
                        <Text
                          numberOfLines={1}
                          style={{
                            color: toolDiffContextNumber(theme.isDark),
                            fontSize: TOOL_DIFF_CODE_FONT,
                            lineHeight: TOOL_DIFF_LINE_HEIGHT,
                          }}
                        >
                          {toolDiffUnmodifiedLabel(row.count)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                }
                const line = row.line;
                const changed = line.op === "add" || line.op === "del";
                const pieces = wordPieces[lineIndex];
                lineIndex += 1;
                const wordFill =
                  line.op === "add" || line.op === "del"
                    ? toolDiffWordFill(line.op, theme.isDark)
                    : undefined;
                return (
                  <View
                    key={`${line.op}:${line.oldNo ?? ""}:${line.newNo ?? ""}:${index}`}
                    style={{ flexDirection: "row" }}
                  >
                    {line.op === "add" ? (
                      <View
                        pointerEvents="none"
                        style={{
                          backgroundColor: numberInk("add"),
                          bottom: 0,
                          left: 0,
                          position: "absolute",
                          top: 0,
                          width: TOOL_DIFF_BAR,
                        }}
                      />
                    ) : null}
                    {line.op === "del" ? (
                      <DiffDeletionBar
                        band={toolDiffLineFill("del", theme.isDark)}
                        ink={numberInk("del")}
                      />
                    ) : null}
                    <Text
                      style={{
                        backgroundColor: changed
                          ? toolDiffNumberFill(line.op, theme.isDark)
                          : undefined,
                        color: numberInk(line.op),
                        flexShrink: 0,
                        fontFamily: "Menlo",
                        fontSize: TOOL_DIFF_CODE_FONT,
                        lineHeight: TOOL_DIFF_LINE_HEIGHT,
                        minWidth: numberWidth,
                        paddingLeft: TOOL_DIFF_NUMBER_PAD_LEFT,
                        paddingRight: TOOL_DIFF_NUMBER_PAD_RIGHT,
                        textAlign: "right",
                      }}
                    >
                      {toolDiffUnifiedLineNo(line) ?? ""}
                    </Text>
                    <View
                      style={{
                        backgroundColor: theme.colors.background,
                        flexShrink: 0,
                        width: TOOL_DIFF_GUTTER_RULE,
                      }}
                    />
                    <View
                      style={{
                        backgroundColor: changed
                          ? toolDiffLineFill(line.op, theme.isDark)
                          : undefined,
                        flex: 1,
                      }}
                    >
                      <Text
                        selectable
                        style={{
                          color: chatForeground(theme.isDark),
                          fontFamily: "Menlo",
                          fontSize: TOOL_DIFF_CODE_FONT,
                          lineHeight: TOOL_DIFF_LINE_HEIGHT,
                          paddingHorizontal: TOOL_DIFF_CODE_PAD,
                        }}
                      >
                        {pieces && pieces.length > 0
                          ? pieces.map((piece, pieceIndex) => (
                              <Text
                                key={pieceIndex}
                                style={piece.changed ? { backgroundColor: wordFill } : undefined}
                              >
                                {piece.text}
                              </Text>
                            ))
                          : line.text.length > 0
                            ? line.text
                            : " "}
                      </Text>
                    </View>
                  </View>
                );
              });
            })()}
          </HeightClip>
        ) : fallback ? (
          <CappedMono text={fallback} />
        ) : null}
      </View>
    </View>
  );
}

function fetchRowUrl(part: AgentToolCallPart): string {
  if (part.result?.type === "web_fetch") return part.result.url;
  if (part.params?.type === "fetch") return part.params.url;
  return "";
}

function SearchHitsBody({ model }: { model: Extract<ToolBodyModel, { kind: "search" }> }) {
  const theme = useMobileTheme();
  const line = { fontFamily: "Menlo", fontSize: 12, lineHeight: 16 } as const;
  const commandOnly = model.groups.length === 0 && !model.summary;
  return (
    <View>
      {model.script ? (
        <Text
          style={{
            color: chatForeground(theme.isDark),
            fontFamily: "Menlo",
            fontSize: 13,
            lineHeight: 20,
            paddingBottom: commandOnly ? 10 : 0,
            paddingHorizontal: 12,
            paddingTop: 10,
          }}
        >
          <Text style={{ color: chatMutedForeground(theme.isDark) }}>$ </Text>
          {model.script}
        </Text>
      ) : null}
      {model.groups.length > 0 ? (
        <HeightClip maxHeight={TOOL_FILE_LIST_MAX_HEIGHT}>
          <View style={{ paddingVertical: 4 }}>
            {model.groups.map((group) => (
              <View key={group.path} style={{ gap: 2, paddingHorizontal: 12, paddingVertical: 6 }}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
                  <PathGlyph isDir={pathLooksLikeDirectory(group.path)} />
                  <Text
                    numberOfLines={1}
                    style={{
                      ...LISTED_PATH_TEXT,
                      color: chatForeground80(theme.isDark),
                      flexShrink: 1,
                    }}
                  >
                    {group.shown}
                  </Text>
                </View>
                {group.hits.map((hit, index) => (
                  <View
                    key={`${group.path}:${hit.line ?? 0}:${index}`}
                    style={{ flexDirection: "row", gap: 8, paddingLeft: 24 }}
                  >
                    {hit.line != null ? (
                      <Text
                        style={{
                          ...line,
                          color: chatMutedForeground(theme.isDark),
                          textAlign: "right",
                          width: 40,
                        }}
                      >
                        {hit.line}
                      </Text>
                    ) : null}
                    {hit.text ? (
                      <Text
                        style={{ ...line, color: chatMutedForeground(theme.isDark), flexShrink: 1 }}
                      >
                        {hit.text}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </HeightClip>
      ) : null}
      {model.groups.length === 0 && model.summary ? (
        toolTextUsesPreview(model.summary) ? (
          <ToolPlainPreview text={model.summary} />
        ) : (
          <Text
            selectable
            style={{
              color: chatMutedForeground(theme.isDark),
              fontSize: 14,
              lineHeight: TOOL_PROSE_LINE_HEIGHT,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            {model.summary}
          </Text>
        )
      ) : null}
    </View>
  );
}

function PathGlyph({ isDir }: { isDir: boolean }) {
  const theme = useMobileTheme();
  const Icon = isDir ? FolderIcon : FileTextIcon;
  return <Icon color={theme.colors.secondaryLabel} size={16} strokeWidth={2} />;
}

const LISTED_PATH_TEXT = {
  fontFamily: "Menlo",
  fontSize: 12,
  lineHeight: 16,
} as const;

function FileListBody({ paths, shown }: { paths: string[]; shown: string[] }) {
  const theme = useMobileTheme();
  if (paths.length === 0) return null;
  return (
    <HeightClip maxHeight={TOOL_FILE_LIST_MAX_HEIGHT}>
      <View style={{ paddingVertical: 4 }}>
        {paths.map((path, index) => (
          <View
            key={`${path}:${index}`}
            style={{
              alignItems: "center",
              flexDirection: "row",
              gap: 8,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <PathGlyph isDir={pathLooksLikeDirectory(path)} />
            <Text
              numberOfLines={1}
              style={{
                ...LISTED_PATH_TEXT,
                color: chatForeground80(theme.isDark),
                flexShrink: 1,
              }}
            >
              {shown[index] || path}
            </Text>
          </View>
        ))}
      </View>
    </HeightClip>
  );
}

function TreeListBody({ rows }: { rows: ToolTreeRow[] }) {
  const theme = useMobileTheme();
  if (rows.length === 0) return null;
  return (
    <HeightClip maxHeight={TOOL_CODE_MAX_HEIGHT}>
      <View style={{ paddingVertical: 4 }}>
        {rows.map((row, index) => (
          <View
            key={`${row.indent}:${row.name}:${index}`}
            style={{
              alignItems: "center",
              flexDirection: "row",
              gap: 8,
              paddingLeft: 12 + row.indent * 8,
              paddingRight: 12,
              paddingVertical: 2,
            }}
          >
            {row.note ? (
              <Text
                numberOfLines={1}
                style={{
                  ...LISTED_PATH_TEXT,
                  color: chatMutedForeground(theme.isDark),
                  flexShrink: 1,
                }}
              >
                {row.name}
              </Text>
            ) : (
              <>
                <PathGlyph isDir={row.isDir || pathLooksLikeDirectory(row.path)} />
                <Text
                  numberOfLines={1}
                  style={{
                    ...LISTED_PATH_TEXT,
                    color: chatForeground80(theme.isDark),
                    flexShrink: 1,
                  }}
                >
                  {row.name}
                </Text>
              </>
            )}
          </View>
        ))}
      </View>
    </HeightClip>
  );
}

function TodoStatusRows({ items }: { items: Array<{ content: string; status: TodoStatusKind }> }) {
  const theme = useMobileTheme();
  return (
    <View style={{ gap: 4, paddingHorizontal: 12, paddingVertical: 8 }}>
      {items.map((item, index) => {
        const completed = item.status === "completed";
        const Icon =
          item.status === "completed"
            ? CheckCircleIcon
            : item.status === "in_progress"
              ? CircleDashedIcon
              : CircleIcon;
        return (
          <View
            key={`${item.content}:${index}`}
            style={{ alignItems: "flex-start", flexDirection: "row", gap: 8 }}
          >
            <View accessibilityLabel={todoStatusLabel(item.status)} style={{ marginTop: 2 }}>
              <Icon
                color={completed ? TOOL_ADDITION_COLOR : chatMutedForeground(theme.isDark)}
                size={14}
                strokeWidth={2}
              />
            </View>
            <Text
              style={{
                ...BODY_TEXT,
                color: completed ? chatMutedForeground(theme.isDark) : chatForeground(theme.isDark),
                flexShrink: 1,
                textDecorationLine: completed ? "line-through" : "none",
              }}
            >
              {item.content}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ImageGenMark({ status }: { status: ImageGenStatus }) {
  const theme = useMobileTheme();
  const reduced = useReducedMotion();
  const [spin] = useState(() => new Animated.Value(0));
  const active = status === "queued" || status === "generating" || status === "refining";
  useEffect(() => {
    if (reduced || !active) return;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 2400, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduced, spin]);
  if (status === "complete") {
    return <CheckIcon color={chatForeground(theme.isDark)} size={14} strokeWidth={2} />;
  }
  if (status === "error") {
    return <CircleAlertIcon color={chatDestructiveColor(theme.isDark)} size={14} strokeWidth={2} />;
  }
  const dots = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2, height: 14, width: 14 }}>
      {[1, 0.55, 0.55, 1].map((opacity, index) => (
        <View
          key={index}
          style={{
            backgroundColor: chatForeground(theme.isDark),
            borderRadius: 1,
            height: 4,
            opacity,
            width: 4,
          }}
        />
      ))}
    </View>
  );
  if (reduced) return dots;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return <Animated.View style={{ transform: [{ rotate }] }}>{dots}</Animated.View>;
}

function ImageGenPreview({ uri, aspect }: { uri: string; aspect: number }) {
  const [ratio, setRatio] = useState(aspect);
  return (
    <Image
      accessibilityIgnoresInvertColors
      alt=""
      onLoad={(event) => {
        const width = event.nativeEvent.source?.width;
        const height = event.nativeEvent.source?.height;
        if (width > 0 && height > 0) setRatio(width / height);
      }}
      resizeMode="contain"
      source={{ uri }}
      style={{ aspectRatio: ratio, borderRadius: IMAGE_GEN_RADIUS, width: "100%" }}
    />
  );
}

function ImageGenBody({ model }: { model: Extract<ToolBodyModel, { kind: "image_gen" }> }) {
  const theme = useMobileTheme();
  const showStatus = model.items.length === 0 || model.status !== "complete";
  const statusText = IMAGE_GEN_STATUS_TEXT[model.status];
  const label = model.prompt ? `${statusText}: ${model.prompt}` : statusText;
  const active =
    model.status === "queued" || model.status === "generating" || model.status === "refining";
  return (
    <View style={{ paddingBottom: 8, paddingHorizontal: 8 }}>
      <View accessibilityState={{ busy: active }} style={{ gap: 12, maxWidth: 208, width: "100%" }}>
        {model.items.length === 0 ? (
          <View
            accessibilityLabel={label}
            accessibilityRole="image"
            style={{
              aspectRatio: model.aspect,
              backgroundColor: theme.isDark ? TOOL_FILE_CHIP_DARK : TOOL_FILE_CHIP_LIGHT,
              borderRadius: IMAGE_GEN_RADIUS,
              width: "100%",
            }}
          />
        ) : (
          <View style={{ gap: 12 }}>
            {model.items.map((item, index) =>
              "uri" in item ? (
                <ImageGenPreview
                  key={`${item.uri}:${index}`}
                  aspect={model.aspect}
                  uri={item.uri}
                />
              ) : (
                <PathChip key={`${item.path}:${index}`} path={item.path} />
              ),
            )}
          </View>
        )}
        {showStatus || model.prompt ? (
          <View style={{ gap: 2 }}>
            {showStatus ? (
              <View
                accessibilityLiveRegion="polite"
                style={{ alignItems: "center", flexDirection: "row", gap: 8, minHeight: 20 }}
              >
                <ImageGenMark status={model.status} />
                <Text
                  style={{
                    color:
                      model.status === "error"
                        ? chatDestructiveColor(theme.isDark)
                        : chatForeground(theme.isDark),
                    flexShrink: 1,
                    fontSize: 14,
                    fontWeight: "500",
                    lineHeight: 20,
                  }}
                >
                  {statusText}
                </Text>
              </View>
            ) : null}
            {model.prompt ? (
              <Text
                numberOfLines={1}
                style={{ color: chatMutedForeground(theme.isDark), fontSize: 12, lineHeight: 16 }}
              >
                {`“${model.prompt}”`}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function PlanDocumentBody({
  model,
  pane,
}: {
  model: Extract<ToolBodyModel, { kind: "plan_document" }>;
  pane: "body" | "todos";
}) {
  const theme = useMobileTheme();
  const hasBody = model.plan.length > 0;
  const hasTodos = model.todos.length > 0;
  const showing: "body" | "todos" = hasBody && hasTodos ? pane : hasBody ? "body" : "todos";
  return (
    <View>
      {model.overview ? (
        <Text
          style={{
            color: chatMutedForeground(theme.isDark),
            fontSize: 12,
            lineHeight: 16,
            paddingHorizontal: 12,
            paddingTop: 8,
          }}
        >
          {model.overview}
        </Text>
      ) : null}
      {showing === "body" && hasBody ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
          <AgentChatMarkdown
            fontSize={13}
            lineHeight={TOOL_MARKDOWN_LINE_HEIGHT}
            prose="plan"
            text={model.plan}
          />
        </View>
      ) : null}
      {showing === "todos" && hasTodos ? <TodoStatusRows items={model.todos} /> : null}
      {!hasBody && !hasTodos ? (
        <Text
          style={{
            color: chatMutedForeground(theme.isDark),
            fontSize: 12,
            lineHeight: 16,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          {copy.noOutput}
        </Text>
      ) : null}
    </View>
  );
}

function ToolBodyView({
  model,
  planPane,
}: {
  model: Exclude<ToolBodyModel, { kind: "subagent" }>;
  planPane: "body" | "todos";
}) {
  const theme = useMobileTheme();
  const movePathStyle = {
    color: chatForeground80(theme.isDark),
    flexShrink: 1,
    fontFamily: "Menlo",
    fontSize: 12,
    lineHeight: 16,
  } as const;
  switch (model.kind) {
    case "diff":
      return (
        <View style={{ gap: 8 }}>
          {model.files.map((file, index) => (
            <DiscussionDiff
              key={`${file.path}:${index}`}
              path={file.path}
              segments={file.segments}
            />
          ))}
        </View>
      );
    case "diff_stats":
      return (
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            gap: 8,
            paddingHorizontal: 4,
            paddingVertical: 4,
          }}
        >
          <Text style={{ color: chatMutedForeground(theme.isDark), fontSize: 12, lineHeight: 16 }}>
            {copy.lineChanges}
          </Text>
          <ToolDiffStats additions={model.additions} deletions={model.deletions} />
        </View>
      );
    case "patch":
      return (
        <DiscussionDiff
          fallback={model.text}
          path={model.path}
          segments={toolDiffSegmentsFromPatch(model.text)}
        />
      );
    case "code":
      return (
        <ToolCodeFence language={model.language} lineStart={model.lineStart} text={model.text} />
      );
    case "web_search":
      return <WebSearchSources links={model.links} />;
    case "web_fetch":
      if (!model.body) return null;
      if (model.format === "markdown") {
        return (
          <HeightClip maxHeight={TOOL_CODE_MAX_HEIGHT}>
            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <AgentChatMarkdown
                fontSize={13}
                lineHeight={TOOL_MARKDOWN_LINE_HEIGHT}
                prose="tool"
                text={model.body}
              />
            </View>
          </HeightClip>
        );
      }
      if (model.format === "text" && toolTextUsesPreview(model.body)) {
        return <ToolPlainPreview text={model.body} />;
      }
      return (
        <Text
          selectable
          style={{
            color:
              model.format === "error"
                ? chatDestructiveColor(theme.isDark)
                : chatMutedForeground(theme.isDark),
            ...(model.format === "error"
              ? BODY_TEXT
              : { fontSize: 14, lineHeight: TOOL_PROSE_LINE_HEIGHT }),
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          {model.body}
        </Text>
      );
    case "search":
      return <SearchHitsBody model={model} />;
    case "files":
      return <FileListBody paths={model.paths} shown={model.shown} />;
    case "tree":
      return <TreeListBody rows={model.rows} />;
    case "markdown":
      return (
        <HeightClip maxHeight={TOOL_CODE_MAX_HEIGHT}>
          <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
            <AgentChatMarkdown
              fontSize={13}
              lineHeight={TOOL_MARKDOWN_LINE_HEIGHT}
              prose="tool"
              text={model.markdown}
            />
          </View>
        </HeightClip>
      );
    case "todos":
      return <TodoStatusRows items={model.items} />;
    case "plan_document":
      return <PlanDocumentBody model={model} pane={planPane} />;
    case "image_gen":
      return <ImageGenBody model={model} />;
    case "preview":
      return <ToolPlainPreview text={model.text} />;
    case "prose":
      if (!model.text) return null;
      return (
        <Text
          selectable
          style={{
            color: chatMutedForeground(theme.isDark),
            fontSize: 14,
            lineHeight: TOOL_PROSE_LINE_HEIGHT,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          {model.text}
        </Text>
      );
    case "execute":
      return (
        <ExecuteTerminal command={model.command} failed={model.failed} output={model.output} />
      );
    case "move":
      return (
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text numberOfLines={1} style={movePathStyle}>
            {model.from}
          </Text>
          <View accessibilityLabel={copy.moveTo}>
            <ArrowRightIcon
              color={chatMutedForeground(theme.isDark)}
              size={toolTriggerMetrics.iconSize}
              strokeWidth={2}
            />
          </View>
          <Text numberOfLines={1} style={movePathStyle}>
            {model.to}
          </Text>
        </View>
      );
    case "delete":
      return (
        <Text
          style={{
            ...BODY_TEXT,
            color: chatMutedForeground(theme.isDark),
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          {deletedFileLabel(model.path)}
        </Text>
      );
    case "error":
      return (
        <Text
          selectable
          style={{
            ...BODY_TEXT,
            color: chatDestructiveColor(theme.isDark),
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          {model.text}
        </Text>
      );
    case "empty":
      if (!model.path && !model.message) return null;
      return (
        <View style={{ gap: 8 }}>
          {model.path ? <PathChip path={model.path} /> : null}
          {model.message ? (
            <Text
              style={{
                color: chatMutedForeground(theme.isDark),
                fontSize: 12,
                lineHeight: 16,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              {model.message}
            </Text>
          ) : null}
        </View>
      );
    case "images":
      return (
        <View style={{ gap: 8 }}>
          {model.items.map((item, index) =>
            "uri" in item ? (
              <Image
                key={`${item.uri}:${index}`}
                accessibilityIgnoresInvertColors
                alt=""
                resizeMode="contain"
                source={{ uri: item.uri }}
                style={{ borderRadius: 8, height: 180, width: "100%" }}
              />
            ) : (
              <PathChip key={`${item.path}:${index}`} path={item.path} />
            ),
          )}
        </View>
      );
    default: {
      const unreachable: never = model;
      return unreachable;
    }
  }
}

function SubagentCard({ status, title }: { status: string; title: string }) {
  const theme = useMobileTheme();
  const failed = status === copy.subagentStatus.failed;
  const running = status === copy.subagentStatus.running;
  const muted = chatMutedForeground(theme.isDark);
  const color = failed ? chatDestructiveColor(theme.isDark) : muted;
  const metrics = toolTriggerMetrics;
  const titleStyle = {
    color,
    flexShrink: 1,
    fontSize: metrics.fontSize,
    lineHeight: metrics.lineHeight,
  };
  return (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: metrics.gap,
        paddingVertical: metrics.padY,
      }}
    >
      <View
        style={{
          alignItems: "center",
          height: metrics.iconBox,
          justifyContent: "center",
          width: metrics.iconBox,
        }}
      >
        <ToolKindIcon color={muted} kind="subagent" size={metrics.iconSize} />
      </View>
      {running ? (
        <TextShimmer duration={1} numberOfLines={1} style={titleStyle}>
          {title}
        </TextShimmer>
      ) : (
        <Text numberOfLines={1} style={titleStyle}>
          {title}
        </Text>
      )}
    </View>
  );
}

function ToolFileChip({ fileName, lineRange }: { fileName: string; lineRange: string | null }) {
  const theme = useMobileTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.isDark ? TOOL_FILE_CHIP_DARK : TOOL_FILE_CHIP_LIGHT,
        borderRadius: TOOL_FILE_CHIP_RADIUS,
        flexDirection: "row",
        flexShrink: 1,
        gap: 4,
        maxWidth: "46%",
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <FileTextIcon color={chatForeground(theme.isDark)} size={14} strokeWidth={2} />
      <Text
        numberOfLines={1}
        style={{ ...CHIP_TEXT, color: chatForeground(theme.isDark), flexShrink: 1 }}
      >
        {fileName}
      </Text>
      {lineRange ? (
        <Text style={{ ...CHIP_TEXT, color: chatMutedForeground(theme.isDark) }}>{lineRange}</Text>
      ) : null}
    </View>
  );
}

export function ToolCallRow({ part }: { part: AgentToolCallPart }) {
  const theme = useMobileTheme();
  const model = toolBodyModel(part);
  const chrome = toolRowChrome(part, presentAgentTool(part));
  const imageActive = model.kind === "image_gen" && imageGenStaysOpen(part.status);
  const planTodoCount = model.kind === "plan_document" ? model.todos.length : 0;
  const planCanSwitch =
    model.kind === "plan_document" && model.plan.length > 0 && planTodoCount > 0;
  const [planPane, setPlanPane] = useState<"body" | "todos">("body");
  const [open, setOpen] = useAgentChatExpand(
    agentChatToolExpandKey(part.tool_call_id),
    (model.kind === "plan_document" && planDocumentStartsOpen(model)) || imageActive,
  );
  useEffect(() => {
    if (imageActive) setOpen(true);
  }, [imageActive, setOpen]);
  if (model.kind === "subagent") {
    return <SubagentCard status={model.status} title={model.title} />;
  }
  const executeFailed = part.kind === "execute" && executeTerminalFields(part).failed;
  const failed = model.kind === "error" || executeFailed || part.status === "failed";
  const running = isActiveToolStatus(part.status);
  const failedColor = chatDestructiveColor(theme.isDark);
  const muted = chatMutedForeground(theme.isDark);
  const titleColor = failed ? failedColor : muted;
  const metrics = toolTriggerMetrics;
  const stats = toolRowDiffStats(model);
  const codeMeta = model.kind === "code" ? codePreviewMeta(model.hint) : null;
  const resultMeta =
    model.kind === "web_search"
      ? webSearchResultMeta(model.links.length)
      : model.kind === "search"
        ? searchMatchLabel(model.matchCount)
        : null;
  const titleStyle = {
    color: titleColor,
    flexShrink: 1,
    fontSize: metrics.fontSize,
    lineHeight: metrics.lineHeight,
  };
  const toggleOpen = () => {
    if (imageActive && open) return;
    setOpen(!open);
  };
  return (
    <View style={{ paddingVertical: metrics.padY }}>
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: planCanSwitch ? 4 : 0,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={toggleOpen}
          style={{
            alignItems: "center",
            flexDirection: "row",
            flexShrink: 1,
            gap: metrics.gap,
            ...(planCanSwitch ? null : { flex: 1 }),
          }}
        >
          <View
            style={{
              alignItems: "center",
              height: metrics.iconBox,
              justifyContent: "center",
              width: metrics.iconBox,
            }}
          >
            {part.kind === "plan_document" ? (
              <ScrollTextIcon color={muted} size={metrics.iconSize} strokeWidth={2} />
            ) : part.kind === "fetch" ? (
              <HttpFavicon url={fetchRowUrl(part)} size={metrics.iconBox} radius={3} />
            ) : (
              <ToolKindIcon color={muted} kind={part.kind} size={metrics.iconSize} />
            )}
          </View>
          {running ? (
            <TextShimmer duration={1} numberOfLines={1} style={titleStyle}>
              {chrome.title}
            </TextShimmer>
          ) : (
            <Text numberOfLines={1} style={titleStyle}>
              {chrome.title}
            </Text>
          )}
          {chrome.fileName ? (
            <ToolFileChip fileName={chrome.fileName} lineRange={chrome.lineRange} />
          ) : null}
          {codeMeta ? (
            <Text style={{ color: muted, fontSize: 11, lineHeight: 16 }}>{codeMeta}</Text>
          ) : null}
          <ToolDiffStats additions={stats.additions} deletions={stats.deletions} />
          {resultMeta ? (
            <Text style={{ color: muted, fontSize: 11, lineHeight: 16 }}>{resultMeta}</Text>
          ) : null}
          {failed ? (
            <XCircleIcon color={failedColor} size={metrics.iconSize} strokeWidth={2} />
          ) : null}
          <ExpandChevron color={muted} open={open} size={metrics.chevron} />
        </Pressable>
        {planCanSwitch ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setPlanPane((current) => (current === "body" ? "todos" : "body"))}
            style={{
              alignItems: "center",
              borderRadius: 8,
              flexDirection: "row",
              flexShrink: 0,
              gap: 4,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          >
            {planPane === "body" ? (
              <ListTodoIcon color={muted} size={12} strokeWidth={2} />
            ) : (
              <ScrollTextIcon color={muted} size={12} strokeWidth={2} />
            )}
            <Text style={{ color: muted, fontSize: 11, lineHeight: 16 }}>
              {planPaneSwitchLabel(planPane, planTodoCount)}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <View
          style={
            toolBodyUsesPanel(model, part.kind)
              ? {
                  backgroundColor: theme.isDark ? TOOL_PANEL_DARK : TOOL_PANEL_LIGHT,
                  borderRadius: TOOL_PANEL_RADIUS,
                  marginTop: metrics.bodyPadTop,
                  overflow: "hidden",
                }
              : { paddingTop: metrics.bodyPadTop }
          }
        >
          <ToolBodyView model={model} planPane={planPane} />
        </View>
      ) : null}
    </View>
  );
}
