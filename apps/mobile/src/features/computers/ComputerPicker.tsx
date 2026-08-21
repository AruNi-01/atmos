import { useMobileTheme } from "@/theme/theme-store";
import { expoUiButtonStretchModifiers } from "@/ui/primitives/expo-ui-button-modifiers";
import { Button, Host } from "@expo/ui";
import { Platform, View } from "react-native";
import type { ComputerRow } from "@/api/types";
import { EmptyState, Section } from "@/ui/layout/app-screen";
import { NativeList, NativeListItem } from "@/ui/primitives/native-controls";
import { expoUiButtonHostStyle, expoUiSecondaryStyle } from "@/ui/primitives/expo-ui-button-styles";

const buttonStretchModifiers = expoUiButtonStretchModifiers;

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
  const refreshStyle = expoUiSecondaryStyle(theme.colors, Boolean(isRefreshing));

  const refreshButton = (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={refreshStyle.seedColor}
      style={expoUiButtonHostStyle}
    >
      <Button
        label={isRefreshing ? "Refreshing..." : "Refresh"}
        onPress={onRefresh}
        modifiers={buttonStretchModifiers}
        style={refreshStyle.style}
        variant={refreshStyle.variant}
      />
    </Host>
  );

  return (
    <Section label="Computer">
      {activeComputers.length === 0 ? (
        <View>
          <EmptyState
            layout="section"
            title="No Computers"
            message="Register a server, then refresh."
          />
          <View style={{ padding: 16, paddingTop: 0 }}>{refreshButton}</View>
        </View>
      ) : (
        <View>
          <NativeList>
            {activeComputers.map((computer) => (
              <NativeListItem
                key={computer.server_id}
                title={computer.display_name ?? computer.server_id}
                supportingText={computer.online ? "Online" : "Offline"}
                trailing={
                  computer.server_id === selectedServerId
                    ? "Selected"
                    : computer.online
                      ? "Online"
                      : "Offline"
                }
                onPress={computer.online ? () => onSelect(computer.server_id) : undefined}
              />
            ))}
          </NativeList>
          {onlineComputers.length === 0 ? (
            <View style={{ padding: 16 }}>{refreshButton}</View>
          ) : null}
        </View>
      )}
    </Section>
  );
}
