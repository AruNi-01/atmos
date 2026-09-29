import { Text, useWindowDimensions, View } from "react-native";
import { MobileAgentIcon } from "@/features/terminal/MobileAgentIcon";
import { colors } from "@/theme/colors";
import { TerminalIcon } from "@/ui/icons/lucide-native";

/** Centered terminal heading: agent icon plus the broadcast session title. */
export function TerminalHeadingTitle({
  agentId,
  title,
}: {
  agentId?: string;
  title: string;
}) {
  const { width } = useWindowDimensions();
  const maxWidth = Math.max(120, width - 168);

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 6, maxWidth }}>
      {agentId ? (
        <MobileAgentIcon agentId={agentId} size={16} />
      ) : (
        <TerminalIcon color={colors.terminalFg} size={16} strokeWidth={2.2} />
      )}
      <Text
        numberOfLines={1}
        style={{ color: colors.terminalFg, flexShrink: 1, fontSize: 16, fontWeight: "600" }}
      >
        {title}
      </Text>
    </View>
  );
}
