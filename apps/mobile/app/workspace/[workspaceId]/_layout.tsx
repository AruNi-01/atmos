import { Stack } from "expo-router";
import { useMobileTheme } from "@/theme/theme-store";

export default function WorkspaceStack() {
  const theme = useMobileTheme();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: theme.colors.background },
          headerBackButtonDisplayMode: "minimal",
          headerShadowVisible: false,
          headerTintColor: theme.colors.label,
        }}
      />
    </>
  );
}
