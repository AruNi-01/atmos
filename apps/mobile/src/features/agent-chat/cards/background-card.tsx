import { Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import type { BackgroundCommand } from "../composer-cards";

export function BackgroundCard({ commands }: { commands: BackgroundCommand[] }) {
  const theme = useMobileTheme();
  return (
    <View style={{ gap: 8 }}>
      {commands.map((command) => (
        <Text
          key={command.id}
          selectable
          style={{ color: theme.colors.label, fontSize: 14, lineHeight: 20 }}
        >
          {command.command}
        </Text>
      ))}
    </View>
  );
}
