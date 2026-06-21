import { Stack } from "expo-router";
import { WorkspacePickerScreen } from "@/features/workspaces/WorkspacePickerScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { useMobileTheme } from "@/theme/theme-store";

export default function WorkspacesRoute() {
  const theme = useMobileTheme();

  return (
    <>
      <WorkspacePickerScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Workspace", theme.colors)} />
    </>
  );
}
