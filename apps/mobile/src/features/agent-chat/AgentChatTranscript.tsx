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
import { AtmosLogo } from "@/ui/AtmosLogo";
import { EmptyState } from "@/ui/layout/app-screen";
import { ChevronRightIcon } from "@/ui/icons/lucide-native";
import { classifyTranscriptPart, waitForSection } from "@atmos/agent-transcript";
import { AgentChatDetailSheet } from "./AgentChatDetailSheet";
import { AgentChatEventBody } from "./AgentChatEventBody";
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
import {
  activateWaitForBar,
  dismissSheet,
  initialExpandState,
  isWaitForOpen,
  openGroupSheet,
  openLeafSheet,
  transcriptEventModel,
  waitForLabel,
  type EventViewModel,
  type ExpandState,
} from "./event-model";

const BOTTOM_SLOP = 64;

function EmptyChat() {
  return (
    <View style={{ alignItems: "center", gap: 28 }}>
      <AtmosLogo />
      <EmptyState message={copy.emptyDescription} title={copy.emptyTitle} />
    </View>
  );
}

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

function attachmentName(part: Extract<AgentPart, { type: "attachment" }>): string {
  const name = part.name?.trim();
  if (name) return name;
  return part.path.split(/[\\/]/).filter(Boolean).pop() || part.path;
}

function MessagePart({
  messages,
  onOpen,
  openId,
  part,
  siblings,
  surface = "timeline",
}: {
  messages: Array<Pick<AgentMessage, "role" | "parts">>;
  onOpen: (id: string, model: EventViewModel) => void;
  openId: string;
  part: AgentPart;
  siblings: AgentPart[];
  surface?: "timeline" | "tour";
}) {
  const theme = useMobileTheme();
  const classified = classifyTranscriptPart(part);
  if (surface === "timeline" && classified.visibility !== "visible") return null;
  if (classified.visibility === "hidden_chrome") return null;
  if (classified.detail.kind === "permission" && !classified.detail.shownInTranscript) return null;

  const model = transcriptEventModel(part, siblings, messages);
  const sheetId = part.type === "tool_call" ? part.tool_call_id : openId;
  if (surface === "tour") {
    if (part.type === "tool_call") {
      return (
        <AgentChatToolCard
          onPress={() => onOpen(sheetId, model)}
          part={part}
          title={model.title}
        />
      );
    }
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => onOpen(sheetId, model)}
        style={{ alignItems: "center", flexDirection: "row", gap: 6, paddingVertical: 2 }}
      >
        <Text numberOfLines={2} style={{ color: theme.colors.secondaryLabel, flexShrink: 1, fontSize: 15, lineHeight: 20 }}>
          {model.title}
        </Text>
        <DisclosureChevron />
      </Pressable>
    );
  }

  if (part.type === "text") {
    return <AgentChatMarkdown text={part.text} />;
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
  if (!model.sheet) {
    if (model.kind === "permission") return <AgentChatEventBody model={{ ...model, sheet: null }} />;
    const tone = classified.detail.kind === "session_hint" ? classified.detail.tone : null;
    const color = model.kind === "session_lifecycle" && classified.detail.kind === "session_lifecycle" && classified.detail.status === "failed"
      ? theme.colors.red
      : tone === "error"
        ? theme.colors.red
        : tone === "warning"
          ? theme.colors.yellow
          : theme.colors.secondaryLabel;
    return (
      <Text selectable style={{ color, fontSize: 15, lineHeight: 20 }}>
        {model.title}
      </Text>
    );
  }
  if (part.type === "tool_call") {
    return (
      <AgentChatToolCard
        onPress={() => onOpen(sheetId, model)}
        part={part}
        title={model.title}
      />
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(sheetId, model)}
      style={{ alignItems: "center", flexDirection: "row", gap: 6, paddingVertical: 2 }}
    >
      <Text numberOfLines={2} style={{ color: theme.colors.secondaryLabel, flexShrink: 1, fontSize: 15, lineHeight: 20 }}>
        {model.title}
      </Text>
      <DisclosureChevron />
    </Pressable>
  );
}

function visiblePart(part: AgentPart): boolean {
  const classified = classifyTranscriptPart(part);
  if (classified.visibility === "hidden_chrome" || classified.visibility === "nested_child") return false;
  if (classified.visibility === "subagent_wait") return true;
  if (classified.detail.kind === "permission") return classified.detail.shownInTranscript;
  if (classified.detail.kind === "text_part") return classified.detail.text.length > 0;
  if (classified.detail.kind === "thinking") return classified.detail.text.length > 0;
  if (classified.detail.kind === "error_part") return classified.detail.message.trim().length > 0;
  if (classified.detail.kind === "hidden") return false;
  return true;
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

function DisclosureChevron() {
  const theme = useMobileTheme();
  return <ChevronRightIcon color={theme.colors.secondaryLabel} size={12} strokeWidth={2.2} />;
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

function modelsForParts(
  parts: AgentPart[],
  siblings: AgentPart[],
  messages: Array<Pick<AgentMessage, "role" | "parts">>,
): EventViewModel[] {
  return parts.map((part) => transcriptEventModel(part, siblings, messages));
}

function ProcessPart({
  messages,
  onOpen,
  openId,
  part,
  siblings,
}: {
  messages: Array<Pick<AgentMessage, "role" | "parts">>;
  onOpen: (id: string, model: EventViewModel) => void;
  openId: string;
  part: AgentPart;
  siblings: AgentPart[];
}) {
  return <MessagePart messages={messages} onOpen={onOpen} openId={openId} part={part} siblings={siblings} />;
}

function AssistantSegments({
  messages,
  onOpenGroup,
  onOpen,
  segments,
  siblings,
}: {
  messages: Array<Pick<AgentMessage, "role" | "parts">>;
  onOpen: (id: string, model: EventViewModel) => void;
  onOpenGroup: (id: string, title: string, models: EventViewModel[]) => void;
  segments: AssistantSegment[];
  siblings: AgentPart[];
}) {
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "tool_group") {
          const title = toolGroupOverview(segment.parts);
          return (
            <ToolGroupRow
              key={segment.indexes.join("-") || `group-${index}`}
              onPress={() => onOpenGroup(
                segment.indexes.join("-") || `group-${index}`,
                title,
                modelsForParts(segment.parts, siblings, messages),
              )}
              parts={segment.parts}
            />
          );
        }
        return (
          <ProcessPart
            key={partKey("segment", segment.part, segment.index)}
            messages={messages}
            onOpen={onOpen}
            openId={partKey("segment", segment.part, segment.index)}
            part={segment.part}
            siblings={siblings}
          />
        );
      })}
    </>
  );
}

function WaitForBar({
  expanded,
  label,
  onPress,
}: {
  expanded: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useMobileTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={{ alignItems: "center", flexDirection: "row", gap: 6, paddingVertical: 4 }}
    >
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 15, lineHeight: 20 }}>
        {label}
      </Text>
      <View style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}>
        <DisclosureChevron />
      </View>
    </Pressable>
  );
}

function ChatMessage({
  expand,
  message,
  messages,
  onExpand,
}: {
  expand: ExpandState;
  message: AgentMessage;
  messages: AgentMessage[];
  onExpand: (update: (state: ExpandState) => ExpandState) => void;
}) {
  const theme = useMobileTheme();
  const isUser = message.role === "user";
  const hasBody = message.parts.some((part) =>
    (isUser && part.type === "attachment") || visiblePart(part),
  );
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

  const openEvent = (id: string, model: EventViewModel) => {
    onExpand((state) => openLeafSheet(state, id, model));
  };
  const openGroup = (id: string, title: string, models: EventViewModel[]) => {
    onExpand((state) => openGroupSheet(state, id, title, models));
  };

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
              if (part.type === "attachment") {
                return (
                  <Text
                    key={partKey(message.id, part, index)}
                    style={{ color: theme.colors.secondaryLabel, fontSize: 15, lineHeight: 20 }}
                  >
                    {attachmentName(part)}
                  </Text>
                );
              }
              return (
                <MessagePart
                  key={partKey(message.id, part, index)}
                  messages={messages}
                  onOpen={openEvent}
                  openId={partKey(message.id, part, index)}
                  part={part}
                  siblings={message.parts}
                />
              );
            })}
          </View>
        </ChatBubble>
      </View>
    );
  }

  const segments = segmentAssistantParts(message.parts);
  const { process, tail } = splitAssistantSegments(segments);
  const worked = workedForLabel(message.worked_ms);
  const waiting = waitForSection(message.parts);
  const waitingOpen = isWaitForOpen(expand, message.id);

  return (
    <View style={{ gap: 8, width: "100%" }}>
      {waiting ? (
        <View style={{ gap: 4 }}>
          <WaitForBar
            expanded={waitingOpen}
            label={waitForLabel(waiting.anchors.length)}
            onPress={() => onExpand((state) => activateWaitForBar(state, message.id))}
          />
          {waitingOpen ? waiting.rows.map((row) => (
            <MessagePart
              key={partKey(message.id, row.part, row.index)}
              messages={messages}
              onOpen={openEvent}
              openId={partKey(message.id, row.part, row.index)}
              part={row.part}
              siblings={message.parts}
              surface="tour"
            />
          )) : null}
        </View>
      ) : null}
      {canCollapse && process.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => openGroup(
            `${message.id}:process`,
            worked ?? "Process",
            process.flatMap((segment) => (
              segment.type === "tool_group" ? segment.parts : [segment.part]
            )).map((part) => transcriptEventModel(part, message.parts, messages)),
          )}
          style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 4, paddingVertical: 2 }}
        >
          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13, lineHeight: 18 }}>
            {worked ?? "Process"}
          </Text>
          <DisclosureChevron />
        </Pressable>
      ) : process.length > 0 ? (
        <View style={{ gap: 6 }}>
          <AssistantSegments messages={messages} onOpen={openEvent} onOpenGroup={openGroup} segments={process} siblings={message.parts} />
        </View>
      ) : null}
      {tail.length > 0 || message.streaming ? (
        <ChatBubble from="assistant">
          <View style={{ gap: 8 }}>
            {message.streaming && cursorIndex < 0 ? <AgentChatMarkdown text="..." /> : null}
            <AssistantSegments messages={messages} onOpen={openEvent} onOpenGroup={openGroup} segments={tail} siblings={message.parts} />
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

  const [expand, setExpand] = useState<ExpandState>(initialExpandState);
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
      ListEmptyComponent={<EmptyChat />}
      onContentSizeChange={onContentSizeChange}
      onLayout={onLayout}
      onScroll={onScroll}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollToIndexFailed={({ index }) => {
        listRef.current?.scrollToOffset({ animated: false, offset: Math.max(0, index) * 80 });
      }}
      renderItem={({ item }) => (
        <ChatMessage
          expand={expand}
          message={item}
          messages={rows}
          onExpand={setExpand}
        />
      )}
      scrollEventThrottle={16}
      style={{ backgroundColor: theme.colors.background, flex: 1 }}
    />
    <AgentChatDetailSheet
      onDismiss={() => setExpand((state) => dismissSheet(state))}
      sheets={expand.sheets}
    />
    </View>
  );
}
