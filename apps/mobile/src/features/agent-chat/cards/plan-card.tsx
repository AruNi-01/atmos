import { Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { ListTodoIcon } from "@/ui/icons/lucide-native";
import { AgentChatMarkdown } from "../AgentChatMarkdown";
import { copy } from "../copy";
import { CARD_BODY, CARD_GAP, CardHeader } from "./expanded-card";

export function PlanCard({ text }: { text: string }) {
  const theme = useMobileTheme();
  const markdown = text.trim();
  return (
    <View style={{ gap: CARD_GAP }}>
      <CardHeader icon={ListTodoIcon} title={copy.planTitle} />
      {markdown ? (
        <AgentChatMarkdown fontSize={14} lineHeight={20} text={markdown} variant="card" />
      ) : (
        <Text selectable style={{ color: theme.colors.secondaryLabel, ...CARD_BODY }}>
          {copy.planViewerEmpty}
        </Text>
      )}
    </View>
  );
}
