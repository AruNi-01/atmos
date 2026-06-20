import { useLocalSearchParams } from "expo-router";
import { WorkspaceScreen } from "@/features/workspaces/WorkspaceScreen";

export default function WorkspaceRoute() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  return <WorkspaceScreen workspaceId={workspaceId} />;
}
