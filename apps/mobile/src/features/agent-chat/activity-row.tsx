import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import {
  deriveAgentActivityState,
  formatAgentToolActivityLine,
  toolKindHeadlineLabel,
  type AgentActivityState,
} from "@atmos/agent-transcript";
import { copy, toolGroupLabels } from "./copy";

function activityCopy(state: Extract<AgentActivityState, { busy: true }>): string {
  const show = (base: string) => (state.trail === "none" ? base : `${base}...`);
  switch (state.label.type) {
    case "generating":
      return show(copy.activityGenerating);
    case "thinking":
      return show(copy.thinking);
    case "streaming":
      return show(copy.activityStreaming);
    case "creatingSession":
      return show(copy.activityCreatingSession);
    case "resumingSession":
      return show(copy.activityResumingSession);
    case "waiting":
      return show(
        state.label.count <= 1
          ? copy.activityWaitingOne
          : copy.activityWaitingMany.replaceAll("{count}", String(state.label.count)),
      );
    case "tool":
      return (
        formatAgentToolActivityLine(
          state.label.part,
          toolKindHeadlineLabel(state.label.part.kind),
        ) || toolGroupLabels.working
      );
  }
}

export function activityRowLabel(
  message: AgentMessage | null | undefined,
  turnOpen = Boolean(message?.role === "assistant" && message.streaming),
): string {
  if (!message || message.role !== "assistant") return toolGroupLabels.working;
  const state = deriveAgentActivityState([message], turnOpen);
  if (!state.busy) return toolGroupLabels.working;
  return activityCopy(state);
}

// @view

import { useEffect, useState } from "react";
import { Text, View, type TextStyle } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { NumberFlow } from "number-flow-react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { chatMutedForeground } from "./chat-ink";
import {
  ACTIVITY_CLOCK_TICK_MS,
  ACTIVITY_STATUS_SHIFT_PX,
  ACTIVITY_STATUS_SPRING,
  activityClockAnchor,
  activityClockLabel,
  activityClockUnits,
  activityElapsedMs,
} from "./activity-clock";
import { ActivityGlyph } from "./activity-mark";
import { TextShimmer } from "./motion/text-shimmer";
import { useReducedMotion } from "./motion/use-reduced-motion";

const STATUS_LINE: TextStyle = { fontSize: 14, lineHeight: 20 };
const CLOCK_LINE: TextStyle = {
  fontFamily: "Menlo",
  fontSize: 14,
  lineHeight: 14,
};

function ActivityStatus({ label, style }: { label: string; style: TextStyle }) {
  const reduced = useReducedMotion();
  const [stack, setStack] = useState({ current: label, previous: label });
  if (stack.current !== label) {
    setStack({ current: label, previous: stack.current });
  }
  const outgoing = stack.current === stack.previous ? null : stack.previous;
  const currentY = useSharedValue(0);
  const currentOpacity = useSharedValue(1);
  const outgoingY = useSharedValue(0);
  const outgoingOpacity = useSharedValue(0);

  useEffect(() => {
    if (reduced || outgoing == null) {
      currentY.set(0);
      currentOpacity.set(1);
      outgoingY.set(0);
      outgoingOpacity.set(0);
      return;
    }
    let cancel = false;
    const settle = () => {
      if (cancel) return;
      setStack((state) => (state.current === label ? { current: label, previous: label } : state));
    };
    currentY.set(ACTIVITY_STATUS_SHIFT_PX);
    currentOpacity.set(0);
    outgoingY.set(0);
    outgoingOpacity.set(1);
    currentY.set(withSpring(0, ACTIVITY_STATUS_SPRING));
    currentOpacity.set(
      withSpring(1, ACTIVITY_STATUS_SPRING, (finished) => {
        if (finished) runOnJS(settle)();
      }),
    );
    outgoingY.set(withSpring(-ACTIVITY_STATUS_SHIFT_PX, ACTIVITY_STATUS_SPRING));
    outgoingOpacity.set(withSpring(0, ACTIVITY_STATUS_SPRING));
    return () => {
      cancel = true;
    };
  }, [currentOpacity, currentY, label, outgoing, outgoingOpacity, outgoingY, reduced]);

  const currentStyle = useAnimatedStyle(() => ({
    opacity: currentOpacity.get(),
    transform: [{ translateY: currentY.get() }],
  }));
  const outgoingStyle = useAnimatedStyle(() => ({
    opacity: outgoingOpacity.get(),
    transform: [{ translateY: outgoingY.get() }],
  }));
  const textStyle = [style, STATUS_LINE];

  return (
    <View style={styles.status}>
      <Text accessible={false} numberOfLines={1} style={[textStyle, styles.sizer]}>
        {stack.current}
      </Text>
      <Animated.View style={[styles.overlay, currentStyle]}>
        <TextShimmer duration={1.5} numberOfLines={1} style={textStyle}>
          {stack.current}
        </TextShimmer>
      </Animated.View>
      {outgoing != null ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.overlay, outgoingStyle]}
        >
          <TextShimmer duration={1.5} numberOfLines={1} style={textStyle}>
            {outgoing}
          </TextShimmer>
        </Animated.View>
      ) : null}
    </View>
  );
}

function ActivityClock({
  messageId,
  workedMs,
}: {
  messageId: string;
  workedMs: number | null | undefined;
}) {
  const theme = useMobileTheme();
  const reduced = useReducedMotion();
  const [anchor] = useState(() => activityClockAnchor(messageId, workedMs));
  const [elapsed, setElapsed] = useState(() => activityElapsedMs(anchor));

  useEffect(() => {
    const tick = () => setElapsed(activityElapsedMs(anchor));
    tick();
    const timer = setInterval(tick, ACTIVITY_CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [anchor]);

  const label = activityClockLabel(elapsed);
  const style = { ...CLOCK_LINE, color: chatMutedForeground(theme.isDark) };
  if (reduced) {
    return (
      <Text accessibilityLabel={label} style={style}>
        {label}
      </Text>
    );
  }

  return (
    <View accessibilityLabel={label} style={styles.clock}>
      {activityClockUnits(elapsed).map((part) => (
        <View key={part.unit} style={styles.clockUnit}>
          <NumberFlow respectMotionPreference style={style} value={part.value} />
          <Text style={style}>{part.unit}</Text>
        </View>
      ))}
    </View>
  );
}

export function ActivityRow({ message, turnOpen }: { message: AgentMessage; turnOpen?: boolean }) {
  const theme = useMobileTheme();
  const open = turnOpen ?? Boolean(message.streaming);
  const state = deriveAgentActivityState([message], open);
  const kind = state.busy && state.kind === "thinking" ? "thinking" : "working";
  const label = activityRowLabel(message, turnOpen);
  return (
    <View style={styles.row}>
      <ActivityGlyph kind={kind} />
      <ActivityStatus label={label} style={{ color: chatMutedForeground(theme.isDark) }} />
      <ActivityClock key={message.id} messageId={message.id} workedMs={message.worked_ms} />
    </View>
  );
}

const styles = {
  clock: {
    alignItems: "baseline" as const,
    flexDirection: "row" as const,
    flexShrink: 0,
  },
  clockUnit: {
    alignItems: "baseline" as const,
    flexDirection: "row" as const,
  },
  overlay: {
    left: 0,
    position: "absolute" as const,
    top: 0,
  },
  row: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 8,
    paddingVertical: 2,
  },
  sizer: {
    opacity: 0,
  },
  status: {
    flexShrink: 1,
    height: 20,
    justifyContent: "center" as const,
    overflow: "hidden" as const,
  },
};
