import { StyleSheet, Text, View } from "react-native";
import { TriangleAlert } from "lucide-react-native";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";

export function ErrorPart({ part }: { part: Extract<AgentPart, { type: "error" }> }) {
  const theme = useMobileTheme();
  if (!part.message) return null;

  return (
    <View
      style={{
        alignItems: "flex-start",
        backgroundColor: theme.colors.redSurface,
        borderColor: theme.colors.redBorder,
        borderCurve: "continuous",
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <TriangleAlert color={theme.colors.red} size={16} />
      <Text
        selectable
        style={{ color: theme.colors.red, flexShrink: 1, fontSize: 14, lineHeight: 20 }}
      >
        {part.message}
      </Text>
    </View>
  );
}
