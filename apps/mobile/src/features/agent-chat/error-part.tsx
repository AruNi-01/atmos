import { Text, View } from "react-native";
import { TriangleAlert } from "lucide-react-native";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import {
  chatDestructiveBorder,
  chatDestructiveColor,
  chatDestructiveSurface,
} from "./destructive-color";

export function ErrorPart({ part }: { part: Extract<AgentPart, { type: "error" }> }) {
  const theme = useMobileTheme();
  if (!part.message) return null;
  const color = chatDestructiveColor(theme.isDark);

  return (
    <View
      style={{
        alignItems: "flex-start",
        backgroundColor: chatDestructiveSurface(theme.isDark),
        borderColor: chatDestructiveBorder(theme.isDark),
        borderCurve: "continuous",
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <TriangleAlert color={color} size={16} style={{ marginTop: 2 }} />
      <Text selectable style={{ color, flexShrink: 1, fontSize: 14, lineHeight: 20 }}>
        {part.message}
      </Text>
    </View>
  );
}
