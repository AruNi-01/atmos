import { Stack } from "expo-router";
import { SessionHomeScreen } from "@/features/sessions/SessionInboxScreen";
import { useMobileTheme } from "@/theme/theme-store";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function SessionTabRoute() {
  const theme = useMobileTheme();

  return (
    <>
      <Stack.Screen options={nativeLargeTitleOptions("Session", theme.colors)} />
      <SessionHomeScreen />
    </>
  );
}
