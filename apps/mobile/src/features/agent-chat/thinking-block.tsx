import { Text, View } from "react-native";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  foldedPartIsOpen,
  thinkingBlockDurationMs,
  thinkingDurationSeconds,
} from "@atmos/agent-transcript";
import { useMobileTheme } from "@/theme/theme-store";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { thinkingTitle } from "./copy";

export function ThinkingBlock({
  part,
  parts,
  thinkingMs,
}: {
  part: Extract<AgentPart, { type: "thinking" }>;
  parts: AgentPart[];
  thinkingMs?: number | null;
}) {
  const theme = useMobileTheme();
  if (!part.text) return null;
  const open = foldedPartIsOpen(part);
  const seconds = open
    ? undefined
    : thinkingDurationSeconds(thinkingBlockDurationMs(part, parts, thinkingMs));
  const title = thinkingTitle(open, seconds);

  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 }}>
        {title}
      </Text>
      <AgentChatMarkdown text={part.text} tone="thinking" />
    </View>
  );
}
