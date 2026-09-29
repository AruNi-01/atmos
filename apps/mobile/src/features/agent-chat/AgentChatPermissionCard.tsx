import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { copy } from "./copy";

export type AgentChatPermissionPrompt = {
  request_id: string;
  description: string;
  content_markdown?: string | null;
  options?: Array<{ option_id: string; name: string }> | null;
};

export function AgentChatPermissionCard({
  request,
  onRespond,
}: {
  request: AgentChatPermissionPrompt;
  onRespond: (input: { requestId: string; optionId: string }) => void;
}) {
  const theme = useMobileTheme();
  const description = request.description.trim();
  const markdown = request.content_markdown?.trim() ?? "";
  const options = request.options ?? [];

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
        {copy.permissionTitle}
      </Text>
      {description ? (
        <Text selectable style={{ color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 }}>
          {description}
        </Text>
      ) : null}
      {markdown.length > 0 && markdown !== description ? <AgentChatMarkdown text={markdown} /> : null}
      <View style={{ gap: 8 }}>
        {options.map((option) => {
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
