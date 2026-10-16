import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { foldedPartIsOpen, isNestedSubagentChild, presentAgentTool } from "@atmos/agent-transcript";
import { copy, toolGroupLabels } from "./copy";

const ACTIVE_TOOL_STATUS = new Set<string>(["running", "in_progress", "pending"]);

/**
 * `presentAgentTool` has no title field. Prefer one if a future result adds it,
 * then the wire title, then the presented tool name.
 */
function activityToolTitle(part: Extract<AgentPart, { type: "tool_call" }>): string {
  const presented = presentAgentTool(part);
  const presentedTitle =
    "title" in presented && typeof presented.title === "string" ? presented.title.trim() : "";
  if (presentedTitle) return presentedTitle;
  const wireTitle = part.title?.trim() ?? "";
  if (wireTitle) return wireTitle;
  return presented.resolvedTool.trim();
}

export function activityRowLabel(message: AgentMessage | null | undefined): string {
  const parts = message?.role === "assistant" ? message.parts : [];
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part || part.type !== "tool_call" || isNestedSubagentChild(part, parts)) continue;
    if (!ACTIVE_TOOL_STATUS.has(part.status)) continue;
    return activityToolTitle(part) || toolGroupLabels.working;
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
