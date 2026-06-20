import { Stack, useLocalSearchParams } from "expo-router";
import { CreateWorkspaceScreen } from "@/features/workspaces/CreateWorkspaceScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function CreateWorkspaceRoute() {
  const { projectGuid } = useLocalSearchParams<{ projectGuid?: string }>();
  return (
    <>
      <CreateWorkspaceScreen initialProjectGuid={projectGuid} />
      <Stack.Screen options={nativeLargeTitleOptions("New Workspace")} />
    </>
  );
}
