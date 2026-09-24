import { View } from "react-native";
import type { ComputerRow } from "@/api/types";
import { Row, Separator } from "@/ui/layout/row";

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
            <Row
              onPress={press}
              subtitle={selected ? "Selected" : computer.online ? "Online" : "Offline"}
              title={computer.display_name ?? computer.server_id}
            />
          </View>
        );
      })}
    </View>
  );
}
