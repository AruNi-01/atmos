import {
  createContext,
  forwardRef,
  memo,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  FlatList,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { AtmosLogo } from "@/ui/AtmosLogo";
import { EmptyState } from "@/ui/layout/app-screen";
import {
  AGENT_CHAT_TRANSCRIPT_GAP,
  assistantCopyText,
  countMessagesBelowViewport,
  DEFAULT_TOOL_CALL_DENSITY,
  hasCollapsibleAssistantProcess,
  isHiddenGrokChromePart,
  isHiddenTranscriptChromePart,
  segmentAssistantParts,
  shouldShowAssistantTurnEndedChrome,
  splitSegmentedAssistantParts,
  TRANSCRIPT_END_SLACK_PX,
  transcriptVisibility,
  type AssistantSegment,
  type TranscriptMeasurement,
} from "@atmos/agent-transcript";
import { ActivityRow } from "./activity-row";
import { AnswerText } from "./answer-text";
import { AssistantFooter, AssistantTurnFiles } from "./assistant-footer";
import { copy } from "./copy";
import { EdgeFades } from "./edge-fades";
import { ErrorPart } from "./error-part";
import {
  agentChatInspectExpandKey,
  expandResetForFirstMessage,
  useAgentChatExpandStore,
} from "./expand-store";
import { HistoricPermission } from "./historic-permission";
import { useReducedMotion } from "./motion/use-reduced-motion";
import { ProcessFold, WaitForBlock } from "./process-fold";
import { SessionChrome } from "./session-chrome";
import { initialStickState, reduceStick, type StickAction } from "./stick";
import { ThinkingBlock } from "./thinking-block";
import { ToolGroup, toolGroupKey } from "./tool-group";
import { showToolRow, ToolCallRow } from "./tool-body";
import {
  resolvedPillRowHeight,
  TRANSCRIPT_PAD_SHRINK_BEZIER,
  TRANSCRIPT_PAD_SHRINK_MS,
  transcriptListBottomPad,
  transcriptPadShouldEase,
} from "./transcript-pad";
import { UserMessage } from "./user-message";

export type AgentChatTranscriptHandle = {
  scrollToEndAnimated: () => void;
};

type TranscriptStick = {
  belowCount: number;
  stickToEnd: boolean;
};

type RowMeasureApi = {
  clear: (index: number) => void;
  set: (index: number, measurement: TranscriptMeasurement) => void;
};

const RowMeasureContext = createContext<RefObject<RowMeasureApi> | null>(null);

function distanceFromEnd(event: NativeScrollEvent): number {
  const { contentOffset, contentSize, layoutMeasurement } = event;
  return contentSize.height - layoutMeasurement.height - contentOffset.y;
}

function useTranscriptBottomPad(expandedCardHeight: number, pillRowHeight: number): number {
  const reduced = useReducedMotion();
  const target = transcriptListBottomPad(
    expandedCardHeight,
    resolvedPillRowHeight(true, pillRowHeight),
  );
  const pad = useSharedValue(target);
  const [padPx, setPadPx] = useState(target);
  const previousTarget = useRef(target);
  const previousReduced = useRef(reduced);
  const commitPad = useCallback((next: number) => {
    setPadPx((current) => (current === next ? current : next));
  }, []);

  useEffect(() => {
    const previous = previousTarget.current;
    const reducedChanged = previousReduced.current !== reduced;
    previousReduced.current = reduced;
    if (previous === target && !reducedChanged) return;
    const ease = previous !== target && transcriptPadShouldEase(previous, target, reduced);
    previousTarget.current = target;
    if (!ease) {
      cancelAnimation(pad);
      pad.set(target);
      commitPad(target);
      return;
    }
    pad.set(
      withTiming(target, {
        duration: TRANSCRIPT_PAD_SHRINK_MS,
        easing: Easing.bezier(
          TRANSCRIPT_PAD_SHRINK_BEZIER[0],
          TRANSCRIPT_PAD_SHRINK_BEZIER[1],
          TRANSCRIPT_PAD_SHRINK_BEZIER[2],
          TRANSCRIPT_PAD_SHRINK_BEZIER[3],
        ),
      }),
    );
  }, [commitPad, pad, reduced, target]);

  useAnimatedReaction(
    () => Math.round(pad.get()),
    (rounded, previous) => {
      if (previous != null && rounded === previous) return;
      scheduleOnRN(commitPad, rounded);
    },
    [commitPad, pad],
  );

  return padPx;
}

function MeasureCell({
  children,
  index,
  onLayout,
  style,
}: {
  children?: ReactNode;
  index: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const api = useContext(RowMeasureContext);
  useEffect(() => {
    const measure = api?.current;
    return () => {
      measure?.clear(index);
    };
  }, [api, index]);

  return (
    <View
      onLayout={(event) => {
        onLayout?.(event);
        const { height, y } = event.nativeEvent.layout;
        api?.current?.set(index, { size: height, start: y });
      }}
      style={style}
    >
      {children}
    </View>
  );
}

function EmptyChat() {
  return (
    <View style={{ alignItems: "center", gap: 28 }}>
      <AtmosLogo />
      <EmptyState message={copy.emptyDescription} title={copy.emptyTitle} />
    </View>
  );
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
  if (part.type === "text") return <AnswerText part={part} parts={message.parts} />;
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

function AssistantTurn({
  message,
  showActivity = false,
}: {
  message: AgentMessage;
  showActivity?: boolean;
}) {
  const assistantText = assistantCopyText(message);
  const showChrome = shouldShowAssistantTurnEndedChrome(message, assistantText);
  if (!assistantHasVisiblePart(message) && !showChrome && !message.streaming && !showActivity) {
    return null;
  }

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
          {processSegments.map((segment) => (
            <SegmentView
              key={segmentKey(message.id, segment)}
              message={message}
              onInspect={markInspecting}
              segment={segment}
            />
          ))}
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
      {showActivity ? <ActivityRow message={message} /> : null}
    </View>
  );
}

const ChatMessage = memo(function ChatMessage({
  message,
  showActivity = false,
}: {
  message: AgentMessage;
  showActivity?: boolean;
}) {
  if (message.role === "user") return <UserMessage message={message} />;
  return <AssistantTurn message={message} showActivity={showActivity} />;
});

export const AgentChatTranscript = forwardRef<
  AgentChatTranscriptHandle,
  {
    expandedCardHeight?: number;
    focusMessageId?: string | null;
    messages: AgentMessage[];
    onStickChange?: (next: TranscriptStick) => void;
    pillRowHeight?: number;
    stickToken?: number;
    streaming?: boolean;
  }
>(function AgentChatTranscript(
  {
    expandedCardHeight = 0,
    focusMessageId,
    messages,
    onStickChange,
    pillRowHeight = 0,
    stickToken = 0,
    streaming = false,
  },
  ref,
) {
  const theme = useMobileTheme();
  const listRef = useRef<FlatList<AgentMessage>>(null);
  const stickRef = useRef(initialStickState);
  const belowRef = useRef(0);
  const userDraggedRef = useRef(false);
  const listHeightRef = useRef(0);
  const seenFirstId = useRef<string | undefined>(undefined);
  const seenStickToken = useRef(stickToken);
  const scrolledFocusRef = useRef<string | null>(null);
  const measurementsRef = useRef<Array<TranscriptMeasurement | undefined>>([]);
  const rowCountRef = useRef(0);
  const viewRef = useRef({ height: 0, scrollTop: 0 });
  const onStickChangeRef = useRef(onStickChange);
  const [stickToEnd, setStickToEnd] = useState(initialStickState.stickToEnd);
  const paddingBottom = useTranscriptBottomPad(expandedCardHeight, pillRowHeight);

  const emitStick = useCallback((belowCount: number) => {
    onStickChangeRef.current?.({
      belowCount,
      stickToEnd: stickRef.current.stickToEnd,
    });
  }, []);

  const publishBelow = useCallback(() => {
    const next = countMessagesBelowViewport(
      measurementsRef.current,
      rowCountRef.current,
      viewRef.current,
    );
    if (next === belowRef.current) return;
    belowRef.current = next;
    emitStick(next);
  }, [emitStick]);

  const applyStick = useCallback(
    (action: StickAction) => {
      const next = reduceStick(stickRef.current, action);
      if (next === stickRef.current) return;
      stickRef.current = next;
      setStickToEnd(next.stickToEnd);
      emitStick(belowRef.current);
    },
    [emitStick],
  );

  const measureApi = useRef<RowMeasureApi>({
    clear(index) {
      if (measurementsRef.current[index] === undefined) return;
      measurementsRef.current[index] = undefined;
      publishBelow();
    },
    set(index, measurement) {
      const current = measurementsRef.current[index];
      if (current && current.start === measurement.start && current.size === measurement.size) {
        return;
      }
      measurementsRef.current[index] = measurement;
      publishBelow();
    },
  });

  const scrollToEndIfStuck = useCallback((animated: boolean) => {
    if (!stickRef.current.stickToEnd) return;
    listRef.current?.scrollToEnd({ animated });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollToEndAnimated() {
        userDraggedRef.current = false;
        applyStick({ type: "scroll", distance: 0, userDragged: false });
        listRef.current?.scrollToEnd({ animated: true });
      },
    }),
    [applyStick],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const native = event.nativeEvent;
      viewRef.current = {
        height: native.layoutMeasurement.height,
        scrollTop: native.contentOffset.y,
      };
      applyStick({
        type: "scroll",
        distance: distanceFromEnd(native),
        userDragged: userDraggedRef.current,
      });
      publishBelow();
    },
    [applyStick, publishBelow],
  );

  const onScrollBeginDrag = useCallback(() => {
    userDraggedRef.current = true;
  }, []);

  const onScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const native = event.nativeEvent;
      const velocity = native.velocity?.y;
      if (velocity != null && Math.abs(velocity) >= 0.05) return;
      viewRef.current = {
        height: native.layoutMeasurement.height,
        scrollTop: native.contentOffset.y,
      };
      applyStick({
        type: "scroll",
        distance: distanceFromEnd(native),
        userDragged: userDraggedRef.current,
      });
      userDraggedRef.current = false;
      publishBelow();
    },
    [applyStick, publishBelow],
  );

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const native = event.nativeEvent;
      viewRef.current = {
        height: native.layoutMeasurement.height,
        scrollTop: native.contentOffset.y,
      };
      applyStick({
        type: "scroll",
        distance: distanceFromEnd(native),
        userDragged: userDraggedRef.current,
      });
      userDraggedRef.current = false;
      publishBelow();
    },
    [applyStick, publishBelow],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      if (height <= 0) return;
      stickRef.current = reduceStick(stickRef.current, { type: "content_growth" });
      if (!stickRef.current.stickToEnd) return;
      scrollToEndIfStuck(false);
    },
    [scrollToEndIfStuck],
  );

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      viewRef.current = { ...viewRef.current, height };
      publishBelow();
      if (height === listHeightRef.current) return;
      listHeightRef.current = height;
      scrollToEndIfStuck(false);
    },
    [publishBelow, scrollToEndIfStuck],
  );

  const rows = useMemo(() => {
    if (streaming && !messages.some((message) => message.streaming)) {
      return [
        ...messages,
        {
          id: "stream-wait",
          role: "assistant" as const,
          parts: [{ type: "text" as const, text: "" }],
          streaming: true,
        },
      ];
    }
    return messages;
  }, [messages, streaming]);
  const firstMessageId = messages[0]?.id;

  useLayoutEffect(() => {
    onStickChangeRef.current = onStickChange;
    rowCountRef.current = rows.length;
    if (measurementsRef.current.length > rows.length) {
      measurementsRef.current.length = rows.length;
    }
    publishBelow();
  }, [onStickChange, publishBelow, rows]);

  useEffect(() => {
    const boundary = expandResetForFirstMessage(seenFirstId.current, firstMessageId);
    if (boundary.reset) useAgentChatExpandStore.getState().reset();
    seenFirstId.current = boundary.firstId;
  }, [firstMessageId]);

  useEffect(() => {
    if (stickToken === seenStickToken.current) return;
    seenStickToken.current = stickToken;
    userDraggedRef.current = false;
    applyStick({ type: "own_send" });
    listRef.current?.scrollToEnd({ animated: false });
  }, [applyStick, stickToken]);

  useEffect(() => {
    if (!focusMessageId) {
      scrolledFocusRef.current = null;
      return;
    }
    if (scrolledFocusRef.current === focusMessageId) return;
    const index = messages.findIndex((message) => message.id === focusMessageId);
    if (index < 0) return;
    scrolledFocusRef.current = focusMessageId;
    userDraggedRef.current = false;
    applyStick({
      type: "scroll",
      distance: TRANSCRIPT_END_SLACK_PX + 1,
      userDragged: true,
    });
    listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0 });
  }, [applyStick, focusMessageId, messages]);

  return (
    <RowMeasureContext.Provider value={measureApi}>
      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          CellRendererComponent={MeasureCell}
          keyboardDismissMode="interactive"
          contentContainerStyle={{
            flexGrow: 1,
            gap: AGENT_CHAT_TRANSCRIPT_GAP,
            justifyContent: rows.length === 0 ? "center" : "flex-start",
            paddingBottom,
            paddingHorizontal: 18,
            paddingTop: 12,
          }}
          contentInsetAdjustmentBehavior="never"
          data={rows}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyChat />}
          maintainVisibleContentPosition={
            stickToEnd ? undefined : { autoscrollToTopThreshold: 10, minIndexForVisible: 0 }
          }
          onContentSizeChange={onContentSizeChange}
          onLayout={onLayout}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onScroll={onScroll}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          onScrollToIndexFailed={({ index }) => {
            listRef.current?.scrollToOffset({ animated: false, offset: Math.max(0, index) * 80 });
          }}
          renderItem={({ index, item }) => (
            <ChatMessage
              message={item}
              showActivity={
                index === rows.length - 1 &&
                item.role === "assistant" &&
                (streaming || Boolean(item.streaming))
              }
            />
          )}
          scrollEventThrottle={16}
          style={{ backgroundColor: theme.colors.background, flex: 1 }}
        />
        <EdgeFades />
      </View>
    </RowMeasureContext.Provider>
  );
});
