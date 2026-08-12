import { useMobileTheme } from "@/theme/theme-store";
import { radii } from "@/theme/radii";
import { Button, Host } from "@expo/ui";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { controlSize, frame } from "@expo/ui/swift-ui/modifiers";
import { Platform, View } from "react-native";
import type { ComputerRow } from "@/api/types";
import { EmptyState, Section } from "@/ui/layout/app-screen";
import { NativeList, NativeListItem } from "@/ui/primitives/native-controls";

const buttonStretchModifiers = Platform.select({
  ios: [frame({ maxWidth: Number.POSITIVE_INFINITY }), controlSize("large")],
  android: [fillMaxWidth()],
  default: undefined,
});

export function ComputerPicker({
  computers,
  selectedServerId,
  onSelect,
  onRefresh,
  isRefreshing,
}: {
  computers: ComputerRow[];
  selectedServerId: string | null;
  onSelect: (serverId: string) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}) {
  const theme = useMobileTheme();
  const activeComputers = computers.filter((computer) => !computer.revoked);
  const onlineComputers = activeComputers.filter((computer) => computer.online);

  return (
    <Section label="Computer">
      {activeComputers.length === 0 ? (
        <View>
          <EmptyState
            title="No Computer online"
            message="Start or register Atmos Server on a remote machine, then refresh this list."
          />
          <View style={{ padding: 16, paddingTop: 0 }}>
            <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={theme.colors.label}
      style={{ alignSelf: "stretch", width: "100%" }}
    >
      <Button
        label={isRefreshing ? "Refreshing..." : "Refresh"}
        onPress={onRefresh}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: theme.colors.control,
      borderColor: theme.colors.controlBorder,
      borderRadius: radii.control,
      borderWidth: 1,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="outlined"
      />
    </Host>
          </View>
        </View>
      ) : (
        <View>
          <NativeList>
            {activeComputers.map((computer) => (
              <NativeListItem
                key={computer.server_id}
                title={computer.display_name ?? computer.server_id}
                supportingText={computer.online ? "Online" : "Offline"}
                trailing={computer.server_id === selectedServerId ? "Selected" : computer.online ? "Online" : "Offline"}
                onPress={computer.online ? () => onSelect(computer.server_id) : undefined}
              />
            ))}
          </NativeList>
          {onlineComputers.length === 0 ? (
            <View style={{ padding: 16 }}>
              <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={theme.colors.label}
      style={{ alignSelf: "stretch", width: "100%" }}
    >
      <Button
        label={isRefreshing ? "Refreshing..." : "Refresh"}
        onPress={onRefresh}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: theme.colors.control,
      borderColor: theme.colors.controlBorder,
      borderRadius: radii.control,
      borderWidth: 1,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="outlined"
      />
    </Host>
            </View>
          ) : null}
        </View>
      )}
    </Section>
  );
}
