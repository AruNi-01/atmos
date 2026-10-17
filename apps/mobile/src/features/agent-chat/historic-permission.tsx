import { StyleSheet, Text, View } from "react-native";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { historicPermissionTitle } from "./copy";

export function HistoricPermission({ part }: { part: Extract<AgentPart, { type: "permission" }> }) {
  const theme = useMobileTheme();
  if (part.request.status === "pending") return null;
  const title = historicPermissionTitle(part.request);
  const description = part.request.description.trim();
  const markdown = part.request.content_markdown?.trim() ?? "";

  return (
    <View
      style={{
        backgroundColor: theme.colors.cardElevated,
        borderColor: theme.colors.glassBorder,
        borderCurve: "continuous",
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      <Text style={{ color: theme.colors.label, fontSize: 14, fontWeight: "600", lineHeight: 20 }}>
        {title}
      </Text>
      {description ? <AgentChatMarkdown fontSize={14} lineHeight={20} text={description} /> : null}
      {markdown ? <AgentChatMarkdown fontSize={14} lineHeight={20} text={markdown} /> : null}
    </View>
  );
}
