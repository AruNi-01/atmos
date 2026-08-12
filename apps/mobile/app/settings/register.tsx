import { Stack } from "expo-router";
import { SettingsRegisterScreen } from "@/features/settings/SettingsScreen";
import { useMobileTheme } from "@/theme/theme-store";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function SettingsRegisterRoute() {
  const theme = useMobileTheme();

  return (
    <>
      <SettingsRegisterScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Register", theme.colors)} />
    </>
  );
}
