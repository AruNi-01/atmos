import { useLocalSearchParams } from "expo-router";
import { WorkspaceSessionsScreen } from "@/features/sessions/WorkspaceSessionsScreen";

export default function WorkspaceSessionsRoute() {
  const params = useLocalSearchParams<{ workspaceId: string }>();
  const workspaceId = firstParam(params.workspaceId);
  return <WorkspaceSessionsScreen workspaceId={workspaceId} />;
}

function firstParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ?? "";
}
