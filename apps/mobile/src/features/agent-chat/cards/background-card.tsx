import { Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { PromptTerminalIcon, SquareTerminalIcon } from "@/ui/icons/lucide-native";
import { backgroundRunningCountLabel, type BackgroundCommand } from "../composer-cards";
import { copy } from "../copy";
import { CARD_GAP, CARD_ICON_SIZE, CARD_META, CARD_MONO, CardHeader } from "./expanded-card";

export function BackgroundCard({ commands }: { commands: BackgroundCommand[] }) {
  const theme = useMobileTheme();
  return (
    <View style={{ gap: CARD_GAP }}>
      <CardHeader
        count={backgroundRunningCountLabel(commands.length)}
        icon={SquareTerminalIcon}
        title={copy.backgroundCommandsTitle}
      />
      {commands.map((command) => (
        <View key={command.id} style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <View style={{ height: CARD_ICON_SIZE, width: CARD_ICON_SIZE }}>
            <PromptTerminalIcon color={theme.colors.secondaryLabel} size={14} strokeWidth={2} />
            <View style={{ backgroundColor: theme.colors.green, ...stylesDot }} />
          </View>
          <Text
            numberOfLines={1}
            selectable
            style={{ color: theme.colors.label, flex: 1, ...CARD_MONO }}
          >
            {command.command}
          </Text>
          <Text
            style={{
              color: theme.colors.secondaryLabel,
              flexShrink: 0,
              fontSize: CARD_META.fontSize,
              lineHeight: CARD_META.lineHeight,
            }}
          >
            {copy.backgroundRunning}
          </Text>
        </View>
      ))}
    </View>
  );
}

const stylesDot = {
  borderRadius: 3,
  height: 6,
  position: "absolute" as const,
  right: -2,
  top: -2,
  width: 6,
};
