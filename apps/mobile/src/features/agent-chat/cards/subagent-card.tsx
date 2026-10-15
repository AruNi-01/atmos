import { Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import type { SubagentTitle } from "../composer-cards";

export function SubagentCard({ items }: { items: SubagentTitle[] }) {
  const theme = useMobileTheme();
  return (
    <View style={{ gap: 8 }}>
      {items.map((item) => (
        <Text key={item.id} style={{ color: theme.colors.label, fontSize: 15, lineHeight: 20 }}>
          {item.title}
        </Text>
      ))}
    </View>
  );
}
