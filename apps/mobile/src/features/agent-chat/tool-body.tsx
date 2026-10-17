import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  formatSearchScript,
  formatToolLineRange,
  hostFromUrl,
  isActiveToolStatus,
  isNestedSubagentChild,
  matchCountFromSearchSummary,
  preferredCollapsedToolTitle,
  presentAgentTool,
  relativeDisplayPath,
  resolveAgentToolCardHeading,
  resolveTreeEntryPaths,
  toolKindHeadlineLabel,
  type AgentToolCallPart,
  type ParsedToolResult,
  type ToolPresentation,
} from "@atmos/agent-transcript";
import { copy, fillTemplate, formatCountChoice } from "./copy";

export const TOOL_BODY_LINE_CAP = 12;
const DIFF_LINE_LIMIT = 120;

export type UnifiedDiffLine = { op: "add" | "del" | "ctx"; text: string };

export type ImageGenStatus = "queued" | "generating" | "refining" | "complete" | "error";

export type ToolBodyModel =
  | {
      kind: "diff";
      title: string;
      files: Array<{
        path: string;
        additions: number;
        deletions: number;
        lines: UnifiedDiffLine[];
      }>;
    }
  | { kind: "diff_stats"; title: string; path: string | null; additions: number; deletions: number }
  | { kind: "patch"; title: string; path: string | null; text: string }
  | { kind: "code"; title: string; path: string | null; text: string }
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
  | { kind: "files"; title: string; paths: string[] }
  | { kind: "tree"; title: string; paths: string[] }
  | { kind: "markdown"; title: string; markdown: string }
  | {
      kind: "todos";
      title: string;
      items: Array<{ content: string; status: TodoStatusKind }>;
    }
  | { kind: "mono"; title: string; text: string }
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
  const kindLabel = toolKindHeadlineLabel(part.kind);
  const skillName = skillNameFromPart(part);
  const created = parsed.presentation.kind === "code" && parsed.presentation.hint === "new";
  const title = created
    ? "Created"
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

export function subagentStatusText(status: string | null | undefined): string {
  const value = (status ?? "").trim().toLowerCase();
  if (value === "failed" || value === "error") return copy.subagentStatus.failed;
  if (isActiveToolStatus(status)) return copy.subagentStatus.running;
  return copy.subagentStatus.completed;
}

/** Timeline rows skip nested children. The wait section is their only row. */
export function showToolRow(part: AgentPart, surface: "timeline" | "wait"): boolean {
  if (part.type !== "tool_call") return true;
  if (surface === "wait") return true;
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
): { lines: UnifiedDiffLine[]; additions: number; deletions: number; clipped: boolean } {
  const oldLines = splitToolLines(oldContent);
  const newLines = splitToolLines(newContent);
  const clipped = oldLines.length > DIFF_LINE_LIMIT || newLines.length > DIFF_LINE_LIMIT;
  const lines = diffLines(oldLines.slice(0, DIFF_LINE_LIMIT), newLines.slice(0, DIFF_LINE_LIMIT));
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.op === "add") additions += 1;
    else if (line.op === "del") deletions += 1;
  }
  return { lines, additions, deletions, clipped };
}

function diffLines(oldLines: string[], newLines: string[]): UnifiedDiffLine[] {
  const rowCount = oldLines.length + 1;
  const columnCount = newLines.length + 1;
  const scores: number[][] = Array.from({ length: rowCount }, () =>
    new Array<number>(columnCount).fill(0),
  );
  for (let row = oldLines.length - 1; row >= 0; row -= 1) {
    for (let column = newLines.length - 1; column >= 0; column -= 1) {
      scores[row]![column] =
        oldLines[row] === newLines[column]
          ? scores[row + 1]![column + 1]! + 1
          : Math.max(scores[row + 1]![column]!, scores[row]![column + 1]!);
    }
  }
  const lines: UnifiedDiffLine[] = [];
  let row = 0;
  let column = 0;
  while (row < oldLines.length && column < newLines.length) {
    if (oldLines[row] === newLines[column]) {
      lines.push({ op: "ctx", text: oldLines[row]! });
      row += 1;
      column += 1;
    } else if (scores[row + 1]![column]! >= scores[row]![column + 1]!) {
      lines.push({ op: "del", text: oldLines[row]! });
      row += 1;
    } else {
      lines.push({ op: "add", text: newLines[column]! });
      column += 1;
    }
  }
  while (row < oldLines.length) {
    lines.push({ op: "del", text: oldLines[row]! });
    row += 1;
  }
  while (column < newLines.length) {
    lines.push({ op: "add", text: newLines[column]! });
    column += 1;
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
      return { kind: "code", path: presentation.path, text: presentation.code };
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
      return { kind: "files", paths: presentation.paths };
    case "tree":
      return { kind: "tree", paths: resolveTreeEntryPaths(presentation.entries) };
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
      return { kind: "mono", text: presentation.json };
    case "text":
      return { kind: "mono", text: presentation.text };
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
    return { kind: "subagent", title, status: subagentStatusText(part.status) };
  }
  const plan = planDocumentFields(part);
  if (plan) return plan;
  const image = imageGenFields(part);
  if (image) return image;
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
  return { additions: 0, deletions: 0 };
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

// @view

import { useEffect, useState } from "react";
import { Animated, Image, Pressable, Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  CircleIcon,
  FileTextIcon,
  ListTodoIcon,
  ScrollTextIcon,
  XCircleIcon,
} from "@/ui/icons/lucide-native";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
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
      <Text numberOfLines={1} style={{ ...CHIP_TEXT, color: theme.colors.label }}>
        {path}
      </Text>
    </View>
  );
}

function PathChips({ paths }: { paths: string[] }) {
  if (paths.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
      {paths.map((path, index) => (
        <PathChip key={`${path}:${index}`} path={path} />
      ))}
    </View>
  );
}

export function ToolDiffStats({ additions, deletions }: { additions: number; deletions: number }) {
  const theme = useMobileTheme();
  if (additions <= 0 && deletions <= 0) return null;
  return (
    <Text style={{ fontFamily: "Menlo", fontSize: 12, lineHeight: 16 }}>
      {deletions > 0 ? <Text style={{ color: theme.colors.red }}>-{deletions}</Text> : null}
      {deletions > 0 && additions > 0 ? (
        <Text style={{ color: theme.colors.secondaryLabel }}> / </Text>
      ) : null}
      {additions > 0 ? <Text style={{ color: theme.colors.green }}>+{additions}</Text> : null}
    </Text>
  );
}

function DiffCounts({ additions, deletions }: { additions: number; deletions: number }) {
  const theme = useMobileTheme();
  return (
    <Text style={{ fontFamily: "Menlo", fontSize: 12, lineHeight: 16 }}>
      <Text style={{ color: theme.colors.green }}>+{additions}</Text>
      <Text style={{ color: theme.colors.secondaryLabel }}> </Text>
      <Text style={{ color: theme.colors.red }}>-{deletions}</Text>
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
          color: theme.colors.label,
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

function DiffLines({ lines }: { lines: UnifiedDiffLine[] }) {
  const theme = useMobileTheme();
  const [expanded, setExpanded] = useState(false);
  const shown =
    expanded || lines.length <= TOOL_BODY_LINE_CAP ? lines : lines.slice(0, TOOL_BODY_LINE_CAP);
  if (lines.length === 0) return null;
  return (
    <View style={{ gap: 4 }}>
      {shown.map((line, index) => {
        const color =
          line.op === "add"
            ? theme.colors.green
            : line.op === "del"
              ? theme.colors.red
              : theme.colors.label;
        const prefix = line.op === "add" ? "+" : line.op === "del" ? "-" : " ";
        return (
          <Text
            key={`${line.op}:${index}`}
            selectable
            style={{ color, fontFamily: "Menlo", fontSize: 14, lineHeight: 20 }}
          >
            {prefix}
            {line.text}
          </Text>
        );
      })}
      {lines.length > TOOL_BODY_LINE_CAP ? (
        <ShowMoreButton expanded={expanded} onPress={() => setExpanded((current) => !current)} />
      ) : null}
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
  return (
    <View style={{ gap: 4 }}>
      {model.script ? (
        <Text
          style={{ color: theme.colors.label, fontFamily: "Menlo", fontSize: 13, lineHeight: 20 }}
        >
          <Text style={{ color: theme.colors.secondaryLabel }}>$ </Text>
          {model.script}
        </Text>
      ) : null}
      {model.groups.map((group) => (
        <View key={group.path} style={{ gap: 2 }}>
          <Text numberOfLines={1} style={{ ...line, color: theme.colors.label }}>
            {group.shown}
          </Text>
          {group.hits.map((hit, index) => (
            <View
              key={`${group.path}:${hit.line ?? 0}:${index}`}
              style={{ flexDirection: "row", gap: 8, paddingLeft: 24 }}
            >
              {hit.line != null ? (
                <Text
                  style={{
                    ...line,
                    color: theme.colors.secondaryLabel,
                    textAlign: "right",
                    width: 40,
                  }}
                >
                  {hit.line}
                </Text>
              ) : null}
              {hit.text ? (
                <Text style={{ ...line, color: theme.colors.secondaryLabel, flexShrink: 1 }}>
                  {hit.text}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ))}
      {model.groups.length === 0 && model.summary ? (
        <Text style={{ color: theme.colors.label, ...BODY_TEXT }}>{model.summary}</Text>
      ) : null}
    </View>
  );
}

function TodoStatusRows({ items }: { items: Array<{ content: string; status: TodoStatusKind }> }) {
  const theme = useMobileTheme();
  return (
    <View style={{ gap: 4 }}>
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
                color={completed ? theme.colors.green : theme.colors.secondaryLabel}
                size={14}
                strokeWidth={2}
              />
            </View>
            <Text
              style={{
                ...BODY_TEXT,
                color: completed ? theme.colors.secondaryLabel : theme.colors.label,
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
    return <CheckIcon color={theme.colors.label} size={14} strokeWidth={2} />;
  }
  if (status === "error") {
    return <CircleAlertIcon color={theme.colors.red} size={14} strokeWidth={2} />;
  }
  const dots = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2, height: 14, width: 14 }}>
      {[1, 0.55, 0.55, 1].map((opacity, index) => (
        <View
          key={index}
          style={{
            backgroundColor: theme.colors.label,
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
      style={{ aspectRatio: ratio, borderRadius: 12, width: "100%" }}
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
    <View accessibilityState={{ busy: active }} style={{ gap: 12, maxWidth: 208, width: "100%" }}>
      {model.items.length === 0 ? (
        <View
          accessibilityLabel={label}
          accessibilityRole="image"
          style={{
            aspectRatio: model.aspect,
            backgroundColor: theme.colors.cardSubtle,
            borderRadius: 12,
            width: "100%",
          }}
        />
      ) : (
        <View style={{ gap: 12 }}>
          {model.items.map((item, index) =>
            "uri" in item ? (
              <ImageGenPreview key={`${item.uri}:${index}`} aspect={model.aspect} uri={item.uri} />
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
                  color: model.status === "error" ? theme.colors.red : theme.colors.label,
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
              style={{ color: theme.colors.secondaryLabel, fontSize: 12, lineHeight: 16 }}
            >
              {`“${model.prompt}”`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function PlanDocumentBody({ model }: { model: Extract<ToolBodyModel, { kind: "plan_document" }> }) {
  const theme = useMobileTheme();
  const hasBody = model.plan.length > 0;
  const hasTodos = model.todos.length > 0;
  const [pane, setPane] = useState<"body" | "todos">(hasBody ? "body" : "todos");
  const showing: "body" | "todos" = hasBody && hasTodos ? pane : hasBody ? "body" : "todos";
  return (
    <View style={{ gap: 8 }}>
      {model.overview ? (
        <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12, lineHeight: 16 }}>
          {model.overview}
        </Text>
      ) : null}
      {hasBody && hasTodos ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setPane(showing === "body" ? "todos" : "body")}
          style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 4 }}
        >
          {showing === "body" ? (
            <ListTodoIcon color={theme.colors.secondaryLabel} size={12} strokeWidth={2} />
          ) : (
            <ScrollTextIcon color={theme.colors.secondaryLabel} size={12} strokeWidth={2} />
          )}
          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 11, lineHeight: 16 }}>
            {planPaneSwitchLabel(showing, model.todos.length)}
          </Text>
        </Pressable>
      ) : null}
      {showing === "body" && hasBody ? (
        <AgentChatMarkdown fontSize={13} lineHeight={21} text={model.plan} />
      ) : null}
      {showing === "todos" && hasTodos ? <TodoStatusRows items={model.todos} /> : null}
      {!hasBody && !hasTodos ? (
        <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12, lineHeight: 16 }}>
          {copy.noOutput}
        </Text>
      ) : null}
    </View>
  );
}

function ToolBodyView({ model }: { model: Exclude<ToolBodyModel, { kind: "subagent" }> }) {
  const theme = useMobileTheme();
  const movePathStyle = {
    color: theme.colors.label,
    flexShrink: 1,
    fontFamily: "Menlo",
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.8,
  } as const;
  switch (model.kind) {
    case "diff":
      return (
        <View style={{ gap: 8 }}>
          {model.files.map((file, index) => (
            <View key={`${file.path}:${index}`} style={{ gap: 4 }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
                <PathChip path={file.path} />
                <DiffCounts additions={file.additions} deletions={file.deletions} />
              </View>
              <DiffLines lines={file.lines} />
            </View>
          ))}
        </View>
      );
    case "diff_stats":
      return (
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          {model.path ? <PathChip path={model.path} /> : null}
          <DiffCounts additions={model.additions} deletions={model.deletions} />
        </View>
      );
    case "patch":
    case "code":
      return (
        <View style={{ gap: 4 }}>
          {model.path ? <PathChip path={model.path} /> : null}
          <CappedMono text={model.text} />
        </View>
      );
    case "web_search":
      return <WebSearchSources links={model.links} />;
    case "web_fetch":
      if (!model.body) return null;
      if (model.format === "markdown") {
        return <AgentChatMarkdown fontSize={13} lineHeight={20} text={model.body} />;
      }
      return (
        <Text
          selectable
          style={{
            color: model.format === "error" ? theme.colors.red : theme.colors.secondaryLabel,
            ...BODY_TEXT,
          }}
        >
          {model.body}
        </Text>
      );
    case "search":
      return <SearchHitsBody model={model} />;
    case "files":
    case "tree":
      return <PathChips paths={model.paths} />;
    case "markdown":
      return <AgentChatMarkdown fontSize={14} lineHeight={20} text={model.markdown} />;
    case "todos":
      return <TodoStatusRows items={model.items} />;
    case "plan_document":
      return <PlanDocumentBody model={model} />;
    case "image_gen":
      return <ImageGenBody model={model} />;
    case "mono":
      return <CappedMono text={model.text} />;
    case "move":
      return (
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <Text numberOfLines={1} style={movePathStyle}>
            {model.from}
          </Text>
          <View accessibilityLabel={copy.moveTo}>
            <ArrowRightIcon
              color={theme.colors.secondaryLabel}
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
        <Text style={{ color: theme.colors.secondaryLabel, ...BODY_TEXT }}>
          {deletedFileLabel(model.path)}
        </Text>
      );
    case "error":
      return (
        <Text selectable style={{ color: theme.colors.red, ...BODY_TEXT }}>
          {model.text}
        </Text>
      );
    case "empty":
      if (!model.path && !model.message) return null;
      return (
        <View style={{ gap: 8 }}>
          {model.path ? <PathChip path={model.path} /> : null}
          {model.message ? (
            <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12, lineHeight: 16 }}>
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
  const color = failed ? theme.colors.red : theme.colors.secondaryLabel;
  const metrics = toolTriggerMetrics;
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
        <ToolKindIcon color={color} kind="subagent" size={metrics.iconSize} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text
          numberOfLines={1}
          style={{ color, fontSize: metrics.fontSize, lineHeight: metrics.lineHeight }}
        >
          {title}
        </Text>
        <Text style={{ color, fontSize: 12, lineHeight: 16 }}>{status}</Text>
      </View>
    </View>
  );
}

function ToolFileChip({ fileName, lineRange }: { fileName: string; lineRange: string | null }) {
  const theme = useMobileTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.colors.cardSubtle,
        borderRadius: 6,
        flexDirection: "row",
        flexShrink: 1,
        gap: 4,
        maxWidth: "46%",
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <FileTextIcon color={theme.colors.secondaryLabel} size={14} strokeWidth={2} />
      <Text numberOfLines={1} style={{ ...CHIP_TEXT, color: theme.colors.label, flexShrink: 1 }}>
        {fileName}
      </Text>
      {lineRange ? (
        <Text style={{ ...CHIP_TEXT, color: theme.colors.secondaryLabel }}>{lineRange}</Text>
      ) : null}
    </View>
  );
}

export function ToolCallRow({ part }: { part: AgentToolCallPart }) {
  const theme = useMobileTheme();
  const model = toolBodyModel(part);
  const chrome = toolRowChrome(part, presentAgentTool(part));
  const imageActive = model.kind === "image_gen" && imageGenStaysOpen(part.status);
  const [open, setOpen] = useAgentChatExpand(
    agentChatToolExpandKey(part.tool_call_id),
    (model.kind === "plan_document" && planDocumentStartsOpen(model)) || imageActive,
  );
  useEffect(() => {
    if (imageActive) setOpen(true);
  }, [imageActive, setOpen]);
  if (model.kind === "subagent") {
    return <SubagentCard status={model.status} title={chrome.title} />;
  }
  const failed = model.kind === "error" || part.status === "failed";
  const running = isActiveToolStatus(part.status);
  const color = failed ? theme.colors.red : theme.colors.secondaryLabel;
  const metrics = toolTriggerMetrics;
  const stats = toolRowDiffStats(model);
  const resultMeta =
    model.kind === "web_search"
      ? webSearchResultMeta(model.links.length)
      : model.kind === "search"
        ? searchMatchLabel(model.matchCount)
        : null;
  const titleStyle = {
    color,
    flexShrink: 1,
    fontSize: metrics.fontSize,
    lineHeight: metrics.lineHeight,
  };
  return (
    <View style={{ paddingVertical: metrics.padY }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          if (imageActive && open) return;
          setOpen(!open);
        }}
        style={{ alignItems: "center", flexDirection: "row", gap: metrics.gap }}
      >
        <View
          style={{
            alignItems: "center",
            height: metrics.iconBox,
            justifyContent: "center",
            width: metrics.iconBox,
          }}
        >
          {part.kind === "fetch" ? (
            <HttpFavicon url={fetchRowUrl(part)} size={metrics.iconBox} radius={3} />
          ) : (
            <ToolKindIcon color={color} kind={part.kind} size={metrics.iconSize} />
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
        <ToolDiffStats additions={stats.additions} deletions={stats.deletions} />
        {resultMeta ? (
          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 11, lineHeight: 16 }}>
            {resultMeta}
          </Text>
        ) : null}
        {failed ? (
          <XCircleIcon color={theme.colors.red} size={metrics.iconSize} strokeWidth={2} />
        ) : null}
        <ExpandChevron color={color} open={open} size={metrics.chevron} />
      </Pressable>
      {open ? (
        <View style={{ paddingTop: metrics.bodyPadTop }}>
          <ToolBodyView model={model} />
        </View>
      ) : null}
    </View>
  );
}
