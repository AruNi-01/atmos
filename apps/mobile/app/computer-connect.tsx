import { Stack } from "expo-router";
import { ComputerConnectScreen } from "@/features/computers/ComputerConnectScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function ComputerConnectRoute() {
  return (
    <>
      <ComputerConnectScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Computer Connect")} />
    </>
  );
}
