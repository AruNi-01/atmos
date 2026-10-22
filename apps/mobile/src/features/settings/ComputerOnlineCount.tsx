import { Text } from "react-native";
import { onlineStatusColor } from "@/features/computers/online-status-color";
import { formatComputerOnlineCount } from "@/features/settings/computer-settings";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";

export function ComputerOnlineCount({ online, total }: { online: number; total: number }) {
  const theme = useMobileTheme();
  const summary = formatComputerOnlineCount(online, total);
  if (summary.kind === "empty") {
    return (
      <Text
        accessibilityLabel={summary.accessibilityLabel}
        style={[typography.rowMeta, { color: theme.colors.secondaryLabel }]}
      >
        {summary.label}
      </Text>
    );
  }

  return (
    <Text
      accessibilityLabel={summary.accessibilityLabel}
      style={[typography.rowMeta, { color: theme.colors.secondaryLabel, maxWidth: "42%" }]}
    >
      <Text style={{ color: onlineStatusColor(theme.colors) }}>{summary.online}</Text>
      <Text>/{summary.total}</Text>
    </Text>
  );
}
