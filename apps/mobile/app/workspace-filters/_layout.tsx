import { Stack } from "expo-router";
import { useMobileTheme } from "@/theme/theme-store";

export default function WorkspaceFiltersLayout() {
  const theme = useMobileTheme();

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: theme.colors.sheetBackground },
        headerShadowVisible: false,
        headerTintColor: theme.colors.label,
      }}
    />
  );
}
