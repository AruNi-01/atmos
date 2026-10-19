import { Text } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { AgentChatMarkdown } from "../AgentChatMarkdown";
import { copy } from "../copy";

export function PlanCard({ text }: { text: string }) {
  const theme = useMobileTheme();
  const markdown = text.trim();
  if (!markdown) {
    return (
      <Text selectable style={{ color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 }}>
        {copy.planViewerEmpty}
      </Text>
    );
  }
  return <AgentChatMarkdown fontSize={14} lineHeight={20} text={markdown} />;
}
