import { View } from "react-native";
import type { ComputerRow } from "@/api/types";
import { EmptyState, Section } from "@/ui/layout/app-screen";
import { NativeButton, NativeList, NativeListItem } from "@/ui/primitives/native-controls";

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
            <NativeButton label={isRefreshing ? "Refreshing..." : "Refresh"} onPress={onRefresh} />
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
              <NativeButton label={isRefreshing ? "Refreshing..." : "Refresh"} onPress={onRefresh} />
            </View>
          ) : null}
        </View>
      )}
    </Section>
  );
}
