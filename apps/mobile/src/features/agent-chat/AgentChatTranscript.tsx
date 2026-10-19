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
import type { AgentToolCallPart } from "@atmos/agent-transcript";
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
  toolGroupHasRunning,
  TRANSCRIPT_END_SLACK_PX,
  transcriptVisibility,
  type AssistantSegment,
  type TranscriptMeasurement,
} from "@atmos/agent-transcript";
import {
  ActivityRow,
  activityRowDuplicatesOpenTree,
  activityRowDuplicatesVisibleTree,
} from "./activity-row";
import { AnswerText } from "./answer-text";
import { AssistantFooter, AssistantTurnFiles } from "./assistant-footer";
import { copy } from "./copy";
import { EdgeFades } from "./edge-fades";
import { ErrorPart } from "./error-part";
import {
  agentChatInspectExpandKey,
  agentChatToolGroupExpandKey,
  expandResetForFirstMessage,
  useAgentChatExpandStore,
} from "./expand-store";
import { HideScrollEdge } from "./hide-scroll-edge";
import { HistoricPermission } from "./historic-permission";
import { InlineSubagentPanel } from "./inline-subagent-panel";
import { inlineSubagentTasksByMessageId } from "./inline-subagent-tasks";
import { useReducedMotion } from "./motion/use-reduced-motion";
import { ProcessFold } from "./process-fold";
import { SessionChrome } from "./session-chrome";
import { initialStickState, reduceStick, type StickAction } from "./stick";
import {
  jumpAlignOffset,
  jumpExtendReadyToRelease,
  jumpFollowsTailAfterMiss,
  nextJumpAlign,
  offsetFromMeasuredStride,
  type JumpAlignMemory,
  stickScrollWhileJumping,
  transcriptItemLayout,
  TRANSCRIPT_JUMP_FALLBACK_STRIDE,
} from "./transcript-jump";
import { ThinkingBlock } from "./thinking-block";
import { ToolGroup, toolGroupKey } from "./tool-group";
import { showToolRow, ToolCallRow } from "./tool-body";
import {
  resolvedPillRowHeight,
  TRANSCRIPT_PAD_SHRINK_BEZIER,
  TRANSCRIPT_PAD_SHRINK_MS,
  transcriptContentEndOffset,
  transcriptListBottomPad,
  transcriptPadShouldEase,
} from "./transcript-pad";
import { UserMessage } from "./user-message";

export type AgentChatTranscriptHandle = {
  measureMessage: (id: string) => { start: number; size: number } | null;
  revealMessage: (id: string) => void;
  scrollToEndAnimated: () => void;
};

type TranscriptStick = {
  belowCount: number;
  distanceFromEnd: number;
  stickToEnd: boolean;
  scrollTop: number;
  viewport: number;
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
  origIndex,
  part,
}: {
  message: AgentMessage;
  origIndex: number;
  part: AgentPart;
}) {
  if (isHiddenTranscriptChromePart(part) || isHiddenGrokChromePart(part, message.parts))
    return null;
  if (part.type === "tool_call") {
    if (!showToolRow(part)) return null;
    return <ToolCallRow part={part} />;
  }
  if (part.type === "text") return <AnswerText part={part} parts={message.parts} />;
  if (part.type === "thinking") {
    return (
      <ThinkingBlock
        messageId={message.id}
        origIndex={origIndex}
        part={part}
        parts={message.parts}
        thinkingMs={message.thinking_ms}
      />
    );
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
        renderPart={(part, origIndex) => (
          <InlinePart message={message} origIndex={origIndex} part={part} />
        )}
      />
    );
  }
  return <InlinePart message={message} origIndex={segment.origIndex} part={segment.part} />;
}

function assistantHasVisiblePart(message: AgentMessage): boolean {
  return message.parts.some((part) => {
    if (isHiddenTranscriptChromePart(part) || isHiddenGrokChromePart(part, message.parts)) {
      return false;
    }
    const visibility = transcriptVisibility(part);
    if (visibility === "nested_child" || visibility === "subagent_wait") return false;
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

/** Web assistant column `w-[calc(100%-1rem)]`: 8px on each side of the gutter. */
const ASSISTANT_COLUMN_INSET = 8;

/** Web `ConversationContent` `py-4`. The overlay spacer stays on top of this. */
const TRANSCRIPT_CONTENT_PAD_Y = 16;

/** Empty list while the turn is open. There is no assistant message to label yet. */
const STREAMING_ACTIVITY_MESSAGE: AgentMessage = {
  id: "streaming-activity",
  parts: [],
  role: "assistant",
  streaming: true,
};

function AssistantTurn({
  inlineTools = [],
  message,
  messages,
  showActivity = false,
}: {
  inlineTools?: readonly AgentToolCallPart[];
  message: AgentMessage;
  messages: readonly AgentMessage[];
  showActivity?: boolean;
}) {
  const expandValues = useAgentChatExpandStore((state) => state.values);
  const assistantText = assistantCopyText(message);
  const showChrome = shouldShowAssistantTurnEndedChrome(message, assistantText);
  if (!assistantHasVisiblePart(message) && !showChrome && !message.streaming && !showActivity) {
    return null;
  }

  const segments = segmentAssistantParts(message.parts, DEFAULT_TOOL_CALL_DENSITY);
  const { processSegments, tailSegments } = splitSegmentedAssistantParts(segments);
  const canCollapse = processSegments.length > 0 && hasCollapsibleAssistantProcess(message);
  const runningGroups = segments.flatMap((segment) => {
    if (segment.type !== "tool_group") return [];
    return [
      {
        key: toolGroupKey(segment.parts, segment.origIndexes),
        running: toolGroupHasRunning(segment.parts),
      },
    ];
  });
  const storedByKey = Object.fromEntries(
    runningGroups.map((group) => [
      group.key,
      expandValues[agentChatToolGroupExpandKey(message.id, group.key)],
    ]),
  );
  const hideDuplicateActivity = activityRowDuplicatesVisibleTree(
    activityRowDuplicatesOpenTree(message),
    runningGroups,
    storedByKey,
  );
  const markInspecting = () => {
    useAgentChatExpandStore.getState().setExpand(agentChatInspectExpandKey(message.id), true);
  };
  return (
    <View style={{ marginHorizontal: ASSISTANT_COLUMN_INSET }}>
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
        <View style={{ width: "100%" }}>
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
      {inlineTools.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <InlineSubagentPanel messages={messages} tools={inlineTools} />
        </View>
      ) : null}
      {showActivity && !hideDuplicateActivity ? <ActivityRow message={message} /> : null}
    </View>
  );
}

const ChatMessage = memo(function ChatMessage({
  inlineTools,
  message,
  messages,
  showActivity = false,
}: {
  inlineTools?: readonly AgentToolCallPart[];
  message: AgentMessage;
  messages: readonly AgentMessage[];
  showActivity?: boolean;
}) {
  if (message.role === "user") {
    return (
      <>
        <UserMessage message={message} />
        {showActivity ? (
          <View style={{ marginHorizontal: ASSISTANT_COLUMN_INSET, marginTop: 8 }}>
            <ActivityRow message={message} />
          </View>
        ) : null}
      </>
    );
  }
  return (
    <AssistantTurn
      inlineTools={inlineTools}
      message={message}
      messages={messages}
      showActivity={showActivity}
    />
  );
});

export const AgentChatTranscript = forwardRef<
  AgentChatTranscriptHandle,
  {
    expandedCardHeight?: number;
    focusMessageId?: string | null;
    messages: AgentMessage[];
    onStickChange?: (next: TranscriptStick) => void;
    subagentExcludeIds?: ReadonlySet<string>;
    /** Real scroll offsets. The stick callback can lag behind `viewRef` during a jump. */
    onViewport?: (next: TranscriptStick) => void;
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
    subagentExcludeIds,
    onViewport,
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
  const programmaticAwayRef = useRef(false);
  const jumpSawAwayRef = useRef(false);
  const jumpRetryIndexRef = useRef(-1);
  const jumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listHeightRef = useRef(0);
  const seenFirstId = useRef<string | undefined>(undefined);
  const seenStickToken = useRef(stickToken);
  const scrolledFocusRef = useRef<string | null>(null);
  const measurementsRef = useRef<Array<TranscriptMeasurement | undefined>>([]);
  const jumpIndexRef = useRef(-1);
  const extendTailRef = useRef(false);
  const extendCommittedRef = useRef(false);
  const pendingJumpRef = useRef<{ animated: boolean; index: number } | null>(null);
  const alignMemoryRef = useRef<JumpAlignMemory | null>(null);
  const alignJumpRef = useRef<() => void>(() => {});
  const [extendTail, setExtendTailState] = useState(false);
  const rowCountRef = useRef(0);
  const viewRef = useRef({ distance: 0, height: 0, scrollTop: 0 });
  const contentHeightRef = useRef(0);
  const rowsRef = useRef<AgentMessage[]>([]);
  const onStickChangeRef = useRef(onStickChange);
  const onViewportRef = useRef(onViewport);
  const [stickToEnd, setStickToEnd] = useState(initialStickState.stickToEnd);
  const [topFade, setTopFade] = useState(false);
  const paddingBottom = useTranscriptBottomPad(expandedCardHeight, pillRowHeight);
  const inlineTasks = useMemo(
    () =>
      inlineSubagentTasksByMessageId(messages, {
        excludeIds: subagentExcludeIds,
        mode: "live",
      }),
    [messages, subagentExcludeIds],
  );
  const syncTopFade = useCallback((scrollTop: number) => {
    const next = scrollTop > 12;
    setTopFade((current) => (current === next ? current : next));
  }, []);

  const emitStick = useCallback((belowCount: number) => {
    onStickChangeRef.current?.({
      belowCount,
      distanceFromEnd: viewRef.current.distance,
      stickToEnd: stickRef.current.stickToEnd,
      scrollTop: viewRef.current.scrollTop,
      viewport: viewRef.current.height,
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

  const emitViewport = useCallback(() => {
    onViewportRef.current?.({
      belowCount: belowRef.current,
      distanceFromEnd: viewRef.current.distance,
      stickToEnd: stickRef.current.stickToEnd,
      scrollTop: viewRef.current.scrollTop,
      viewport: viewRef.current.height,
    });
  }, []);

  const setExtendTail = useCallback((next: boolean) => {
    if (extendTailRef.current === next) return;
    extendTailRef.current = next;
    if (!next) {
      extendCommittedRef.current = false;
      pendingJumpRef.current = null;
    }
    setExtendTailState(next);
  }, []);
  useLayoutEffect(() => {
    if (!extendTail) {
      extendCommittedRef.current = false;
      return;
    }
    extendCommittedRef.current = true;
    const pending = pendingJumpRef.current;
    if (!pending) return;
    pendingJumpRef.current = null;
    let cancelled = false;
    // The native list applies `getItemLayout` after this commit.
    const outer = requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        listRef.current?.scrollToIndex({
          animated: pending.animated,
          index: pending.index,
          viewPosition: 0,
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outer);
    };
  }, [extendTail]);
  const layoutForJump = useCallback(
    (_data: ArrayLike<AgentMessage> | null | undefined, index: number) =>
      transcriptItemLayout(index, measurementsRef.current, AGENT_CHAT_TRANSCRIPT_GAP),
    [],
  );
  const releaseExtendIfRoom = useCallback(() => {
    if (!extendTailRef.current) return;
    if (
      !jumpExtendReadyToRelease(
        jumpIndexRef.current,
        measurementsRef.current,
        viewRef.current.height,
        AGENT_CHAT_TRANSCRIPT_GAP,
        viewRef.current.scrollTop,
      )
    ) {
      return;
    }
    setExtendTail(false);
  }, [setExtendTail]);
  const alignActiveJump = useCallback(() => {
    if (!programmaticAwayRef.current || jumpIndexRef.current < 0) return;
    const target = measurementsRef.current[jumpIndexRef.current];
    if (!target || target.start == null || !(target.size > 0)) return;
    const decision = nextJumpAlign(alignMemoryRef.current, viewRef.current.scrollTop, target.start);
    alignMemoryRef.current = decision.memory;
    if (decision.offset == null) {
      if (decision.memory == null) releaseExtendIfRoom();
      return;
    }
    listRef.current?.scrollToOffset({ animated: false, offset: decision.offset });
  }, [releaseExtendIfRoom]);
  useLayoutEffect(() => {
    alignJumpRef.current = alignActiveJump;
  }, [alignActiveJump]);
  const stopExtend = useCallback(() => {
    jumpIndexRef.current = -1;
    setExtendTail(false);
  }, [setExtendTail]);

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
      releaseExtendIfRoom();
      alignJumpRef.current();
    },
  });

  const scrollContentEnd = useCallback((animated: boolean) => {
    const contentHeight = contentHeightRef.current;
    const viewportHeight = viewRef.current.height;
    // FlatList `scrollToEnd` stops on the last cell. The content size includes
    // the bottom pad, so an unknown size is the only path that keeps that call.
    if (contentHeight <= 0 || viewportHeight <= 0) {
      listRef.current?.scrollToEnd({ animated });
      return;
    }
    listRef.current?.scrollToOffset({
      animated,
      offset: transcriptContentEndOffset(contentHeight, viewportHeight),
    });
  }, []);

  const scrollToEndIfStuck = useCallback(
    (animated: boolean) => {
      if (!stickRef.current.stickToEnd) return;
      scrollContentEnd(animated);
    },
    [scrollContentEnd],
  );

  const applyScrollStick = useCallback(
    (distance: number) => {
      if (programmaticAwayRef.current && distance > TRANSCRIPT_END_SLACK_PX) {
        jumpSawAwayRef.current = true;
      }
      const decision = stickScrollWhileJumping(
        distance,
        programmaticAwayRef.current,
        userDraggedRef.current,
      );
      if (decision === "ignore") return;
      applyStick({
        type: "scroll",
        distance: decision.distance,
        userDragged: decision.userDragged,
      });
    },
    [applyStick],
  );

  const jumpToIndex = useCallback(
    (index: number, animated: boolean) => {
      const measured = measurementsRef.current[index];
      if (
        programmaticAwayRef.current &&
        jumpIndexRef.current === index &&
        measured?.start != null &&
        measured.size > 0 &&
        jumpAlignOffset(viewRef.current.scrollTop, measured.start) == null
      ) {
        return;
      }
      programmaticAwayRef.current = true;
      userDraggedRef.current = false;
      jumpRetryIndexRef.current = -1;
      jumpIndexRef.current = index;
      alignMemoryRef.current = null;
      if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
      applyStick({
        type: "scroll",
        distance: TRANSCRIPT_END_SLACK_PX + 1,
        userDragged: true,
      });
      const earlier = !jumpFollowsTailAfterMiss(index, rowsRef.current.length);
      const needsLayout = earlier && !extendCommittedRef.current;
      const scroll = () => {
        listRef.current?.scrollToIndex({ animated, index, viewPosition: 0 });
      };
      // The estimated tail is on the next commit. Scrolling before that clamps.
      if (needsLayout) {
        pendingJumpRef.current = { animated, index };
        setExtendTail(true);
      } else {
        pendingJumpRef.current = null;
        scroll();
      }
      // If the jump never leaves the end, follow the tail only when the target
      // is the last row. An earlier row stays unstuck so a short tail can grow
      // under it. A jump that already landed away keeps ignoring a stale end.
      jumpTimerRef.current = setTimeout(() => {
        jumpTimerRef.current = null;
        if (!programmaticAwayRef.current || jumpSawAwayRef.current) return;
        if (!jumpFollowsTailAfterMiss(index, rowsRef.current.length)) return;
        programmaticAwayRef.current = false;
        applyStick({
          type: "scroll",
          distance: viewRef.current.distance,
          userDragged: false,
        });
      }, 800);
    },
    [applyStick, setExtendTail],
  );

  const recoverScrollIndex = useCallback((index: number) => {
    const measured = measurementsRef.current[index];
    const offset =
      measured?.start != null && measured.size > 0
        ? Math.max(0, Math.round(measured.start))
        : offsetFromMeasuredStride(
            index,
            measurementsRef.current,
            AGENT_CHAT_TRANSCRIPT_GAP,
            TRANSCRIPT_JUMP_FALLBACK_STRIDE,
          );
    listRef.current?.scrollToOffset({ animated: false, offset });
    if (jumpRetryIndexRef.current === index) return;
    jumpRetryIndexRef.current = index;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ animated: false, index, viewPosition: 0 });
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      measureMessage(id: string) {
        const index = rowsRef.current.findIndex((message) => message.id === id);
        if (index < 0) return null;
        const measurement = measurementsRef.current[index];
        if (!measurement) return null;
        return { size: measurement.size, start: measurement.start };
      },
      revealMessage(id: string) {
        const index = rowsRef.current.findIndex((message) => message.id === id);
        if (index < 0) return;
        jumpToIndex(index, false);
      },
      scrollToEndAnimated() {
        programmaticAwayRef.current = false;
        jumpSawAwayRef.current = false;
        if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
        userDraggedRef.current = false;
        stopExtend();
        applyStick({ type: "scroll", distance: 0, userDragged: false });
        scrollContentEnd(true);
      },
    }),
    [applyStick, jumpToIndex, scrollContentEnd, stopExtend],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const native = event.nativeEvent;
      viewRef.current = {
        distance: distanceFromEnd(native),
        height: native.layoutMeasurement.height,
        scrollTop: native.contentOffset.y,
      };
      syncTopFade(native.contentOffset.y);
      applyScrollStick(viewRef.current.distance);
      publishBelow();
      emitViewport();
      alignJumpRef.current();
    },
    [applyScrollStick, emitViewport, publishBelow, syncTopFade],
  );

  const onScrollBeginDrag = useCallback(() => {
    programmaticAwayRef.current = false;
    jumpSawAwayRef.current = false;
    if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
    userDraggedRef.current = true;
    stopExtend();
  }, [stopExtend]);

  const onScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const native = event.nativeEvent;
      const velocity = native.velocity?.y;
      if (velocity != null && Math.abs(velocity) >= 0.05) return;
      viewRef.current = {
        distance: distanceFromEnd(native),
        height: native.layoutMeasurement.height,
        scrollTop: native.contentOffset.y,
      };
      syncTopFade(native.contentOffset.y);
      applyScrollStick(viewRef.current.distance);
      userDraggedRef.current = false;
      publishBelow();
      emitViewport();
    },
    [applyScrollStick, emitViewport, publishBelow, syncTopFade],
  );

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const native = event.nativeEvent;
      viewRef.current = {
        distance: distanceFromEnd(native),
        height: native.layoutMeasurement.height,
        scrollTop: native.contentOffset.y,
      };
      syncTopFade(native.contentOffset.y);
      applyScrollStick(distanceFromEnd(native));
      userDraggedRef.current = false;
      publishBelow();
      emitViewport();
    },
    [applyScrollStick, emitViewport, publishBelow, syncTopFade],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      if (height <= 0) return;
      contentHeightRef.current = height;
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
      releaseExtendIfRoom();
      if (height === listHeightRef.current) return;
      listHeightRef.current = height;
      scrollToEndIfStuck(false);
    },
    [publishBelow, releaseExtendIfRoom, scrollToEndIfStuck],
  );

  const rows = messages;
  const firstMessageId = messages[0]?.id;

  useLayoutEffect(() => {
    onStickChangeRef.current = onStickChange;
    onViewportRef.current = onViewport;
    rowsRef.current = rows;
    rowCountRef.current = rows.length;
    if (measurementsRef.current.length > rows.length) {
      measurementsRef.current.length = rows.length;
    }
    publishBelow();
  }, [onStickChange, onViewport, publishBelow, rows]);

  useEffect(() => {
    return () => {
      if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
    };
  }, []);

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
    scrollContentEnd(false);
  }, [applyStick, scrollContentEnd, stickToken]);

  useEffect(() => {
    if (!focusMessageId) {
      scrolledFocusRef.current = null;
      return;
    }
    if (scrolledFocusRef.current === focusMessageId) return;
    const index = messages.findIndex((message) => message.id === focusMessageId);
    if (index < 0) return;
    scrolledFocusRef.current = focusMessageId;
    jumpToIndex(index, true);
  }, [focusMessageId, jumpToIndex, messages]);

  return (
    <RowMeasureContext.Provider value={measureApi}>
      <HideScrollEdge style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          CellRendererComponent={MeasureCell}
          keyboardDismissMode="interactive"
          contentContainerStyle={{
            flexGrow: 1,
            gap: AGENT_CHAT_TRANSCRIPT_GAP,
            justifyContent: rows.length === 0 && !streaming ? "center" : "flex-start",
            paddingBottom: paddingBottom + TRANSCRIPT_CONTENT_PAD_Y,
            paddingHorizontal: 18,
            paddingTop: TRANSCRIPT_CONTENT_PAD_Y,
          }}
          contentInsetAdjustmentBehavior="never"
          data={rows}
          getItemLayout={extendTail ? layoutForJump : undefined}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            streaming ? (
              <View style={{ marginHorizontal: ASSISTANT_COLUMN_INSET }}>
                <ActivityRow message={STREAMING_ACTIVITY_MESSAGE} />
              </View>
            ) : (
              <EmptyChat />
            )
          }
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
            recoverScrollIndex(index);
          }}
          renderItem={({ index, item }) => (
            <ChatMessage
              inlineTools={inlineTasks.get(item.id)}
              message={item}
              messages={messages}
              showActivity={index === rows.length - 1 && (streaming || Boolean(item.streaming))}
            />
          )}
          scrollEventThrottle={16}
          style={{ backgroundColor: theme.colors.background, flex: 1 }}
        />
        <EdgeFades topActive={topFade} />
      </HideScrollEdge>
    </RowMeasureContext.Provider>
  );
});
