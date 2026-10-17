import { useCallback, useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  foldedPartIsOpen,
  thinkingBlockDurationMs,
  thinkingDurationSeconds,
} from "@atmos/agent-transcript";
import { Brain } from "lucide-react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { thinkingTitle } from "./copy";
import { agentChatThinkingExpandKey, useAgentChatExpandStore } from "./expand-store";
import { TextShimmer } from "./motion/text-shimmer";
import { ExpandChevron } from "./tool-tree";
import { toolTriggerMetrics } from "./tool-chrome";
import { THINKING_AUTO_CLOSE_MS, thinkingRailColor, thinkingStreamAction } from "./thinking-stream";

export function ThinkingBlock({
  messageId,
  origIndex,
  part,
  parts,
  thinkingMs,
}: {
  messageId: string;
  origIndex: number;
  part: Extract<AgentPart, { type: "thinking" }>;
  parts: AgentPart[];
  thinkingMs?: number | null;
}) {
  const theme = useMobileTheme();
  const streaming = foldedPartIsOpen(part);
  const key = agentChatThinkingExpandKey(messageId, origIndex);
  const stored = useAgentChatExpandStore((state) => state.values[key]);
  const setExpand = useAgentChatExpandStore((state) => state.setExpand);
  const setOpen = useCallback(
    (next: boolean) => {
      setExpand(key, next);
    },
    [key, setExpand],
  );
  const open = stored ?? streaming;
  const everStreamed = useRef(streaming);
  const autoClosed = useRef(false);
  const metrics = toolTriggerMetrics;

  useEffect(() => {
    if (streaming) everStreamed.current = true;
    const action = thinkingStreamAction({
      autoClosed: autoClosed.current,
      everStreamed: everStreamed.current,
      open,
      storedOpen: stored,
      streaming,
    });
    if (action === "force-open") {
      setOpen(true);
      return;
    }
    if (action === "schedule-close") {
      const timer = setTimeout(() => {
        autoClosed.current = true;
        setOpen(false);
      }, THINKING_AUTO_CLOSE_MS);
      return () => clearTimeout(timer);
    }
  }, [open, setOpen, stored, streaming]);

  if (!part.text) return null;
  const seconds = streaming
    ? undefined
    : thinkingDurationSeconds(thinkingBlockDurationMs(part, parts, thinkingMs));
  const title = thinkingTitle(streaming, seconds);
  const titleStyle = {
    color: theme.colors.secondaryLabel,
    flexShrink: 1,
    fontSize: metrics.fontSize,
    lineHeight: metrics.lineHeight,
  };

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: metrics.gap,
          paddingVertical: metrics.padY,
        }}
      >
        <View
          style={{
            alignItems: "center",
            height: metrics.iconBox,
            justifyContent: "center",
            width: metrics.iconBox,
          }}
        >
          <Brain color={theme.colors.secondaryLabel} size={metrics.iconSize} />
        </View>
        {streaming ? (
          <TextShimmer duration={1} numberOfLines={1} style={titleStyle}>
            {title}
          </TextShimmer>
        ) : (
          <Text numberOfLines={1} style={titleStyle}>
            {title}
          </Text>
        )}
        <ExpandChevron color={theme.colors.secondaryLabel} open={open} size={metrics.chevron} />
      </Pressable>
      {open ? (
        <View
          style={{
            flexDirection: "row",
            gap: metrics.gap,
            paddingTop: metrics.bodyPadTop,
          }}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ width: metrics.iconBox }}
          >
            <View
              style={{
                backgroundColor: thinkingRailColor(theme.isDark),
                bottom: 0,
                left: (metrics.iconBox - 1) / 2,
                position: "absolute",
                top: 0,
                width: 1,
              }}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AgentChatMarkdown
              chipHttpUrls
              fontSize={metrics.fontSize}
              lineHeight={metrics.lineHeight}
              text={part.text}
              tone="thinking"
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
