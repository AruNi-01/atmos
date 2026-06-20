import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ComputerRow } from "@/api/types";
import { NativeBottomSheet, NativeButton } from "@/ui/primitives/native-controls";
import { colors, radii } from "@/theme/colors";

export function ComputerConnectSheet({
  computers,
  error,
  hasAccessToken,
  isConnecting,
  isPresented,
  isRefreshing,
  onDismiss,
  onOpenTokenSetup,
  onRefresh,
  onSelect,
  selectedServerId,
}: {
  computers: ComputerRow[];
  error?: string | null;
  hasAccessToken: boolean;
  isConnecting?: boolean;
  isPresented: boolean;
  isRefreshing?: boolean;
  onDismiss: () => void;
  onOpenTokenSetup: () => void;
  onRefresh: () => void;
  onSelect: (serverId: string) => void;
  selectedServerId: string | null;
}) {
  const activeComputers = computers.filter((computer) => !computer.revoked);
  const tokenUnavailable = !hasAccessToken || Boolean(error && activeComputers.length === 0);

  return (
    <NativeBottomSheet isPresented={isPresented} onDismiss={onDismiss} testID="computer-connect-sheet">
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Computer Connect</Text>
            <Text style={styles.subtitle}>{computerSheetSubtitle(hasAccessToken, activeComputers.length)}</Text>
          </View>
          <NativeButton
            label={isRefreshing ? "Refreshing" : "Refresh"}
            onPress={onRefresh}
            disabled={!hasAccessToken || isRefreshing}
          />
        </View>

        {tokenUnavailable ? (
          <View style={styles.empty}>
            <Text selectable style={styles.emptyTitle}>
              {hasAccessToken ? "Token check failed" : "Access Token required"}
            </Text>
            <Text selectable style={styles.emptyText}>
              {error ?? "Connect mobile to Relay before loading Computers."}
            </Text>
            <NativeButton label="Set Access Token" onPress={onOpenTokenSetup} />
          </View>
        ) : activeComputers.length === 0 ? (
          <View style={styles.empty}>
            <Text selectable style={styles.emptyTitle}>
              No Computers
            </Text>
            <Text selectable style={styles.emptyText}>
              Start Atmos Server, then refresh this list.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.computerRows} keyboardShouldPersistTaps="handled">
            {activeComputers.map((computer) => (
              <ComputerRowItem
                computer={computer}
                isConnecting={isConnecting}
                isSelected={computer.server_id === selectedServerId}
                key={computer.server_id}
                onPress={() => onSelect(computer.server_id)}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </NativeBottomSheet>
  );
}

function ComputerRowItem({
  computer,
  isConnecting,
  isSelected,
  onPress,
}: {
  computer: ComputerRow;
  isConnecting?: boolean;
  isSelected: boolean;
  onPress: () => void;
}) {
  const disabled = !computer.online || isConnecting;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.computerRow,
        disabled && styles.computerRowDisabled,
        pressed && styles.computerRowPressed,
      ]}
    >
      <View style={styles.computerText}>
        <Text style={styles.computerTitle} numberOfLines={1}>
          {computer.display_name ?? computer.server_id}
        </Text>
        <Text style={styles.computerMeta} numberOfLines={1}>
          {computer.server_id}
        </Text>
      </View>
      <View style={[styles.computerStatus, computer.online && styles.computerStatusOnline]}>
        <Text style={[styles.computerStatusText, computer.online && styles.computerStatusTextOnline]}>
          {isSelected ? "Selected" : computer.online ? "Online" : "Offline"}
        </Text>
      </View>
    </Pressable>
  );
}

function computerSheetSubtitle(hasAccessToken: boolean, count: number) {
  if (!hasAccessToken) return "Token first";
  if (count === 0) return "No Computers";
  return `${count} Computers`;
}

const styles = StyleSheet.create({
  sheet: {
    gap: 16,
    paddingBottom: 24,
  },
  computerMeta: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  computerRow: {
    alignItems: "center",
    backgroundColor: colors.cardElevated,
    borderColor: colors.separator,
    borderCurve: "continuous",
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 66,
    padding: 12,
  },
  computerRowDisabled: {
    opacity: 0.46,
  },
  computerRowPressed: {
    opacity: 0.68,
  },
  computerRows: {
    gap: 10,
    paddingBottom: 24,
  },
  computerStatus: {
    borderColor: colors.separatorStrong,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  computerStatusOnline: {
    backgroundColor: colors.label,
    borderColor: colors.label,
  },
  computerStatusText: {
    color: colors.secondaryLabel,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  computerStatusTextOnline: {
    color: colors.labelInverse,
  },
  computerText: {
    flex: 1,
  },
  computerTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: "800",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  title: {
    color: colors.label,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0,
  },
  subtitle: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  empty: {
    borderColor: colors.separatorStrong,
    borderCurve: "continuous",
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    padding: 16,
  },
  emptyText: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyTitle: {
    color: colors.label,
    fontSize: 17,
    fontWeight: "800",
  },
});
