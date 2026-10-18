import { Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassTextButton } from "@/ui/primitives/glass-action-buttons";

export type AgentChatSessionOpPrompt = {
  request_id: string;
  title: string;
  options: Array<{ option_id: string; name: string }>;
};

export function AgentChatSessionOpCard({
  request,
  onRespond,
}: {
  request: AgentChatSessionOpPrompt;
  onRespond: (input: { requestId: string; optionId: string }) => void;
}) {
  const theme = useMobileTheme();

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: theme.colors.label, fontSize: 16, fontWeight: "700", lineHeight: 21 }}>
        {request.title}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {request.options.map((option) => {
          const label = option.name.trim() || option.option_id;
          return (
            <GlassTextButton
              key={option.option_id}
              label={label}
              onPress={() =>
                onRespond({ requestId: request.request_id, optionId: option.option_id })
              }
            />
          );
        })}
      </View>
    </View>
  );
}
