import { Stack } from "expo-router";
import { SettingsIndexScreen } from "@/features/settings/SettingsScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function SettingsRoute() {
  return (
    <>
      <SettingsIndexScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Settings")} />
    </>
  );
}
