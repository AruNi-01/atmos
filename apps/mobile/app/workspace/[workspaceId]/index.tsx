import { useLocalSearchParams } from "expo-router";
import { WorkspaceEntryScreen } from "@/features/workspaces/WorkspaceEntryScreen";

export default function WorkspaceEntryRoute() {
  const params = useLocalSearchParams<{ workspaceId: string }>();
  return <WorkspaceEntryScreen workspaceId={firstParam(params.workspaceId)} />;
}

function firstParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ?? "";
}
