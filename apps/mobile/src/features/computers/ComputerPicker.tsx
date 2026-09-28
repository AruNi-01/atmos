import { Pressable, Text, View } from "react-native";
import type { ComputerRow } from "@/api/types";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { Separator } from "@/ui/layout/row";
import { CheckIcon, WifiIcon, WifiOffIcon } from "@/ui/icons/lucide-native";

export function ComputerList({
  computers,
  onPress,
  onlyOnline = false,
  selectedServerId,
}: {
  computers: ComputerRow[];
  onPress?: (computer: ComputerRow) => void;
  onlyOnline?: boolean;
  selectedServerId: string | null;
}) {
  return (
    <View>
      {computers.map((computer, index) => {
        const selected = computer.server_id === selectedServerId;
        const press =
          onPress && (!onlyOnline || computer.online) ? () => onPress(computer) : undefined;
        return (
          <View key={computer.server_id}>
            {index > 0 ? <Separator /> : null}
            <ComputerListItem computer={computer} onPress={press} selected={selected} />
          </View>
        );
      })}
    </View>
  );
}

function ComputerListItem({
  computer,
  onPress,
  selected,
}: {
  computer: ComputerRow;
  onPress?: () => void;
  selected: boolean;
}) {
  const theme = useMobileTheme();
  const online = computer.online;
  const statusColor = online ? theme.colors.green : theme.colors.secondaryLabel;
  const StatusIcon = online ? WifiIcon : WifiOffIcon;
  const body = (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: spacing.rowTitleGap,
        minHeight: spacing.rowMinHeight,
        paddingHorizontal: spacing.rowX,
        paddingVertical: spacing.rowY,
      }}
    >
      <View style={{ flex: 1, gap: spacing.rowGap, minWidth: 0 }}>
        <Text
          numberOfLines={2}
          style={[typography.rowTitle, { color: theme.colors.label, fontWeight: "600" }]}
        >
          {computer.display_name ?? computer.server_id}
        </Text>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          <StatusIcon color={statusColor} size={14} strokeWidth={2.4} />
          <Text style={[typography.rowSubtitle, { color: statusColor }]}>
            {online ? "Online" : "Offline"}
          </Text>
        </View>
      </View>
      {selected ? (
        <CheckIcon color={theme.colors.label} size={18} strokeWidth={2.6} />
      ) : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) =>
        pressed ? { backgroundColor: theme.colors.mutedPressed } : undefined
      }
    >
      {body}
    </Pressable>
  );
}
