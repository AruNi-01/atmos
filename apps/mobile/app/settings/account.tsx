import { Stack } from "expo-router";
import { SettingsAccountScreen } from "@/features/settings/SettingsAccountScreen";
import { useMobileTheme } from "@/theme/theme-store";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function SettingsAccountRoute() {
  const theme = useMobileTheme();

  return (
    <>
      <SettingsAccountScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Account", theme.colors)} />
    </>
  );
}
