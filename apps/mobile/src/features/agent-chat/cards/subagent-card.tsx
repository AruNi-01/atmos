import { Text, View } from "react-native";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@atmos/agent-transcript";
import { useMobileTheme } from "@/theme/theme-store";
import { chatMutedForeground } from "../chat-ink";
import type { SubagentTitle } from "../composer-cards";
import { InlineSubagentPanel } from "../inline-subagent-panel";

export function SubagentCard({
  items,
  messages,
  tools,
}: {
  items: SubagentTitle[];
  messages: readonly AgentMessage[];
  tools: readonly AgentToolCallPart[];
}) {
  const theme = useMobileTheme();
  if (tools.length > 0) {
    return <InlineSubagentPanel messages={messages} tools={tools} />;
  }
  return (
    <View style={{ gap: 8 }}>
      {items.map((item) => (
        <Text
          key={item.id}
          style={{ color: chatMutedForeground(theme.isDark), fontSize: 14, lineHeight: 20 }}
        >
          {item.title}
        </Text>
      ))}
    </View>
  );
}
