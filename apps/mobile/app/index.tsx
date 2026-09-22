import { Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { WorkspaceListScreen } from "@/features/workspaces/WorkspaceListScreen";
import { SettingsIcon } from "@/ui/icons/lucide-native";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { useMobileTheme } from "@/theme/theme-store";

export default function IndexRoute() {
  const router = useRouter();
  const theme = useMobileTheme();

  return (
    <>
      <WorkspaceListScreen />
      <Stack.Screen
        options={{
          ...nativeLargeTitleOptions("Atmos", theme.colors),
          headerRight: () => (
            <Pressable
              accessibilityLabel="Settings"
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => router.push("/settings")}
              style={{ paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <SettingsIcon color={theme.colors.label} size={22} strokeWidth={2.4} />
            </Pressable>
          ),
        }}
      />
    </>
  );
}
