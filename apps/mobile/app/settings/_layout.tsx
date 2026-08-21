import { Stack } from "expo-router";
import { useMobileTheme } from "@/theme/theme-store";

export default function SettingsLayout() {
  const theme = useMobileTheme();

  return (
    <Stack
      screenOptions={{
        // Keep page fill on contentStyle only — do not set headerStyle /
        // headerLargeStyle background on this stack. Large-title routes
        // (Settings index) disappear on iOS 26 when those are forced.
        contentStyle: { backgroundColor: theme.colors.sheetBackground },
        headerShadowVisible: false,
        headerTintColor: theme.colors.label,
        headerTitleStyle: { color: theme.colors.label },
      }}
    />
  );
}
