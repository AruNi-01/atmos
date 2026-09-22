import { Stack } from "expo-router";
import { useMobileTheme } from "@/theme/theme-store";

export default function WorkspaceTabStack() {
  const theme = useMobileTheme();

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
        headerShown: true,
        headerTintColor: theme.colors.label,
      }}
    />
  );
}
