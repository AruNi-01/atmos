import { Stack } from "expo-router";
import { SettingsComputersScreen } from "@/features/settings/SettingsScreen";
import { useMobileTheme } from "@/theme/theme-store";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function SettingsComputersRoute() {
  const theme = useMobileTheme();

  return (
    <>
      <SettingsComputersScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Atmos Computer", theme.colors)} />
    </>
  );
}
