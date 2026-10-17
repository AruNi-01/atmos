import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@atmos/agent-transcript";
import { useMobileTheme } from "@/theme/theme-store";
import { BotMessageSquareIcon, XCircleIcon } from "@/ui/icons/lucide-native";
import { chatForeground, chatMutedForeground } from "./chat-ink";
import { chatDestructiveColor } from "./destructive-color";
import { copy } from "./copy";
import {
  SUBAGENT_MARK_PX,
  SUBAGENT_PANEL_PAD,
  SUBAGENT_PANEL_RADIUS,
  formatSubagentTaskLine,
  subagentActivityLabel,
  subagentMarkColor,
  subagentMarkDots,
  subagentPanelBorder,
  subagentTaskStatus,
  subagentTasksCountLabel,
} from "./inline-subagent-tasks";

function SubagentMark({ seed, state }: { seed: string; state: "idle" | "thinking" }) {
  const theme = useMobileTheme();
  const color = subagentMarkColor(seed, theme.isDark);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: SUBAGENT_MARK_PX, width: SUBAGENT_MARK_PX }}
    >
      {subagentMarkDots(state).map((dot) => (
        <View
          key={`${dot.x.toFixed(2)}-${dot.y.toFixed(2)}`}
          style={{
            backgroundColor: color,
            borderRadius: dot.radius,
            height: dot.radius * 2,
            left: dot.x - dot.radius,
            position: "absolute",
            top: dot.y - dot.radius,
            width: dot.radius * 2,
          }}
        />
      ))}
    </View>
  );
}

function SubagentTaskGlyph({ part }: { part: AgentToolCallPart }) {
  const theme = useMobileTheme();
  const status = subagentTaskStatus(part);
  if (status === "failed") {
    return (
      <View
        style={{
          alignItems: "center",
          height: SUBAGENT_MARK_PX,
          justifyContent: "center",
          width: SUBAGENT_MARK_PX,
        }}
      >
        <XCircleIcon color={chatDestructiveColor(theme.isDark)} size={16} strokeWidth={2} />
      </View>
    );
  }
  return (
    <SubagentMark seed={part.tool_call_id} state={status === "running" ? "thinking" : "idle"} />
  );
}

function SubagentTaskRow({
  messages,
  part,
}: {
  messages: readonly AgentMessage[];
  part: AgentToolCallPart;
}) {
  const theme = useMobileTheme();
  const muted = chatMutedForeground(theme.isDark);
  const status = subagentTaskStatus(part);
  const activity = subagentActivityLabel(messages, part);
  const color =
    status === "running"
      ? chatForeground(theme.isDark)
      : status === "failed"
        ? chatDestructiveColor(theme.isDark)
        : muted;
  return (
    <View
      style={{
        alignItems: "center",
        borderRadius: 14,
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 8,
        paddingVertical: 6,
      }}
    >
      <SubagentTaskGlyph part={part} />
      <View style={{ alignItems: "center", flex: 1, flexDirection: "row", gap: 6, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            color,
            flexGrow: 1,
            flexShrink: 1,
            fontSize: 14,
            fontWeight: status === "running" ? "500" : "400",
            lineHeight: 20,
          }}
        >
          {formatSubagentTaskLine(part)}
        </Text>
        {activity ? (
          <Text
            numberOfLines={1}
            style={{
              color: muted,
              flexShrink: 999,
              fontSize: 14,
              lineHeight: 20,
              minWidth: 0,
            }}
          >
            {activity}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function InlineSubagentPanel({
  messages,
  tools,
}: {
  messages: readonly AgentMessage[];
  tools: readonly AgentToolCallPart[];
}) {
  const theme = useMobileTheme();
  const foreground = chatForeground(theme.isDark);
  const muted = chatMutedForeground(theme.isDark);
  const [open, setOpen] = useState(true);
  if (tools.length === 0) return null;
  return (
    <View
      accessibilityLabel={copy.subagentTasksPanelAria}
      style={{
        backgroundColor: theme.colors.background,
        borderColor: subagentPanelBorder(theme.isDark),
        borderRadius: SUBAGENT_PANEL_RADIUS,
        borderWidth: 1,
        padding: SUBAGENT_PANEL_PAD,
        width: "100%",
      }}
    >
      <Pressable
        accessibilityLabel={open ? copy.subagentTasksCollapseAria : copy.subagentTasksExpandAria}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: 8,
          marginBottom: open ? 8 : 0,
          paddingHorizontal: 4,
          paddingVertical: 2,
        }}
      >
        <BotMessageSquareIcon color={muted} size={16} strokeWidth={2} />
        <Text
          numberOfLines={1}
          style={{
            color: foreground,
            flexShrink: 1,
            fontSize: 14,
            fontWeight: "500",
            lineHeight: 20,
          }}
        >
          {copy.subagentTasksTitle}
        </Text>
        <Text
          style={{
            color: muted,
            fontSize: 14,
            lineHeight: 20,
            marginLeft: "auto",
          }}
        >
          {subagentTasksCountLabel(tools)}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ gap: 2 }}>
          {tools.map((part) => (
            <SubagentTaskRow key={part.tool_call_id} messages={messages} part={part} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
