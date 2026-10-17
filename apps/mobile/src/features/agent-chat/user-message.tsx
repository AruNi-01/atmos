import { useEffect, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type TextLayoutEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import {
  USER_MESSAGE_COLLAPSE_FADE_LINES,
  USER_MESSAGE_COLLAPSE_LINES,
  formatUserMessageTime,
  textFromParts,
} from "@atmos/agent-transcript";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronDownIcon, ChevronUpIcon } from "@/ui/icons/lucide-native";
import {
  attachmentChipLabel,
  copy,
  isPendingPhoneUserEcho,
  userMessageDisplayText,
  userMessageIsCollapsed,
} from "./copy";
import {
  agentChatUserBodyExpandKey,
  agentChatUserMetaExpandKey,
  useAgentChatExpand,
} from "./expand-store";
import { useReducedMotion } from "./motion/use-reduced-motion";
import {
  USER_META_EASE,
  USER_META_LIFT_PX,
  userMetaHeightMotion,
  userMetaItemMotion,
} from "./user-message-meta";
import { userMessageCollapsedLineLimit, userMessageWashColors } from "./user-message-fade";

const TEXT_LINE_HEIGHT = 20;

function UserMessageCollapseFade() {
  const theme = useMobileTheme();
  const [from, to] = userMessageWashColors(theme.colors.cardSubtle);
  return (
    <LinearGradient
      colors={[from, to]}
      end={{ x: 0, y: 1 }}
      pointerEvents="none"
      start={{ x: 0, y: 0 }}
      style={{
        bottom: 0,
        height: TEXT_LINE_HEIGHT * USER_MESSAGE_COLLAPSE_FADE_LINES,
        left: 0,
        position: "absolute",
        right: 0,
      }}
    />
  );
}

const META_EASE = Easing.bezier(
  USER_META_EASE[0],
  USER_META_EASE[1],
  USER_META_EASE[2],
  USER_META_EASE[3],
);

function UserMetaItem({
  children,
  index,
  open,
}: {
  children: ReactNode;
  index: number;
  open: boolean;
}) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(open ? 1 : 0);
  const lift = useSharedValue(open || reduced ? 0 : USER_META_LIFT_PX);

  useEffect(() => {
    if (reduced) {
      opacity.set(open ? 1 : 0);
      lift.set(0);
      return;
    }
    const motion = userMetaItemMotion(open, index);
    opacity.set(
      withDelay(
        motion.delay,
        withTiming(open ? 1 : 0, { duration: motion.opacityMs, easing: META_EASE }),
      ),
    );
    lift.set(
      withDelay(
        motion.delay,
        withTiming(open ? 0 : USER_META_LIFT_PX, {
          duration: motion.translateMs,
          easing: META_EASE,
        }),
      ),
    );
  }, [index, lift, opacity, open, reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: lift.get() }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

function UserMessageMeta({
  open,
  text,
  time,
}: {
  open: boolean;
  text: string;
  time: string | null;
}) {
  const theme = useMobileTheme();
  const reduced = useReducedMotion();
  const measured = useSharedValue(0);
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    const target = open ? 1 : 0;
    if (reduced) {
      progress.set(target);
      return;
    }
    const motion = userMetaHeightMotion(open);
    progress.set(
      withDelay(motion.delay, withTiming(target, { duration: motion.duration, easing: META_EASE })),
    );
  }, [open, progress, reduced]);

  const clipStyle = useAnimatedStyle(() => ({
    height: measured.get() * progress.get(),
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (next > 0 && measured.get() !== next) measured.set(next);
  };

  const showCopy = text.trim().length > 0;
  const timeIndex = time ? 0 : -1;
  const copyIndex = showCopy ? (time ? 1 : 0) : -1;

  return (
    <Animated.View
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? "auto" : "no-hide-descendants"}
      pointerEvents={open ? "auto" : "none"}
      style={[{ overflow: "hidden" }, clipStyle]}
    >
      <View onLayout={onLayout} style={styles.metaRow}>
        {time ? (
          <UserMetaItem index={timeIndex} open={open}>
            <Text style={[styles.metaTime, { color: theme.colors.secondaryLabel }]}>{time}</Text>
          </UserMetaItem>
        ) : null}
        {showCopy ? (
          <UserMetaItem index={copyIndex} open={open}>
            <CopyMessageButton text={text} />
          </UserMetaItem>
        ) : null}
      </View>
    </Animated.View>
  );
}

function CopyMessageButton({ text }: { text: string }) {
  const theme = useMobileTheme();
  return (
    <Pressable
      accessibilityLabel={copy.copyMessage}
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => {
        void Clipboard.setStringAsync(text);
      }}
    >
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12, lineHeight: 16 }}>
        {copy.copyMessage}
      </Text>
    </Pressable>
  );
}

export function UserMessage({ message }: { message: AgentMessage }) {
  const theme = useMobileTheme();
  const entryId = message.id;
  const text = textFromParts(message.parts);
  const display = userMessageDisplayText(text);
  const attachments = message.parts.filter((part) => part.type === "attachment");
  const time = formatUserMessageTime(message.created_at, "en");
  const hasMeta = Boolean(time) || text.trim().length > 0;
  const [expanded, setExpanded] = useAgentChatExpand(agentChatUserBodyExpandKey(entryId), false);
  const [metaOpen, setMetaOpen] = useAgentChatExpand(agentChatUserMetaExpandKey(entryId), false);
  const [lineCount, setLineCount] = useState(0);
  const collapsed = userMessageIsCollapsed(lineCount, expanded);
  const pending = isPendingPhoneUserEcho(message);

  if (!text && attachments.length === 0 && !time) return null;

  const onTextLayout = (event: TextLayoutEvent) => {
    if (collapsed) return;
    const next = event.nativeEvent.lines.length;
    setLineCount((current) => (current === next ? current : next));
  };

  return (
    <View
      style={{
        alignSelf: "stretch",
        backgroundColor: theme.colors.cardSubtle,
        borderCurve: "continuous",
        borderRadius: 16,
        opacity: pending ? 0.65 : 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
        width: "100%",
      }}
    >
      <Pressable
        accessibilityRole={hasMeta ? "button" : undefined}
        accessibilityState={hasMeta ? { expanded: metaOpen } : undefined}
        disabled={!hasMeta}
        onPress={() => setMetaOpen(!metaOpen)}
      >
        {attachments.length > 0 ? (
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: text ? 8 : 0 }}
          >
            {attachments.map((part, index) => (
              <View
                key={`${part.path}:${index}`}
                style={{
                  backgroundColor: theme.colors.control,
                  borderColor: theme.colors.glassBorder,
                  borderCurve: "continuous",
                  borderRadius: 999,
                  borderWidth: StyleSheet.hairlineWidth,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: theme.colors.label, fontSize: 12, lineHeight: 16 }}>
                  {attachmentChipLabel(part)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {text ? (
          <View style={{ position: "relative" }}>
            <Text
              numberOfLines={collapsed ? userMessageCollapsedLineLimit() : undefined}
              onTextLayout={onTextLayout}
              selectable
              style={{ color: theme.colors.label, fontSize: 14, lineHeight: TEXT_LINE_HEIGHT }}
            >
              {display}
            </Text>
            {collapsed ? <UserMessageCollapseFade /> : null}
          </View>
        ) : null}
      </Pressable>
      {lineCount > USER_MESSAGE_COLLAPSE_LINES ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          hitSlop={8}
          onPress={() => setExpanded(!expanded)}
          style={{ alignSelf: "flex-start", marginTop: 4 }}
        >
          {expanded ? (
            <ChevronUpIcon color={theme.colors.secondaryLabel} size={16} />
          ) : (
            <ChevronDownIcon color={theme.colors.secondaryLabel} size={16} />
          )}
        </Pressable>
      ) : null}
      {hasMeta ? <UserMessageMeta open={metaOpen} text={text} time={time} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    justifyContent: "flex-end",
    left: 0,
    paddingTop: 4,
    position: "absolute",
    right: 0,
  },
  metaTime: {
    fontSize: 11,
    lineHeight: 16,
  },
});
