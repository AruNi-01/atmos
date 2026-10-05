import { Stack } from "expo-router";
import { QuotaSettingsScreen } from "@/features/quota-usage/QuotaSettingsScreen";
import { useMobileTheme } from "@/theme/theme-store";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function QuotaSettingsRoute() {
  const theme = useMobileTheme();

  return (
    <>
      <QuotaSettingsScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Settings", theme.colors)} />
    </>
  );
}
