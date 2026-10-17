import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { AgentMessage, AgentPart, AgentTurnUsage } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { CoinsIcon, FileTextIcon } from "@/ui/icons/lucide-native";
import {
  compactTurnTokenLabel,
  copy,
  filesChangedLabel,
  filesShowMoreLabel,
  workedForPresentation,
  workedForVisibleKind,
} from "./copy";
import { CopyMessageButton } from "./copy-message-button";
import { useReducedMotion } from "./motion/use-reduced-motion";
import {
  collectTurnFileChanges,
  fileChangeName,
  visibleTurnFileChanges,
} from "./turn-file-changes";
import { TOOL_ADDITION_COLOR, TOOL_DELETION_COLOR } from "./tool-body";
import { TURN_FILES_RADIUS, turnFilesBorder, turnFilesFill } from "./turn-files-chrome";

function UsageBreakdown({ usage }: { usage: AgentTurnUsage }) {
  const theme = useMobileTheme();
  const total = usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
  const row = (label: string, value: number) => (
    <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 11, lineHeight: 16 }}>
        {label}
      </Text>
      <Text
        style={{ color: theme.colors.label, fontFamily: "Menlo", fontSize: 11, lineHeight: 16 }}
      >
        {value.toLocaleString("en-US")}
      </Text>
    </View>
  );

  return (
    <View
      style={{
        backgroundColor: theme.colors.cardElevated,
        borderColor: theme.colors.glassBorder,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        gap: 6,
        marginTop: 8,
        padding: 12,
      }}
    >
      <Text style={{ color: theme.colors.label, fontSize: 12, fontWeight: "600", lineHeight: 16 }}>
        {copy.usageTurn.title}
      </Text>
      {row(copy.usageTurn.input, usage.input_tokens ?? 0)}
      {row(copy.usageTurn.output, usage.output_tokens ?? 0)}
      {usage.thought_tokens != null ? row(copy.usageTurn.thought, usage.thought_tokens) : null}
      {usage.cached_read_tokens != null || usage.cached_write_tokens != null ? (
        <View style={{ gap: 6 }}>
          {usage.cached_read_tokens != null
            ? row(copy.usageTurn.cacheRead, usage.cached_read_tokens)
            : null}
          {usage.cached_write_tokens != null
            ? row(copy.usageTurn.cacheWrite, usage.cached_write_tokens)
            : null}
        </View>
      ) : null}
      {row(copy.usageTurn.total, total)}
    </View>
  );
}

function UsageBadge({ usage }: { usage: AgentTurnUsage }) {
  const theme = useMobileTheme();
  const label = compactTurnTokenLabel(usage);
  const [open, setOpen] = useState(false);
  if (!label) return null;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={{
          alignItems: "center",
          borderColor: theme.colors.glassBorder,
          borderRadius: 999,
          borderStyle: "dashed",
          borderWidth: StyleSheet.hairlineWidth,
          flexDirection: "row",
          gap: 6,
          paddingHorizontal: 8,
          paddingVertical: 4,
        }}
      >
        <CoinsIcon color={theme.colors.secondaryLabel} size={12} />
        <Text
          style={{
            color: theme.colors.secondaryLabel,
            fontSize: 10,
            fontWeight: "500",
            lineHeight: 14,
          }}
        >
          {label}
        </Text>
      </Pressable>
      {open ? <UsageBreakdown usage={usage} /> : null}
    </View>
  );
}

const WORKED_FOR_SWAP_MS = 200;
const WORKED_FOR_SWAP = {
  duration: WORKED_FOR_SWAP_MS,
  easing: Easing.bezier(0, 0, 0.58, 1),
} as const;

function WorkedForLabel({
  completedAt,
  workedMs,
}: {
  completedAt: string;
  workedMs: number | null | undefined;
}) {
  const theme = useMobileTheme();
  const reduced = useReducedMotion();
  const presentation = workedForPresentation(workedMs, completedAt);
  const [showDuration, setShowDuration] = useState(false);
  const hasDuration = presentation.durationLabel != null;
  const hasClock = presentation.clock != null;
  const visible = workedForVisibleKind({ hasClock, hasDuration, showDuration });
  const durationOpacity = useSharedValue(visible === "duration" ? 1 : 0);
  const clockOpacity = useSharedValue(visible === "clock" ? 1 : 0);

  useEffect(() => {
    const nextDuration = visible === "duration" ? 1 : 0;
    const nextClock = visible === "clock" ? 1 : 0;
    if (reduced) {
      durationOpacity.set(nextDuration);
      clockOpacity.set(nextClock);
      return;
    }
    durationOpacity.set(withTiming(nextDuration, WORKED_FOR_SWAP));
    clockOpacity.set(withTiming(nextClock, WORKED_FOR_SWAP));
  }, [clockOpacity, durationOpacity, reduced, visible]);

  const durationStyle = useAnimatedStyle(() => ({ opacity: durationOpacity.get() }));
  const clockStyle = useAnimatedStyle(() => ({ opacity: clockOpacity.get() }));

  if (visible == null) return null;
  const textStyle = { color: theme.colors.secondaryLabel, fontSize: 12, lineHeight: 16 };
  if (!hasDuration || !hasClock) {
    return (
      <View style={styles.workedFor}>
        <Text style={textStyle}>
          {hasDuration ? presentation.durationLabel : presentation.clock}
        </Text>
      </View>
    );
  }

  const label = visible === "duration" ? presentation.durationLabel : presentation.clock;
  return (
    <Pressable
      accessibilityLabel={label ?? undefined}
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => setShowDuration((current) => !current)}
    >
      <View style={styles.workedFor}>
        <Text accessible={false} style={[textStyle, styles.sizer]}>
          {presentation.clock}
        </Text>
        <View pointerEvents="none" style={styles.overlay}>
          <Animated.Text style={[textStyle, clockStyle]}>{presentation.clock}</Animated.Text>
        </View>
        <View pointerEvents="none" style={styles.overlay}>
          <Animated.Text style={[textStyle, durationStyle]}>
            {presentation.durationLabel}
          </Animated.Text>
        </View>
      </View>
    </Pressable>
  );
}

function FileStats({ additions, deletions }: { additions: number; deletions: number }) {
  if (additions <= 0 && deletions <= 0) return null;
  return (
    <Text style={{ fontFamily: "Menlo", fontSize: 12, lineHeight: 16 }}>
      {additions > 0 ? <Text style={{ color: TOOL_ADDITION_COLOR }}>+{additions}</Text> : null}
      {additions > 0 && deletions > 0 ? " " : null}
      {deletions > 0 ? <Text style={{ color: TOOL_DELETION_COLOR }}>-{deletions}</Text> : null}
    </Text>
  );
}

export function AssistantFooter({
  assistantText,
  message,
  visible,
}: {
  assistantText: string;
  message: Pick<AgentMessage, "completed_at" | "usage" | "worked_ms">;
  visible: boolean;
}) {
  if (!visible) return null;
  const text = assistantText.trim();
  const usage = message.usage ?? null;
  const showUsage = usage != null && compactTurnTokenLabel(usage) != null;
  const worked = message.completed_at
    ? workedForPresentation(message.worked_ms, message.completed_at)
    : null;
  const showWorked = Boolean(worked && (worked.durationLabel || worked.clock));
  if (!text && !showUsage && !showWorked) return null;

  return (
    <View
      style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}
    >
      {text ? <CopyMessageButton label={copy.copyAssistantAria} text={text} /> : null}
      {showUsage && usage ? <UsageBadge usage={usage} /> : null}
      {showWorked && message.completed_at ? (
        <WorkedForLabel completedAt={message.completed_at} workedMs={message.worked_ms} />
      ) : null}
    </View>
  );
}

export function AssistantTurnFiles({ parts, visible }: { parts: AgentPart[]; visible: boolean }) {
  const theme = useMobileTheme();
  const [expanded, setExpanded] = useState(false);
  if (!visible) return null;
  const changes = collectTurnFileChanges(parts);
  if (changes.length === 0) return null;
  const { shown, hidden } = visibleTurnFileChanges(changes, expanded);

  return (
    <View
      style={{
        backgroundColor: turnFilesFill(theme.isDark),
        borderColor: turnFilesBorder(theme.isDark),
        borderCurve: "continuous",
        borderRadius: TURN_FILES_RADIUS,
        borderWidth: 1,
        marginTop: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 }}>
        {filesChangedLabel(changes.length)}
      </Text>
      <View style={{ marginTop: 4 }}>
        {shown.map((change) => (
          <View
            key={change.path}
            style={{
              alignItems: "center",
              flexDirection: "row",
              gap: 8,
              paddingHorizontal: 6,
              paddingVertical: 4,
            }}
          >
            <FileTextIcon color={theme.colors.secondaryLabel} size={16} />
            <Text
              numberOfLines={1}
              style={{ color: theme.colors.label, flex: 1, fontSize: 14, lineHeight: 20 }}
            >
              {fileChangeName(change.path)}
            </Text>
            <FileStats additions={change.additions} deletions={change.deletions} />
          </View>
        ))}
      </View>
      {hidden > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((current) => !current)}
          style={{ alignSelf: "flex-start", marginTop: 2, paddingVertical: 4 }}
        >
          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 }}>
            {expanded ? copy.filesShowLess : filesShowMoreLabel(hidden)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  sizer: {
    opacity: 0,
  },
  workedFor: {
    height: 24,
    justifyContent: "center",
  },
});
