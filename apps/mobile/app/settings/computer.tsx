import { Stack } from "expo-router";
import { SettingsComputerDetailScreen } from "@/features/settings/SettingsScreen";
import { useMobileTheme } from "@/theme/theme-store";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function SettingsComputerRoute() {
  const theme = useMobileTheme();

  return (
    <>
      <SettingsComputerDetailScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Computer", theme.colors)} />
    </>
  );
}
