import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  isActiveToolStatus,
  isNestedSubagentChild,
  presentAgentTool,
  resolveTreeEntryPaths,
  type AgentToolCallPart,
  type ParsedToolResult,
  type ToolPresentation,
} from "@atmos/agent-transcript";
import { copy, sentenceStatus } from "./copy";

export const TOOL_BODY_LINE_CAP = 12;
const DIFF_LINE_LIMIT = 120;

export type UnifiedDiffLine = { op: "add" | "del" | "ctx"; text: string };

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
  | { kind: "web_fetch"; title: string; url: string; openable: boolean; body: string }
  | { kind: "search"; title: string; query: string; paths: string[]; summary: string }
  | { kind: "files"; title: string; paths: string[] }
  | { kind: "tree"; title: string; paths: string[] }
  | { kind: "markdown"; title: string; markdown: string }
  | { kind: "todos"; title: string; items: Array<{ content: string; status: string }> }
  | { kind: "mono"; title: string; text: string }
  | { kind: "move"; title: string; from: string; to: string }
  | { kind: "delete"; title: string; path: string }
  | { kind: "error"; title: string; text: string }
  | { kind: "empty"; title: string; path: string | null }
  | {
      kind: "images";
      title: string;
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
  if (canOpenHttpUrl(url)) return { uri: url };
  const path = image.path?.trim() ?? "";
  if (path) return { path };
  if (url) return { path: url };
  return null;
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

function searchPath(path: string, line: number | undefined): string {
  return line != null ? `${path}:${line}` : path;
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
          title: link.title.trim() || link.url,
          url: link.url,
          openable: canOpenHttpUrl(link.url),
        })),
      };
    case "web_fetch":
      return {
        kind: "web_fetch",
        url: presentation.url,
        openable: canOpenHttpUrl(presentation.url),
        body: presentation.markdown?.trim() || presentation.text?.trim() || "",
      };
    case "search":
      return {
        kind: "search",
        query: presentation.query,
        paths: presentation.hits.map((hit) => searchPath(hit.path, hit.line)),
        summary: presentation.summary?.trim() ?? "",
      };
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
          status: sentenceStatus(todo.status),
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
      return { kind: "error", text: presentation.text };
    case "empty":
      return { kind: "empty", path: part.kind === "read" ? parsed.path : null };
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

/** One switch on `presentAgentTool`. Image and plan tools use that presentation too. */
export function toolBodyModel(part: AgentToolCallPart): ToolBodyModel {
  const parsed = presentAgentTool(part);
  const title = toolRowTitle(part, parsed);
  if (part.kind === "subagent") {
    return { kind: "subagent", title, status: subagentStatusText(part.status) };
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

import { useState, type ReactNode } from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { XCircleIcon } from "@/ui/icons/lucide-native";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { agentChatToolExpandKey, useAgentChatExpand } from "./expand-store";
import { TextShimmer } from "./motion/text-shimmer";
import { toolTriggerMetrics } from "./tool-chrome";
import { ToolKindIcon } from "./tool-kind-icon";
import { ExpandChevron } from "./tool-tree";

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

function HttpText({
  url,
  openable,
  children,
}: {
  url: string;
  openable: boolean;
  children: ReactNode;
}) {
  const theme = useMobileTheme();
  if (!openable) {
    return <Text style={{ color: theme.colors.label, ...BODY_TEXT }}>{children}</Text>;
  }
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => {
        void Linking.openURL(url);
      }}
    >
      <Text style={{ color: theme.colors.accent, ...BODY_TEXT }}>{children}</Text>
    </Pressable>
  );
}

function ToolBodyView({ model }: { model: Exclude<ToolBodyModel, { kind: "subagent" }> }) {
  const theme = useMobileTheme();
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
      return (
        <View style={{ gap: 4 }}>
          {model.query ? (
            <Text style={{ color: theme.colors.label, ...BODY_TEXT }}>{model.query}</Text>
          ) : null}
          {model.links.map((link, index) => (
            <HttpText key={`${link.url}:${index}`} openable={link.openable} url={link.url}>
              {link.title}
            </HttpText>
          ))}
        </View>
      );
    case "web_fetch":
      return (
        <View style={{ gap: 4 }}>
          {model.url ? (
            <HttpText openable={model.openable} url={model.url}>
              {model.url}
            </HttpText>
          ) : null}
          {model.body ? (
            <AgentChatMarkdown fontSize={14} lineHeight={20} text={model.body} />
          ) : null}
        </View>
      );
    case "search":
      return (
        <View style={{ gap: 4 }}>
          {model.query ? (
            <Text style={{ color: theme.colors.label, ...BODY_TEXT }}>{model.query}</Text>
          ) : null}
          <PathChips paths={model.paths} />
          {model.summary ? (
            <Text style={{ color: theme.colors.label, ...BODY_TEXT }}>{model.summary}</Text>
          ) : null}
        </View>
      );
    case "files":
    case "tree":
      return <PathChips paths={model.paths} />;
    case "markdown":
      return <AgentChatMarkdown fontSize={14} lineHeight={20} text={model.markdown} />;
    case "todos":
      return (
        <View style={{ gap: 4 }}>
          {model.items.map((item, index) => (
            <Text
              key={`${item.content}:${index}`}
              style={{ color: theme.colors.label, ...BODY_TEXT }}
            >
              {item.content}
              {item.status ? ` · ${item.status}` : ""}
            </Text>
          ))}
        </View>
      );
    case "mono":
      return <CappedMono text={model.text} />;
    case "move":
      return (
        <Text style={{ color: theme.colors.label, ...BODY_TEXT }}>
          {model.from} → {model.to}
        </Text>
      );
    case "delete":
      return <PathChip path={model.path} />;
    case "error":
      return (
        <Text selectable style={{ color: theme.colors.red, ...BODY_TEXT }}>
          {model.text}
        </Text>
      );
    case "empty":
      return model.path ? <PathChip path={model.path} /> : null;
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

export function ToolCallRow({ part }: { part: AgentToolCallPart }) {
  const theme = useMobileTheme();
  const model = toolBodyModel(part);
  const [open, setOpen] = useAgentChatExpand(agentChatToolExpandKey(part.tool_call_id), false);
  if (model.kind === "subagent") {
    return <SubagentCard status={model.status} title={model.title} />;
  }
  const failed = model.kind === "error" || part.status === "failed";
  const running = isActiveToolStatus(part.status);
  const color = failed ? theme.colors.red : theme.colors.secondaryLabel;
  const metrics = toolTriggerMetrics;
  const stats = toolRowDiffStats(model);
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
        onPress={() => setOpen(!open)}
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
          <ToolKindIcon color={color} kind={part.kind} size={metrics.iconSize} />
        </View>
        {running ? (
          <TextShimmer duration={1} numberOfLines={1} style={titleStyle}>
            {model.title}
          </TextShimmer>
        ) : (
          <Text numberOfLines={1} style={titleStyle}>
            {model.title}
          </Text>
        )}
        <ToolDiffStats additions={stats.additions} deletions={stats.deletions} />
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
