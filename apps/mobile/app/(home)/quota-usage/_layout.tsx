import { Stack } from "expo-router";
import { useMobileTheme } from "@/theme/theme-store";
import { navigationBarTint } from "@/ui/navigation/home-header-items";

export default function QuotaUsageTabStack() {
  const theme = useMobileTheme();
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
        headerShown: true,
        headerTintColor: navigationBarTint(theme.colors.label),
      }}
    />
  );
}
