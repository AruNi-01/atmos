import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AgentToolParams, AgentToolResult } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronRightIcon } from "@/ui/icons/lucide-native";
import { copy } from "./copy";
import { collapsedToolTitle, type AgentToolCallPart } from "./tool-kind";
import { pathDisplay } from "./path-display";

function textOrNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}

function joinBlocks(parts: Array<string | null | undefined>): string | null {
  const text = parts
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join("\n");
  return text.length > 0 ? text : null;
}

function displayedPath(value: string | null | undefined): string | null {
  return textOrNull(pathDisplay(value ?? "").text);
}

function jsonText(value: unknown): string | null {
  if (typeof value === "string") return textOrNull(value);
  if (value == null) return null;
  try {
    return textOrNull(JSON.stringify(value, null, 2));
  } catch {
    return null;
  }
}

function paramSummary(params: AgentToolParams): string | null {
  switch (params.type) {
    case "read":
      return joinBlocks([
        displayedPath(params.path),
        params.offset != null || params.limit != null
          ? `lines ${params.offset ?? 0}${params.limit != null ? ` +${params.limit}` : ""}`
          : null,
      ]);
    case "edit":
    case "delete":
      return displayedPath(params.path);
    case "move":
      return joinBlocks([displayedPath(params.from), displayedPath(params.to)]);
    case "search":
      return joinBlocks([params.query, params.glob, displayedPath(params.path)]);
    case "web_search":
      return textOrNull(params.query);
    case "execute":
      return joinBlocks([params.command, displayedPath(params.cwd)]);
    case "fetch":
      return textOrNull(params.url);
    case "skill":
      return textOrNull(params.skill);
    case "subagent":
      return joinBlocks([params.description, params.agent_type, params.prompt]);
    case "mcp_list":
      return textOrNull(params.server);
    case "mcp_call":
      return joinBlocks([params.server, params.tool]);
    case "image_gen":
      return joinBlocks([
        params.prompt,
        params.aspect_ratio,
        params.size,
        displayedPath(params.path),
        ...(params.reference_paths ?? []).map((path) => displayedPath(path)),
      ]);
    case "plan_document":
      return joinBlocks([
        params.name,
        params.overview,
        params.plan,
        ...params.todos.map((todo) => todo.content),
      ]);
    case "other":
      return jsonText(params.value);
    default: {
      const unreachable: never = params;
      return unreachable;
    }
  }
}

function toolOutput(result: AgentToolResult | null | undefined): string | null {
  if (!result) return null;
  switch (result.type) {
    case "text":
      return textOrNull(result.text);
    case "execute":
      return textOrNull(result.output);
    case "error":
      return textOrNull(result.message);
    case "file_content":
      return joinBlocks([pathDisplay(result.path).text, result.text]);
    case "diff_stats":
      return joinBlocks([
        pathDisplay(result.path).text,
        `+${result.additions} -${result.deletions}`,
      ]);
    case "diff":
      return joinBlocks([pathDisplay(result.path).text, result.new_content]);
    case "web_search":
      return joinBlocks(
        result.links.map((link) => {
          const title = link.title.trim();
          const url = link.url.trim();
          if (title && url && title !== url) return `${title}\n${url}`;
          return title || url;
        }),
      );
    case "search_hits":
      return joinBlocks(
        result.hits.map((hit) =>
          joinBlocks([pathDisplay(hit.path).text, hit.snippet]),
        ),
      );
    case "web_fetch":
      return joinBlocks([
        result.title,
        result.url,
        result.markdown?.trim() || result.text,
      ]);
    case "images":
      return joinBlocks(
        result.images.map((image) => {
          const path = image.path ? pathDisplay(image.path).text : "";
          return path || image.url;
        }),
      );
    case "other":
      return jsonText(result.value);
    case "empty":
      return null;
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

function MonoBlock({ text }: { text: string }) {
  const theme = useMobileTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.cardSubtle,
        borderColor: theme.colors.glassBorder,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text
        selectable
        style={{
          color: theme.colors.label,
          fontFamily: "Menlo",
          fontSize: 13,
          lineHeight: 18,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function DetailSection({ label, text }: { label: string; text: string }) {
  const theme = useMobileTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13, lineHeight: 18 }}>{label}</Text>
      <MonoBlock text={text} />
    </View>
  );
}

export function AgentChatToolDetail({ part }: { part: AgentToolCallPart }) {
  const parameters = paramSummary(part.params);
  const output = toolOutput(part.result);

  return (
    <View style={{ gap: 16 }}>
      {parameters ? <DetailSection label={copy.parameters} text={parameters} /> : null}
      {output ? <DetailSection label={copy.result} text={output} /> : null}
    </View>
  );
}

export function AgentChatToolCard({
  onPress,
  part,
}: {
  onPress?: () => void;
  part: AgentToolCallPart;
}) {
  const theme = useMobileTheme();
  const heading = collapsedToolTitle(part);
  const failed = part.status === "failed";
  const hasBody = Boolean(paramSummary(part.params) || toolOutput(part.result));
  const interactive = Boolean(onPress) && hasBody;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={!interactive}
      onPress={onPress}
      style={{ alignItems: "center", flexDirection: "row", gap: 6, marginBottom: 4, paddingVertical: 2 }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: failed ? theme.colors.red : theme.colors.secondaryLabel,
          flexShrink: 1,
          fontSize: 15,
          lineHeight: 20,
        }}
      >
        {heading}
      </Text>
      {interactive ? (
        <ChevronRightIcon
          color={failed ? theme.colors.red : theme.colors.secondaryLabel}
          size={14}
          strokeWidth={2.2}
        />
      ) : null}
    </Pressable>
  );
}
