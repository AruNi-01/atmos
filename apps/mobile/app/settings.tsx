import { Stack } from "expo-router";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function SettingsRoute() {
  return (
    <>
      <SettingsScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Settings")} />
    </>
  );
}
