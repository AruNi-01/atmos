import { Stack } from "expo-router";
import { SettingsIndexScreen } from "@/features/settings/SettingsScreen";
import { useMobileTheme } from "@/theme/theme-store";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function SettingsRoute() {
  const theme = useMobileTheme();

  return (
    <>
      <SettingsIndexScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Settings", theme.colors)} />
    </>
  );
}
