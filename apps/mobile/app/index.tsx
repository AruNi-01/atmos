import { Platform } from "react-native";
import { Stack, type NativeStackHeaderItem, useRouter } from "expo-router";
import { WorkspaceListScreen } from "@/features/workspaces/WorkspaceListScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { NativeButton } from "@/ui/primitives/native-controls";
import { colors } from "@/theme/colors";

export default function IndexRoute() {
  const router = useRouter();

  return (
    <>
      <WorkspaceListScreen />
      <Stack.Screen
        options={{
          ...nativeLargeTitleOptions("Atmos"),
          headerRight:
            Platform.OS === "ios"
              ? undefined
              : () => <NativeButton label="Settings" onPress={() => router.push("/settings")} variant="text" />,
          unstable_headerRightItems:
            Platform.OS === "ios"
              ? () => buildHeaderRightItems({ onPressSettings: () => router.push("/settings") })
              : undefined,
        }}
      />
    </>
  );
}

function buildHeaderRightItems({
  onPressSettings,
}: {
  onPressSettings: () => void;
}): NativeStackHeaderItem[] {
  return [
    {
      accessibilityLabel: "Settings",
      identifier: "dashboard-settings",
      label: "Settings",
      onPress: onPressSettings,
      tintColor: colors.label,
      type: "button",
      variant: "plain",
    },
  ];
}
