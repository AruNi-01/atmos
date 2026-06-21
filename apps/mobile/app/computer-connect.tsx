import { Stack } from "expo-router";
import { ComputerConnectScreen } from "@/features/computers/ComputerConnectScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { useMobileTheme } from "@/theme/theme-store";

export default function ComputerConnectRoute() {
  const theme = useMobileTheme();

  return (
    <>
      <ComputerConnectScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Computer Connect", theme.colors)} />
    </>
  );
}
