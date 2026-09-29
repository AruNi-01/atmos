import { useQuery } from "@tanstack/react-query";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { flattenMentionFiles, type MentionFile } from "./composer-suggestions";
import { resolveChatScope } from "./scope";

export function useMentionFiles(workspaceId: string): MentionFile[] {
  const { client, state: wsState } = useMobileWs();
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
  const connected = Boolean(client && wsState === "open");
  const bootstrapQuery = useQuery({
    queryKey: ["workspace-bootstrap", selectedServerId, wsState],
    enabled: connected,
    queryFn: () => {
      if (!client) return Promise.reject(new Error("Atmos mobile WebSocket is not connected"));
      return wsActions.projectWorkspaceBootstrap(client);
    },
  });
  const scope = bootstrapQuery.data
    ? resolveChatScope(bootstrapQuery.data, workspaceId)
    : null;
  const cwd = scope?.ok ? scope.cwd : null;
  const filesQuery = useQuery({
    queryKey: ["agent-chat-mention-files", selectedServerId, cwd],
    enabled: Boolean(connected && cwd),
    queryFn: () => {
      if (!client || !cwd) return Promise.reject(new Error("Atmos mobile WebSocket is not connected"));
      return client.request("fs_list_project_files", {
        root_path: cwd,
        show_hidden: false,
      });
    },
  });

  return flattenMentionFiles(filesQuery.data?.tree, cwd ?? "");
}
