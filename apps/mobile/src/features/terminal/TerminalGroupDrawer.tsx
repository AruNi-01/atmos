import { Text, View } from "react-native";
import { SessionRowList } from "@/features/sessions/session-row-list";
import type { SessionInboxRow } from "@/features/sessions/session-inbox";
import { getMobileThemeColors } from "@/theme/colors";
import { radii } from "@/theme/radii";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";

export function TerminalGroupDrawer({
  isPresented,
  onDismiss,
  onSelect,
  rows,
}: {
  isPresented: boolean;
  onDismiss: () => void;
  onSelect: (entryId: string) => void;
  rows: SessionInboxRow[];
}) {
  const colors = getMobileThemeColors("dark");

  return (
    <ExpoDrawer
      colorScheme="dark"
      isPresented={isPresented}
      matchContents={false}
      onDismiss={onDismiss}
      testID="terminal-group-drawer"
    >
      {rows.length === 0 ? (
        <Text style={{ color: colors.secondaryLabel, fontSize: 15, lineHeight: 20 }}>No sessions</Text>
      ) : (
        <View
          style={{
            alignSelf: "stretch",
            backgroundColor: colors.cardElevated,
            borderColor: colors.glassBorder,
            borderCurve: "continuous",
            borderRadius: radii.card,
            borderWidth: 0.5,
            overflow: "hidden",
            width: "100%",
          }}
        >
          <SessionRowList
            colors={colors}
            omitPlace
            onPress={(row) => onSelect(row.terminalCandidateId ?? row.id)}
            rows={rows}
          />
        </View>
      )}
    </ExpoDrawer>
  );
}
