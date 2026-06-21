import { Stack, useLocalSearchParams } from "expo-router";
import { CreateWorkspaceScreen } from "@/features/workspaces/CreateWorkspaceScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { useMobileTheme } from "@/theme/theme-store";

export default function CreateWorkspaceRoute() {
  const { projectGuid } = useLocalSearchParams<{ projectGuid?: string }>();
  const theme = useMobileTheme();

  return (
    <>
      <CreateWorkspaceScreen initialProjectGuid={projectGuid} />
      <Stack.Screen options={nativeLargeTitleOptions("New Workspace", theme.colors)} />
    </>
  );
}
