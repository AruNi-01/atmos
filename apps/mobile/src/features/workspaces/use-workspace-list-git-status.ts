import { useQuery } from "@tanstack/react-query";
import { wsActions } from "@/api/ws-actions";
import {
  indexGitStatus,
  type WorkspaceListGitStatus,
} from "@/features/workspaces/workspace-list-git-status";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";

/** One `git_get_status_batch` for the expanded project-group paths. Same action as web `gitApi.getStatuses`. */
export function useWorkspaceListGitStatus(
  paths: readonly string[],
): Map<string, WorkspaceListGitStatus> {
  const { client, state } = useMobileWs();
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
  const pathKey = paths.join("\n");
  const query = useQuery({
    enabled: Boolean(client && state === "open" && paths.length > 0),
    queryFn: () => {
      if (!client) throw new Error("Atmos mobile WebSocket is not connected");
      return wsActions.gitGetStatuses(client, [...paths]);
    },
    queryKey: ["workspace-list-git-status", selectedServerId, state, pathKey],
  });
  return indexGitStatus(query.data?.results);
}
