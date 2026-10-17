import { Text } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import type { ContextUsageStats } from "../composer-cards";

export function ContextCard({ stats }: { stats: ContextUsageStats }) {
  const theme = useMobileTheme();
  const used = stats.used.toLocaleString("en-US");
  const window = stats.context_window.toLocaleString("en-US");
  const percent = `${Math.round(stats.percent)}%`;
  return (
    <Text style={{ color: theme.colors.label, fontSize: 15, lineHeight: 20 }}>
      {used} / {window} ({percent})
    </Text>
  );
}
