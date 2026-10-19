import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, type TextLayoutEvent } from "react-native";
import {
  USER_MESSAGE_COLLAPSE_FADE_LINES,
  USER_MESSAGE_COLLAPSE_LINES,
  formatUserMessageTime,
  textFromParts,
} from "@atmos/agent-transcript";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronDownIcon, ChevronUpIcon } from "@/ui/icons/lucide-native";
import { CopyMessageButton } from "./copy-message-button";
import {
  markUserMessageBodyPress,
  markUserMessageMetaPress,
  subscribeUserMessageOutsidePress,
  userMessageOutsidePressCloses,
} from "./user-message-outside";
import {
  attachmentChipLabel,
  isPendingPhoneUserEcho,
  userMessageDisplayText,
  userMessageIsCollapsed,
} from "./copy";
import {
  agentChatUserBodyExpandKey,
  agentChatUserMetaExpandKey,
  useAgentChatExpand,
} from "./expand-store";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";

const TEXT_LINE_HEIGHT = 20;
const FADE_STEPS = 5;

function UserMessageCollapseFade() {
  const theme = useMobileTheme();
  return (
    <View
      pointerEvents="none"
      style={{
        bottom: 0,
        height: TEXT_LINE_HEIGHT * USER_MESSAGE_COLLAPSE_FADE_LINES,
        left: 0,
        position: "absolute",
        right: 0,
      }}
    >
      {Array.from({ length: FADE_STEPS }, (_, index) => (
        <View
          key={index}
          style={{
            backgroundColor: theme.colors.background,
            flex: 1,
            opacity: (index + 1) / FADE_STEPS,
          }}
        />
      ))}
    </View>
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
        onTouchStart={() => markUserMessageBodyPress(entryId)}
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
              numberOfLines={collapsed ? USER_MESSAGE_COLLAPSE_LINES : undefined}
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
      {metaOpen && hasMeta ? (
        <View
          onTouchStart={() => markUserMessageMetaPress(entryId)}
          style={{
            alignItems: "center",
            flexDirection: "row",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 8,
          }}
        >
          {time ? (
            <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12, lineHeight: 16 }}>
              {time}
            </Text>
          ) : null}
          {text.trim() ? <CopyMessageButton text={text} /> : null}
        </View>
      ) : null}
    </View>
  );
}
