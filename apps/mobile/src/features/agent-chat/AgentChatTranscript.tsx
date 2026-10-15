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
import {
  assistantCopyText,
  classifyTranscriptPart,
  countToolGroupOverview,
  formatToolGroupOverview,
  formatWorkDuration,
  hasCollapsibleAssistantProcess,
  isHiddenGrokChromePart,
  isHiddenTranscriptChromePart,
  segmentAssistantParts,
  sentenceCaseOverview,
  shouldShowAssistantTurnEndedChrome,
  splitSegmentedAssistantParts,
  toolCallPartsFromGroup,
  transcriptVisibility,
  waitForSection,
  type AssistantSegment,
} from "@atmos/agent-transcript";
import { AgentChatDetailSheet } from "./AgentChatDetailSheet";
import { AgentChatToolCard } from "./AgentChatToolCard";
import { AnswerText } from "./answer-text";
import { AssistantFooter, AssistantTurnFiles } from "./assistant-footer";
import { copy, toolGroupCountLabel, toolGroupLabels } from "./copy";
import { ErrorPart } from "./error-part";
import { expandResetForFirstMessage, useAgentChatExpandStore } from "./expand-store";
import { HistoricPermission } from "./historic-permission";
import { SessionChrome } from "./session-chrome";
import { ThinkingBlock } from "./thinking-block";
import { UserMessage } from "./user-message";
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

  const model = transcriptEventModel(part, siblings, messages);
  const sheetId = part.type === "tool_call" ? part.tool_call_id : openId;
  if (surface === "tour") {
    if (part.type === "tool_call") {
      return (
        <AgentChatToolCard onPress={() => onOpen(sheetId, model)} part={part} title={model.title} />
      );
    }
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => onOpen(sheetId, model)}
        style={{ alignItems: "center", flexDirection: "row", gap: 6, paddingVertical: 2 }}
      >
        <Text
          numberOfLines={2}
          style={{
            color: theme.colors.secondaryLabel,
            flexShrink: 1,
            fontSize: 15,
            lineHeight: 20,
          }}
        >
          {model.title}
        </Text>
        <DisclosureChevron />
      </Pressable>
    );
  }

  if (part.type === "tool_call") {
    return (
      <AgentChatToolCard onPress={() => onOpen(sheetId, model)} part={part} title={model.title} />
    );
  }
  if (!model.sheet) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(sheetId, model)}
      style={{ alignItems: "center", flexDirection: "row", gap: 6, paddingVertical: 2 }}
    >
      <Text
        numberOfLines={2}
        style={{ color: theme.colors.secondaryLabel, flexShrink: 1, fontSize: 15, lineHeight: 20 }}
      >
        {model.title}
      </Text>
      <DisclosureChevron />
    </Pressable>
  );
}

function toolGroupTitle(parts: AgentPart[]): string {
  const counts = countToolGroupOverview(toolCallPartsFromGroup(parts));
  if (counts.length === 0) {
    return parts.some((part) => part.type === "thinking")
      ? toolGroupLabels.thinking
      : toolGroupLabels.working;
  }
  return sentenceCaseOverview(
    formatToolGroupOverview(counts, toolGroupCountLabel, toolGroupLabels.join),
    toolGroupLabels.locale,
  );
}

function DisclosureChevron() {
  const theme = useMobileTheme();
  return <ChevronRightIcon color={theme.colors.secondaryLabel} size={12} strokeWidth={2.2} />;
}

function ToolGroupRow({ onPress, parts }: { onPress: () => void; parts: AgentPart[] }) {
  const theme = useMobileTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ alignItems: "center", flexDirection: "row", gap: 6, paddingVertical: 2 }}
    >
      <Text
        numberOfLines={1}
        style={{ color: theme.colors.secondaryLabel, flexShrink: 1, fontSize: 15, lineHeight: 20 }}
      >
        {toolGroupTitle(parts)}
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

function TimelinePart({
  inProcess,
  message,
  messages,
  onOpen,
  part,
}: {
  inProcess: boolean;
  message: AgentMessage;
  messages: AgentMessage[];
  onOpen: (id: string, model: EventViewModel) => void;
  part: AgentPart;
}) {
  if (isHiddenTranscriptChromePart(part) || isHiddenGrokChromePart(part, message.parts))
    return null;
  const key = partKey(message.id, part, 0);
  if (part.type === "text") return <AnswerText part={part} />;
  if (part.type === "thinking") {
    if (inProcess) {
      return (
        <MessagePart
          messages={messages}
          onOpen={onOpen}
          openId={key}
          part={part}
          siblings={message.parts}
        />
      );
    }
    return <ThinkingBlock part={part} parts={message.parts} thinkingMs={message.thinking_ms} />;
  }
  if (part.type === "error") return <ErrorPart part={part} />;
  if (
    part.type === "session_lifecycle" ||
    part.type === "session_config_change" ||
    part.type === "session_hint"
  ) {
    return <SessionChrome part={part} />;
  }
  if (part.type === "permission") return <HistoricPermission part={part} />;
  if (part.type === "tool_call") {
    return (
      <MessagePart
        messages={messages}
        onOpen={onOpen}
        openId={key}
        part={part}
        siblings={message.parts}
      />
    );
  }
  return null;
}

function AssistantSegments({
  inProcess,
  message,
  messages,
  onOpenGroup,
  onOpen,
  segments,
}: {
  inProcess: boolean;
  message: AgentMessage;
  messages: AgentMessage[];
  onOpen: (id: string, model: EventViewModel) => void;
  onOpenGroup: (id: string, title: string, models: EventViewModel[]) => void;
  segments: AssistantSegment[];
}) {
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "tool_group") {
          const title = toolGroupTitle(segment.parts);
          const groupKey = segment.origIndexes.join("-") || `group-${index}`;
          return (
            <ToolGroupRow
              key={groupKey}
              onPress={() =>
                onOpenGroup(groupKey, title, modelsForParts(segment.parts, message.parts, messages))
              }
              parts={segment.parts}
            />
          );
        }
        return (
          <TimelinePart
            key={partKey(message.id, segment.part, segment.origIndex)}
            inProcess={inProcess}
            message={message}
            messages={messages}
            onOpen={onOpen}
            part={segment.part}
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

function assistantHasVisiblePart(message: AgentMessage): boolean {
  return message.parts.some((part) => {
    if (isHiddenTranscriptChromePart(part) || isHiddenGrokChromePart(part, message.parts)) {
      return false;
    }
    if (transcriptVisibility(part) === "nested_child") return false;
    if (part.type === "text" || part.type === "thinking") return Boolean(part.text);
    if (part.type === "error") return Boolean(part.message);
    if (part.type === "permission") return part.request.status !== "pending";
    return (
      part.type === "tool_call" ||
      part.type === "session_lifecycle" ||
      part.type === "session_config_change" ||
      part.type === "session_hint"
    );
  });
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
  if (message.role === "user") return <UserMessage message={message} />;

  const assistantText = assistantCopyText(message);
  const showChrome = shouldShowAssistantTurnEndedChrome(message, assistantText);
  const canCollapse = hasCollapsibleAssistantProcess(message);
  if (!assistantHasVisiblePart(message) && !showChrome && !message.streaming) return null;

  const openEvent = (id: string, model: EventViewModel) => {
    onExpand((state) => openLeafSheet(state, id, model));
  };
  const openGroup = (id: string, title: string, models: EventViewModel[]) => {
    onExpand((state) => openGroupSheet(state, id, title, models));
  };

  const segments = segmentAssistantParts(message.parts);
  const { processSegments, tailSegments } = splitSegmentedAssistantParts(segments);
  const worked =
    message.worked_ms != null && message.worked_ms > 0
      ? `Worked for ${formatWorkDuration(message.worked_ms)}`
      : null;
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
          {waitingOpen
            ? waiting.rows.map((row) => (
                <MessagePart
                  key={partKey(message.id, row.part, row.index)}
                  messages={messages}
                  onOpen={openEvent}
                  openId={partKey(message.id, row.part, row.index)}
                  part={row.part}
                  siblings={message.parts}
                  surface="tour"
                />
              ))
            : null}
        </View>
      ) : null}
      {canCollapse && processSegments.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            openGroup(
              `${message.id}:process`,
              worked ?? "Process",
              processSegments
                .flatMap((segment) =>
                  segment.type === "tool_group" ? segment.parts : [segment.part],
                )
                .map((part) => transcriptEventModel(part, message.parts, messages)),
            )
          }
          style={{
            alignItems: "center",
            alignSelf: "flex-start",
            flexDirection: "row",
            gap: 4,
            paddingVertical: 2,
          }}
        >
          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13, lineHeight: 18 }}>
            {worked ?? "Process"}
          </Text>
          <DisclosureChevron />
        </Pressable>
      ) : processSegments.length > 0 ? (
        <View style={{ gap: 6 }}>
          <AssistantSegments
            inProcess
            message={message}
            messages={messages}
            onOpen={openEvent}
            onOpenGroup={openGroup}
            segments={processSegments}
          />
        </View>
      ) : null}
      {tailSegments.length > 0 ? (
        <View style={{ gap: 8, width: "100%" }}>
          <AssistantSegments
            inProcess={false}
            message={message}
            messages={messages}
            onOpen={openEvent}
            onOpenGroup={openGroup}
            segments={tailSegments}
          />
        </View>
      ) : null}
      <AssistantFooter assistantText={assistantText} message={message} visible={showChrome} />
      <AssistantTurnFiles parts={message.parts} visible={showChrome} />
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
  const seenFirstId = useRef<string | undefined>(undefined);

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

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      if (height <= 0) return;
      stickToBottom();
    },
    [stickToBottom],
  );

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      if (height === listHeightRef.current) return;
      listHeightRef.current = height;
      stickToBottom();
    },
    [stickToBottom],
  );

  const [expand, setExpand] = useState<ExpandState>(initialExpandState);
  const rows =
    streaming && !messages.some((message) => message.streaming)
      ? [
          ...messages,
          {
            id: "stream-wait",
            role: "assistant",
            parts: [{ type: "text" as const, text: "" }],
            streaming: true,
          },
        ]
      : messages;
  const firstMessageId = messages[0]?.id;

  useEffect(() => {
    const boundary = expandResetForFirstMessage(seenFirstId.current, firstMessageId);
    if (boundary.reset) {
      useAgentChatExpandStore.getState().reset();
      setExpand(initialExpandState());
    }
    seenFirstId.current = boundary.firstId;
  }, [firstMessageId]);

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
          <ChatMessage expand={expand} message={item} messages={rows} onExpand={setExpand} />
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
