import { useLocalSearchParams } from "expo-router";
import { CreateWorkspaceScreen } from "@/features/workspaces/CreateWorkspaceScreen";

export default function CreateWorkspaceRoute() {
  const { projectGuid } = useLocalSearchParams<{ projectGuid?: string }>();
  return <CreateWorkspaceScreen initialProjectGuid={projectGuid} />;
}
