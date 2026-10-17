import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import type { GrokChromePhaseSection } from "@atmos/agent-transcript";
import { useMobileTheme } from "@/theme/theme-store";
import { chatForeground, chatMutedForeground } from "./chat-ink";
import { grokPhaseStartsOpen } from "./grok-chrome-label";
import { SubagentTaskRow } from "./inline-subagent-panel";
import {
  SUBAGENT_PANEL_PAD,
  SUBAGENT_PANEL_RADIUS,
  subagentPanelBorder,
} from "./inline-subagent-tasks";
import { ExpandChevron } from "./tool-tree";

function PhaseBlock({
  emptyHint,
  fallbackType,
  messages,
  section,
}: {
  emptyHint: string | null;
  fallbackType: string;
  messages: readonly AgentMessage[];
  section: GrokChromePhaseSection;
}) {
  const theme = useMobileTheme();
  const foreground = chatForeground(theme.isDark);
  const muted = chatMutedForeground(theme.isDark);
  const [stored, setStored] = useState<boolean | null>(null);
  const open = stored ?? grokPhaseStartsOpen(section.state);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setStored(!open)}
        style={{
          alignItems: "center",
          borderRadius: 14,
          flexDirection: "row",
          gap: 8,
          paddingHorizontal: 8,
          paddingVertical: 4,
        }}
      >
        <ExpandChevron color={muted} open={open} size={14} />
        <Text
          style={{
            color: foreground,
            flexShrink: 1,
            fontSize: 14,
            fontWeight: "500",
            lineHeight: 20,
          }}
        >
          {section.title}
        </Text>
        <Text style={{ color: muted, fontSize: 12, lineHeight: 16, marginLeft: "auto" }}>
          {section.agents.length}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ gap: 2, paddingBottom: 4 }}>
          {section.agents.length === 0 && emptyHint ? (
            <Text
              style={{
                color: muted,
                fontSize: 12,
                lineHeight: 16,
                paddingHorizontal: 28,
                paddingVertical: 4,
              }}
            >
              {emptyHint}
            </Text>
          ) : null}
          {section.agents.map((part) => (
            <SubagentTaskRow
              key={part.tool_call_id}
              fallbackType={fallbackType}
              messages={messages}
              part={part}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function GrokChromePanel({
  collapseAria,
  emptyHint,
  expandAria,
  fallbackType,
  icon,
  messages,
  meta,
  panelAria,
  sections,
  statusDetail,
  title,
}: {
  collapseAria: string;
  emptyHint: (section: GrokChromePhaseSection) => string | null;
  expandAria: string;
  fallbackType: string;
  icon: ReactNode;
  messages: readonly AgentMessage[];
  meta: string;
  panelAria: string;
  sections: readonly GrokChromePhaseSection[];
  statusDetail?: { leading: string; trailing: string } | null;
  title: string;
}) {
  const theme = useMobileTheme();
  const foreground = chatForeground(theme.isDark);
  const muted = chatMutedForeground(theme.isDark);
  const [open, setOpen] = useState(true);
  return (
    <View
      accessibilityLabel={panelAria}
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
        accessibilityLabel={open ? collapseAria : expandAria}
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
        {icon}
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
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: muted, fontSize: 14, lineHeight: 20, marginLeft: "auto" }}
        >
          {meta}
        </Text>
      </Pressable>
      {open ? (
        <View>
          {statusDetail ? (
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                gap: 8,
                marginBottom: 8,
                paddingHorizontal: 4,
              }}
            >
              <Text
                numberOfLines={1}
                style={{ color: muted, flexShrink: 1, fontSize: 12, lineHeight: 20 }}
              >
                {statusDetail.leading}
              </Text>
              <Text style={{ color: muted, fontSize: 12, lineHeight: 20, marginLeft: "auto" }}>
                {statusDetail.trailing}
              </Text>
            </View>
          ) : null}
          <View style={{ gap: 4 }}>
            {sections.map((section) => (
              <PhaseBlock
                key={section.id}
                emptyHint={emptyHint(section)}
                fallbackType={fallbackType}
                messages={messages}
                section={section}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
