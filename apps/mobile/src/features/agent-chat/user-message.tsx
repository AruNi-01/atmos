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
import { File } from "lucide-react-native";
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
import { ClipboardIcon } from "@/ui/icons/lucide-native";
import { chatForeground, chatMutedForeground } from "./chat-ink";
import {
  PASTE_CHIP_FONT,
  PASTE_CHIP_GAP,
  PASTE_CHIP_HEIGHT,
  PASTE_CHIP_ICON,
  PASTE_CHIP_PAD_X,
  pasteChipBorder,
  pasteChipFill,
  pasteChipLabel,
  sentPasteDisplay,
} from "./composer-paste";
import {
  attachmentChipLabel,
  copy,
  isPendingPhoneUserEcho,
  userMessageDisplayText,
  userMessageIsCollapsed,
} from "./copy";
import {
  USER_ATTACHMENT_CHIP_RADIUS,
  USER_ATTACHMENT_GAP,
  USER_ATTACHMENT_ICON_PX,
  USER_ATTACHMENT_MAX_WIDTH,
  USER_ATTACHMENT_PAD_X,
  userAttachmentBorder,
  userAttachmentChipMetrics,
  userAttachmentDensity,
  userAttachmentFill,
  userAttachmentIconColor,
  userAttachmentLabelColor,
  userAttachmentListGap,
  userAttachmentPressGrows,
} from "./user-attachment-chip";
import { CopyMessageButton } from "./copy-message-button";
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
import {
  USER_BUBBLE_RADIUS,
  userBubbleFill,
  userMessageCollapsedLineLimit,
  userMessageWashColors,
} from "./user-message-fade";
import {
  markUserMessageBodyPress,
  markUserMessageMetaPress,
  subscribeUserMessageOutsidePress,
  userMessageOutsidePressCloses,
} from "./user-message-outside";

// Web user body is `text-sm leading-[1.5]` (14 × 1.5). The collapse wash is one line.
const TEXT_LINE_HEIGHT = 21;

function UserAttachmentChips({
  attachments,
  expanded,
  hasText,
}: {
  attachments: ReadonlyArray<{ name?: string | null; path: string }>;
  expanded: boolean;
  hasText: boolean;
}) {
  const theme = useMobileTheme();
  const density = userAttachmentDensity(expanded);
  const chip = userAttachmentChipMetrics(density);
  return (
    <View
      style={{
        alignItems: "flex-start",
        flexDirection: "row",
        flexWrap: "wrap",
        gap: userAttachmentListGap(density),
        marginBottom: hasText ? 8 : 0,
      }}
    >
      {attachments.map((part, index) => (
        <View
          key={`${part.path}:${index}`}
          style={{
            alignItems: "center",
            backgroundColor: userAttachmentFill(theme.isDark),
            borderColor: userAttachmentBorder(theme.isDark),
            borderRadius: USER_ATTACHMENT_CHIP_RADIUS,
            borderWidth: 1,
            flexDirection: "row",
            gap: USER_ATTACHMENT_GAP,
            height: chip.height,
            maxWidth: USER_ATTACHMENT_MAX_WIDTH,
            paddingLeft: USER_ATTACHMENT_PAD_X,
            paddingRight: USER_ATTACHMENT_PAD_X,
          }}
        >
          <File
            color={userAttachmentIconColor(theme.isDark)}
            size={USER_ATTACHMENT_ICON_PX}
            strokeWidth={2}
          />
          <Text
            numberOfLines={1}
            style={{
              color: userAttachmentLabelColor(theme.isDark),
              flexShrink: 1,
              fontSize: chip.fontSize,
              lineHeight: chip.lineHeight,
            }}
          >
            {attachmentChipLabel(part)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function UserMessageCollapseFade() {
  const theme = useMobileTheme();
  const [from, to] = userMessageWashColors(userBubbleFill(theme.isDark));
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
  entryId,
  open,
  text,
  time,
}: {
  entryId: string;
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
      onTouchStart={() => markUserMessageMetaPress(entryId)}
      pointerEvents={open ? "auto" : "none"}
      style={[{ overflow: "hidden" }, clipStyle]}
    >
      <View onLayout={onLayout} style={styles.metaRow}>
        {time ? (
          <UserMetaItem index={timeIndex} open={open}>
            <Text style={[styles.metaTime, { color: chatMutedForeground(theme.isDark) }]}>
              {time}
            </Text>
          </UserMetaItem>
        ) : null}
        {showCopy ? (
          <UserMetaItem index={copyIndex} open={open}>
            <CopyMessageButton label={copy.copyUserAria} text={text} />
          </UserMetaItem>
        ) : null}
      </View>
    </Animated.View>
  );
}

export function UserMessage({ message }: { message: AgentMessage }) {
  const theme = useMobileTheme();
  const entryId = message.id;
  const text = textFromParts(message.parts);
  const display = userMessageDisplayText(text);
  const paste = sentPasteDisplay(text);
  const attachments = message.parts.filter((part) => part.type === "attachment");
  const time = formatUserMessageTime(message.created_at, "en");
  const hasMeta = Boolean(time) || text.trim().length > 0;
  const [expanded, setExpanded] = useAgentChatExpand(agentChatUserBodyExpandKey(entryId), false);
  const [metaOpen, setMetaOpen] = useAgentChatExpand(agentChatUserMetaExpandKey(entryId), false);
  const [lineCount, setLineCount] = useState(0);
  const collapsed = userMessageIsCollapsed(lineCount, expanded);
  const growsAttachments = userAttachmentPressGrows(attachments.length, expanded);
  const showPasteChips = paste != null && !expanded;
  const opensBody =
    growsAttachments || showPasteChips || (!expanded && lineCount > USER_MESSAGE_COLLAPSE_LINES);
  const pending = isPendingPhoneUserEcho(message);

  useEffect(() => {
    if (!expanded && !metaOpen) return;
    return subscribeUserMessageOutsidePress((press) => {
      const close = userMessageOutsidePressCloses(entryId, press);
      if (close.body) setExpanded(false);
      if (close.meta) setMetaOpen(false);
    });
  }, [entryId, expanded, metaOpen, setExpanded, setMetaOpen]);

  if (!text && attachments.length === 0 && !time) return null;

  const onTextLayout = (event: TextLayoutEvent) => {
    if (collapsed) return;
    const next = event.nativeEvent.lines.length;
    setLineCount((current) => (current === next ? current : next));
  };

  return (
    <View
      onTouchStart={() => markUserMessageBodyPress(entryId)}
      style={{
        alignSelf: "stretch",
        backgroundColor: userBubbleFill(theme.isDark),
        borderCurve: "continuous",
        borderRadius: USER_BUBBLE_RADIUS,
        opacity: pending ? 0.65 : 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
        width: "100%",
      }}
    >
      <Pressable
        accessibilityRole={hasMeta || opensBody ? "button" : undefined}
        accessibilityState={hasMeta ? { expanded: metaOpen } : undefined}
        disabled={!hasMeta && !opensBody}
        onTouchStart={() => markUserMessageBodyPress(entryId)}
        onPress={() => {
          if (opensBody) setExpanded(true);
          if (hasMeta) setMetaOpen(!metaOpen);
        }}
      >
        {attachments.length > 0 ? (
          <UserAttachmentChips
            attachments={attachments}
            expanded={expanded}
            hasText={Boolean(text)}
          />
        ) : null}
        {showPasteChips && paste ? (
          <Text
            selectable
            style={{
              color: chatForeground(theme.isDark),
              fontSize: 14,
              lineHeight: TEXT_LINE_HEIGHT,
            }}
          >
            {paste.segments.map((segment, index) =>
              segment.type === "paste" ? (
                <Text
                  key={`${segment.token}:${index}`}
                  style={{
                    backgroundColor: pasteChipFill(theme.isDark),
                    borderColor: pasteChipBorder(theme.isDark),
                    borderRadius: 999,
                    borderWidth: 1,
                    color: chatForeground(theme.isDark),
                    fontSize: PASTE_CHIP_FONT,
                    fontWeight: "500",
                    lineHeight: PASTE_CHIP_HEIGHT,
                    paddingHorizontal: PASTE_CHIP_PAD_X,
                  }}
                >
                  <ClipboardIcon
                    color={chatForeground(theme.isDark)}
                    size={PASTE_CHIP_ICON}
                    strokeWidth={2}
                    style={{ marginRight: PASTE_CHIP_GAP }}
                  />
                  {pasteChipLabel(segment.lineCount)}
                </Text>
              ) : (
                <Text key={`text:${index}`}>{segment.value}</Text>
              ),
            )}
          </Text>
        ) : text ? (
          <View style={{ position: "relative" }}>
            <Text
              numberOfLines={collapsed ? userMessageCollapsedLineLimit() : undefined}
              onTextLayout={onTextLayout}
              selectable
              style={{
                color: chatForeground(theme.isDark),
                fontSize: 14,
                lineHeight: TEXT_LINE_HEIGHT,
              }}
            >
              {display}
            </Text>
            {collapsed ? <UserMessageCollapseFade /> : null}
          </View>
        ) : null}
      </Pressable>
      {hasMeta ? (
        <UserMessageMeta entryId={entryId} open={metaOpen} text={text} time={time} />
      ) : null}
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
