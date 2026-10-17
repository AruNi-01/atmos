import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import {
  foldedPartIsOpen,
  formatAgentToolActivityLine,
  isNestedSubagentChild,
  toolKindHeadlineLabel,
} from "@atmos/agent-transcript";
import { copy, toolGroupLabels } from "./copy";

const ACTIVE_TOOL_STATUS = new Set<string>(["running", "in_progress", "pending"]);

export function activityRowLabel(message: AgentMessage | null | undefined): string {
  const parts = message?.role === "assistant" ? message.parts : [];
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part || part.type !== "tool_call" || isNestedSubagentChild(part, parts)) continue;
    if (!ACTIVE_TOOL_STATUS.has(part.status)) continue;
    return (
      formatAgentToolActivityLine(part, toolKindHeadlineLabel(part.kind)) || toolGroupLabels.working
    );
  }
  for (const part of parts) {
    if (part.type !== "thinking" || isNestedSubagentChild(part, parts)) continue;
    if (foldedPartIsOpen(part)) return copy.thinkingStream;
  }
  return toolGroupLabels.working;
}

// @view

import { View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { TextShimmer } from "./motion/text-shimmer";

export function ActivityRow({ message }: { message: AgentMessage }) {
  const theme = useMobileTheme();
  return (
    <View style={{ alignItems: "flex-start", paddingVertical: 2 }}>
      <TextShimmer
        duration={1.5}
        numberOfLines={1}
        style={{ color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 }}
      >
        {activityRowLabel(message)}
      </TextShimmer>
    </View>
  );
}
