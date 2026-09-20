import { Stack } from "expo-router";
import { WorkspaceListScreen } from "@/features/workspaces/WorkspaceListScreen";
import { AccountPopoverButton } from "@/features/onboarding/AccountPopoverButton";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { useMobileTheme } from "@/theme/theme-store";

export default function IndexRoute() {
  const theme = useMobileTheme();

  return (
    <>
      <WorkspaceListScreen />
      <Stack.Screen
        options={{
          ...nativeLargeTitleOptions("Atmos", theme.colors),
          headerRight: () => <AccountPopoverButton />,
        }}
      />
    </>
  );
}
