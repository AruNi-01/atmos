import { Stack } from "expo-router";
import { WorkspacePickerScreen } from "@/features/workspaces/WorkspacePickerScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function WorkspacesRoute() {
  return (
    <>
      <WorkspacePickerScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Workspace")} />
    </>
  );
}
