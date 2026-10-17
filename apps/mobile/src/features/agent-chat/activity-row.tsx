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

import { View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { TextShimmer } from "./motion/text-shimmer";

export function ActivityRow({ message, turnOpen }: { message: AgentMessage; turnOpen?: boolean }) {
  const theme = useMobileTheme();
  return (
    <View style={{ alignItems: "flex-start", paddingVertical: 2 }}>
      <TextShimmer
        duration={1.5}
        numberOfLines={1}
        style={{ color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 }}
      >
        {activityRowLabel(message, turnOpen)}
      </TextShimmer>
    </View>
  );
}
