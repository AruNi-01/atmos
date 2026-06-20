import { Stack } from "expo-router";
import { colors } from "@/theme/colors";

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.label,
      }}
    />
  );
}
