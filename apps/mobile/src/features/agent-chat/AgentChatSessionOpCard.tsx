import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";

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
    <View
      style={{
        backgroundColor: theme.colors.cardElevated,
        borderColor: theme.colors.glassBorder,
        borderCurve: "continuous",
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <Text style={{ color: theme.colors.label, fontSize: 16, fontWeight: "700", lineHeight: 21 }}>
        {request.title}
      </Text>
      <View style={{ gap: 8 }}>
        {request.options.map((option) => {
          const label = option.name.trim() || option.option_id;
          return (
            <Pressable
              accessibilityRole="button"
              key={option.option_id}
              onPress={() => onRespond({ requestId: request.request_id, optionId: option.option_id })}
              style={({ pressed }) => ({
                backgroundColor: pressed ? theme.colors.mutedPressed : theme.colors.control,
                borderColor: theme.colors.controlBorder,
                borderCurve: "continuous",
                borderRadius: 12,
                borderWidth: StyleSheet.hairlineWidth,
                paddingHorizontal: 14,
                paddingVertical: 10,
              })}
            >
              <Text style={{ color: theme.colors.label, fontSize: 15, fontWeight: "600", lineHeight: 20 }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
