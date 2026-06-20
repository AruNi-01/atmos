import { Stack } from "expo-router";
import { SettingsComputersScreen } from "@/features/settings/SettingsScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function SettingsComputersRoute() {
  return (
    <>
      <SettingsComputersScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Atmos Computer")} />
    </>
  );
}
