import { Pressable, Text } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronRightIcon } from "@/ui/icons/lucide-native";
import { collapsedToolTitle, type AgentToolCallPart } from "./tool-kind";

export function AgentChatToolCard({
  onPress,
  part,
  title,
}: {
  onPress?: () => void;
  part: AgentToolCallPart;
  title?: string;
}) {
  const theme = useMobileTheme();
  const heading = title ?? collapsedToolTitle(part);
  const failed = part.status === "failed";
  const interactive = Boolean(onPress);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={!interactive}
      onPress={onPress}
      style={{ alignItems: "center", flexDirection: "row", gap: 6, marginBottom: 4, paddingVertical: 2 }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: failed ? theme.colors.red : theme.colors.secondaryLabel,
          flexShrink: 1,
          fontSize: 15,
          lineHeight: 20,
        }}
      >
        {heading}
      </Text>
      {interactive ? (
        <ChevronRightIcon
          color={failed ? theme.colors.red : theme.colors.secondaryLabel}
          size={14}
          strokeWidth={2.2}
        />
      ) : null}
    </Pressable>
  );
}
