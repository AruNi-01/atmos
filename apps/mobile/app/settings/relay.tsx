import { Stack } from "expo-router";
import { SettingsRelayScreen } from "@/features/settings/SettingsScreen";
import { useMobileTheme } from "@/theme/theme-store";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function SettingsRelayRoute() {
  const theme = useMobileTheme();

  return (
    <>
      <SettingsRelayScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Relay", theme.colors)} />
    </>
  );
}
