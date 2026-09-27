import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { EmptyState } from "@/ui/layout/app-screen";
import { ChevronRightIcon } from "@/ui/icons/lucide-native";
import { AgentChatDetailSheet, type DetailPage } from "./AgentChatDetailSheet";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { AgentChatToolCard } from "./AgentChatToolCard";
import {
  segmentAssistantParts,
  shouldCollapseAssistantProcess,
  splitAssistantSegments,
  toolGroupOverview,
  type AssistantSegment,
} from "./assistant-process";
import { ChatBubble } from "./template-message";
import { copy } from "./copy";
import { pathDisplay } from "./path-display";
import { isHiddenTranscriptChromePart } from "./tool-kind";

const BOTTOM_SLOP = 64;

function distanceFromBottom(event: NativeScrollEvent): number {
  const { contentOffset, contentSize, layoutMeasurement } = event;
  return contentSize.height - layoutMeasurement.height - contentOffset.y;
}

function partKey(messageId: string, part: AgentPart, index: number): string {
  if (part.type === "tool_call") return `${messageId}:${part.tool_call_id}`;
  if (part.type === "text") return `${messageId}:text:${part.message_id ?? index}`;
  if (part.type === "thinking") return `${messageId}:thinking:${part.tool_call_id ?? index}`;
  if (part.type === "attachment") return `${messageId}:attachment:${index}`;
  if (part.type === "error") return `${messageId}:error:${index}`;
  return `${messageId}:${part.type}:${index}`;
}

function MessagePart({ part }: { part: AgentPart }) {
  const theme = useMobileTheme();

  if (part.type === "text" || part.type === "thinking") {
    return <AgentChatMarkdown text={part.text} tone={part.type === "thinking" ? "thinking" : "body"} />;
  }
  if (part.type === "tool_call") {
    if (isHiddenTranscriptChromePart(part)) return null;
    return <AgentChatToolCard part={part} />;
  }
  if (part.type === "attachment") {
    const text = pathDisplay(part.path).text;
    if (!text) return null;
    return (
      <Text selectable style={{ color: theme.colors.secondaryLabel, fontSize: 13, lineHeight: 18 }}>
        {text}
      </Text>
    );
  }
  if (part.type === "error") {
    const message = part.message.trim();
    if (!message) return null;
    return (
      <Text selectable style={{ color: theme.colors.red, fontSize: 15, lineHeight: 21 }}>
        {message}
      </Text>
    );
  }
  return null;
}

function visiblePart(part: AgentPart): boolean {
  if (part.type === "text" || part.type === "thinking") return part.text.length > 0;
  if (part.type === "tool_call") return !isHiddenTranscriptChromePart(part);
  if (part.type === "attachment") return pathDisplay(part.path).text.length > 0;
  if (part.type === "error") return part.message.trim().length > 0;
  return false;
}

function workDuration(workedMs: number): string {
  const total = Math.max(0, Math.floor(workedMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h${minutes}m${seconds}s`;
  if (minutes > 0) return `${minutes}m${seconds}s`;
  return `${seconds}s`;
}

function workedForLabel(workedMs: number | null | undefined): string | null {
  if (workedMs == null || workedMs <= 0) return null;
  return `Worked for ${workDuration(workedMs)}`;
}

function thoughtForLabel(durationMs: number | null | undefined): string {
  if (durationMs == null || durationMs <= 0) return "Thought for a few seconds";
  return `Thought for ${workDuration(durationMs)}`;
}

function DisclosureChevron() {
  const theme = useMobileTheme();
  return <ChevronRightIcon color={theme.colors.secondaryLabel} size={12} strokeWidth={2.2} />;
}

function ThinkingRow({
  durationMs,
  onPress,
}: {
  durationMs?: number | null;
  onPress: () => void;
}) {
  const theme = useMobileTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ alignItems: "center", flexDirection: "row", gap: 6, paddingVertical: 2 }}
    >
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13, lineHeight: 18 }}>
        {thoughtForLabel(durationMs)}
      </Text>
      <DisclosureChevron />
    </Pressable>
  );
}

function ToolGroupRow({
  onPress,
  parts,
}: {
  onPress: () => void;
  parts: AgentPart[];
}) {
  const theme = useMobileTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ alignItems: "center", flexDirection: "row", gap: 6, paddingVertical: 2 }}
    >
      <Text numberOfLines={1} style={{ color: theme.colors.secondaryLabel, flexShrink: 1, fontSize: 15, lineHeight: 20 }}>
        {toolGroupOverview(parts)}
      </Text>
      <DisclosureChevron />
    </Pressable>
  );
}

function ProcessPart({
  onOpen,
  part,
}: {
  onOpen: (page: DetailPage) => void;
  part: AgentPart;
}) {
  if (part.type === "thinking") {
    return (
      <ThinkingRow
        durationMs={part.duration_ms}
        onPress={() => onOpen({
          kind: "thinking",
          title: thoughtForLabel(part.duration_ms),
          text: part.text,
        })}
      />
    );
  }
  if (part.type === "tool_call") {
    return <AgentChatToolCard onPress={() => onOpen({ kind: "tool", part })} part={part} />;
  }
  return <MessagePart part={part} />;
}

function AssistantSegments({
  onOpen,
  segments,
}: {
  onOpen: (page: DetailPage) => void;
  segments: AssistantSegment[];
}) {
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "tool_group") {
          const title = toolGroupOverview(segment.parts);
          return (
            <ToolGroupRow
              key={segment.indexes.join("-") || `group-${index}`}
              onPress={() => onOpen({ kind: "group", title, parts: segment.parts })}
              parts={segment.parts}
            />
          );
        }
        return (
          <ProcessPart
            key={partKey("segment", segment.part, segment.index)}
            onOpen={onOpen}
            part={segment.part}
          />
        );
      })}
    </>
  );
}

function ChatMessage({
  message,
  onOpen,
}: {
  message: AgentMessage;
  onOpen: (page: DetailPage) => void;
}) {
  const theme = useMobileTheme();
  const isUser = message.role === "user";
  const hasBody = message.parts.some(visiblePart);
  const canCollapse = !isUser && shouldCollapseAssistantProcess(message, message.parts);
  if (!hasBody && !message.streaming) return null;

  let cursorIndex = -1;
  if (message.streaming) {
    for (let index = message.parts.length - 1; index >= 0; index -= 1) {
      const part = message.parts[index];
      if (part?.type === "text" || part?.type === "thinking") {
        cursorIndex = index;
        break;
      }
    }
  }

  if (isUser) {
    return (
      <View style={{ width: "100%" }}>
        <ChatBubble from="user">
          <View style={{ gap: 8 }}>
            {message.parts.map((part, index) => {
              if (part.type === "text") {
                return (
                  <Text
                    key={partKey(message.id, part, index)}
                    selectable
                    style={{ color: theme.colors.label, fontSize: 16, lineHeight: 22 }}
                  >
                    {part.text}
                  </Text>
                );
              }
              return <MessagePart key={partKey(message.id, part, index)} part={part} />;
            })}
          </View>
        </ChatBubble>
      </View>
    );
  }

  const segments = segmentAssistantParts(message.parts);
  const { process, tail } = splitAssistantSegments(segments);
  const worked = workedForLabel(message.worked_ms);

  return (
    <View style={{ gap: 8, width: "100%" }}>
      {canCollapse && process.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpen({
            kind: "process",
            title: worked ?? "Process",
            segments: process,
          })}
          style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 4, paddingVertical: 2 }}
        >
          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13, lineHeight: 18 }}>
            {worked ?? "Process"}
          </Text>
          <DisclosureChevron />
        </Pressable>
      ) : process.length > 0 ? (
        <View style={{ gap: 6 }}>
          <AssistantSegments onOpen={onOpen} segments={process} />
        </View>
      ) : null}
      {tail.length > 0 || message.streaming ? (
        <ChatBubble from="assistant">
          <View style={{ gap: 8 }}>
            {message.streaming && cursorIndex < 0 ? <AgentChatMarkdown text="..." /> : null}
            <AssistantSegments onOpen={onOpen} segments={tail} />
          </View>
        </ChatBubble>
      ) : null}
    </View>
  );
}

export function AgentChatTranscript({
  focusMessageId,
  messages,
  streaming = false,
}: {
  focusMessageId?: string | null;
  messages: AgentMessage[];
  streaming?: boolean;
}) {
  const theme = useMobileTheme();
  const listRef = useRef<FlatList<AgentMessage>>(null);
  const atBottomRef = useRef(true);
  const userDraggedRef = useRef(false);
  const listHeightRef = useRef(0);

  const stickToBottom = useCallback(() => {
    if (userDraggedRef.current && !atBottomRef.current) return;
    atBottomRef.current = true;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
    });
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!userDraggedRef.current) return;
    atBottomRef.current = distanceFromBottom(event.nativeEvent) <= BOTTOM_SLOP;
  }, []);

  const onScrollBeginDrag = useCallback(() => {
    userDraggedRef.current = true;
  }, []);

  const onContentSizeChange = useCallback((_width: number, height: number) => {
    if (height <= 0) return;
    stickToBottom();
  }, [stickToBottom]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (height === listHeightRef.current) return;
    listHeightRef.current = height;
    stickToBottom();
  }, [stickToBottom]);

  const [pages, setPages] = useState<DetailPage[]>([]);
  const openPage = useCallback((page: DetailPage) => {
    setPages([page]);
  }, []);
  const rows = streaming && !messages.some((message) => message.streaming)
    ? [...messages, {
        id: "stream-wait",
        role: "assistant",
        parts: [{ type: "text" as const, text: "" }],
        streaming: true,
      }]
    : messages;

  useEffect(() => {
    stickToBottom();
  }, [rows.length, stickToBottom]);

  useEffect(() => {
    if (!focusMessageId) return;
    const index = messages.findIndex((message) => message.id === focusMessageId);
    if (index < 0) return;
    userDraggedRef.current = true;
    atBottomRef.current = false;
    listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0 });
  }, [focusMessageId, messages]);

  return (
    <View style={{ flex: 1 }}>
    <FlatList
      ref={listRef}
      keyboardDismissMode="interactive"
      contentContainerStyle={{
        flexGrow: 1,
        gap: 12,
        justifyContent: rows.length === 0 ? "center" : "flex-start",
        paddingBottom: 12,
        paddingHorizontal: 18,
        paddingTop: 12,
      }}
      contentInsetAdjustmentBehavior="never"
      data={rows}
      keyboardShouldPersistTaps="handled"
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<EmptyState message={copy.emptyDescription} title={copy.emptyTitle} />}
      onContentSizeChange={onContentSizeChange}
      onLayout={onLayout}
      onScroll={onScroll}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollToIndexFailed={({ index }) => {
        listRef.current?.scrollToOffset({ animated: false, offset: Math.max(0, index) * 80 });
      }}
      renderItem={({ item }) => <ChatMessage message={item} onOpen={openPage} />}
      scrollEventThrottle={16}
      style={{ backgroundColor: theme.colors.background, flex: 1 }}
    />
    <AgentChatDetailSheet
      onDismissAt={(index) => setPages((current) => current.slice(0, index))}
      onPush={(page) => setPages((current) => [...current, page])}
      pages={pages}
    />
    </View>
  );
}
