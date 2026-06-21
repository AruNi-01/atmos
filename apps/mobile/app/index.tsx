import { Platform, Pressable } from "react-native";
import { Stack, type NativeStackHeaderItem, useRouter } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";
import { WorkspaceListScreen } from "@/features/workspaces/WorkspaceListScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { SettingsIcon } from "@/ui/icons/lucide-native";
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
          headerRight:
            Platform.OS === "ios"
              ? undefined
              : () => <DashboardSettingsButton onPress={() => router.push("/settings")} />,
          unstable_headerRightItems:
            Platform.OS === "ios"
              ? () => buildHeaderRightItems({
                  onPressSettings: () => router.push("/settings"),
                  tintColor: theme.colors.label,
                })
              : undefined,
        }}
      />
    </>
  );
}

function buildHeaderRightItems({
  onPressSettings,
  tintColor,
}: {
  onPressSettings: () => void;
  tintColor: string;
}): NativeStackHeaderItem[] {
  return [
    {
      accessibilityLabel: "Settings",
      icon: sfSymbol("gearshape"),
      identifier: "dashboard-settings",
      label: "Settings",
      onPress: onPressSettings,
      tintColor,
      type: "button",
      variant: "plain",
    },
  ];
}

function DashboardSettingsButton({ onPress }: { onPress: () => void }) {
  const theme = useMobileTheme();

  return (
    <Pressable
      accessibilityLabel="Settings"
      accessibilityRole="button"
      hitSlop={12}
      onPress={onPress}
      style={{ paddingHorizontal: 12, paddingVertical: 8 }}
    >
      <SettingsIcon color={theme.colors.label} size={22} strokeWidth={2.4} />
    </Pressable>
  );
}

function sfSymbol(name: SFSymbol) {
  return { name, type: "sfSymbol" as const };
}
