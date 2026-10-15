import { useCallback, useEffect, useRef } from "react";
import {
  FlatList,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { AtmosLogo } from "@/ui/AtmosLogo";
import { EmptyState } from "@/ui/layout/app-screen";
import {
  assistantCopyText,
  DEFAULT_TOOL_CALL_DENSITY,
  hasCollapsibleAssistantProcess,
  isHiddenGrokChromePart,
  isHiddenTranscriptChromePart,
  segmentAssistantParts,
  shouldShowAssistantTurnEndedChrome,
  splitSegmentedAssistantParts,
  transcriptVisibility,
  type AssistantSegment,
} from "@atmos/agent-transcript";
import { AnswerText } from "./answer-text";
import { AssistantFooter, AssistantTurnFiles } from "./assistant-footer";
import { copy } from "./copy";
import { ErrorPart } from "./error-part";
import {
  agentChatInspectExpandKey,
  expandResetForFirstMessage,
  useAgentChatExpandStore,
} from "./expand-store";
import { HistoricPermission } from "./historic-permission";
import { ProcessFold, WaitForBlock } from "./process-fold";
import { SessionChrome } from "./session-chrome";
import { ThinkingBlock } from "./thinking-block";
import { ToolGroup, toolGroupKey } from "./tool-group";
import { showToolRow, ToolCallRow } from "./tool-body";
import { UserMessage } from "./user-message";

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

function segmentKey(messageId: string, segment: AssistantSegment): string {
  if (segment.type === "tool_group") {
    return `${messageId}:group:${toolGroupKey(segment.parts, segment.origIndexes)}`;
  }
  return partKey(messageId, segment.part, segment.origIndex);
}

function InlinePart({
  message,
  part,
  surface,
}: {
  message: AgentMessage;
  part: AgentPart;
  surface: "timeline" | "wait";
}) {
  if (isHiddenTranscriptChromePart(part) || isHiddenGrokChromePart(part, message.parts))
    return null;
  if (part.type === "tool_call") {
    if (!showToolRow(part, surface)) return null;
    return <ToolCallRow part={part} />;
  }
  if (part.type === "text") return <AnswerText part={part} />;
  if (part.type === "thinking") {
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
  return null;
}

function SegmentView({
  message,
  onInspect,
  segment,
}: {
  message: AgentMessage;
  onInspect: () => void;
  segment: AssistantSegment;
}) {
  if (segment.type === "tool_group") {
    return (
      <ToolGroup
        groupKey={toolGroupKey(segment.parts, segment.origIndexes)}
        messageId={message.id}
        onInspect={onInspect}
        origIndexes={segment.origIndexes}
        parts={segment.parts}
        renderPart={(part) => <InlinePart message={message} part={part} surface="timeline" />}
      />
    );
  }
  return <InlinePart message={message} part={segment.part} surface="timeline" />;
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

function AssistantTurn({ message }: { message: AgentMessage }) {
  const assistantText = assistantCopyText(message);
  const showChrome = shouldShowAssistantTurnEndedChrome(message, assistantText);
  if (!assistantHasVisiblePart(message) && !showChrome && !message.streaming) return null;

  const segments = segmentAssistantParts(message.parts, DEFAULT_TOOL_CALL_DENSITY);
  const { processSegments, tailSegments } = splitSegmentedAssistantParts(segments);
  const canCollapse = processSegments.length > 0 && hasCollapsibleAssistantProcess(message);
  const markInspecting = () => {
    useAgentChatExpandStore.getState().setExpand(agentChatInspectExpandKey(message.id), true);
  };

  return (
    <View style={{ gap: 8, width: "100%" }}>
      <WaitForBlock
        messageId={message.id}
        parts={message.parts}
        renderPart={(part) => <InlinePart message={message} part={part} surface="wait" />}
      />
      {processSegments.length > 0 ? (
        <ProcessFold canCollapse={canCollapse} message={message}>
          <View style={{ gap: 6 }}>
            {processSegments.map((segment) => (
              <SegmentView
                key={segmentKey(message.id, segment)}
                message={message}
                onInspect={markInspecting}
                segment={segment}
              />
            ))}
          </View>
        </ProcessFold>
      ) : null}
      {tailSegments.length > 0 ? (
        <View style={{ gap: 8, width: "100%" }}>
          {tailSegments.map((segment) => (
            <SegmentView
              key={segmentKey(message.id, segment)}
              message={message}
              onInspect={markInspecting}
              segment={segment}
            />
          ))}
        </View>
      ) : null}
      <AssistantFooter assistantText={assistantText} message={message} visible={showChrome} />
      <AssistantTurnFiles parts={message.parts} visible={showChrome} />
    </View>
  );
}

function ChatMessage({ message }: { message: AgentMessage }) {
  if (message.role === "user") return <UserMessage message={message} />;
  return <AssistantTurn message={message} />;
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

  const rows =
    streaming && !messages.some((message) => message.streaming)
      ? [
          ...messages,
          {
            id: "stream-wait",
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: "" }],
            streaming: true,
          },
        ]
      : messages;
  const firstMessageId = messages[0]?.id;

  useEffect(() => {
    const boundary = expandResetForFirstMessage(seenFirstId.current, firstMessageId);
    if (boundary.reset) useAgentChatExpandStore.getState().reset();
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
        renderItem={({ item }) => <ChatMessage message={item} />}
        scrollEventThrottle={16}
        style={{ backgroundColor: theme.colors.background, flex: 1 }}
      />
    </View>
  );
}
