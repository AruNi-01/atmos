import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MobileWsClient, MobileWsState } from "@/api/mobile-ws-client";
import { wsActions } from "@/api/ws-actions";
import type { MobileTerminalEntry } from "@/stores/terminal-store";
import {
  createDefaultTerminalEntry,
  mergeTerminalCandidateEntries,
} from "@/features/terminal/terminal-selection";

type UseTerminalCandidatesOptions = {
  appWsClient: MobileWsClient | null;
  appWsState: MobileWsState;
  entries: MobileTerminalEntry[];
  projectName?: string | null;
  selectedServerId: string | null;
  setEntries: (workspaceId: string, entries: MobileTerminalEntry[]) => void;
  workspaceId: string;
  workspaceName: string;
};

export function useTerminalCandidates({
  appWsClient,
  appWsState,
  entries,
  projectName,
  selectedServerId,
  setEntries,
  workspaceId,
  workspaceName,
}: UseTerminalCandidatesOptions) {
  const candidates = useQuery({
    queryKey: ["terminal-candidates", selectedServerId, workspaceId, projectName, workspaceName, appWsState],
    enabled: Boolean(appWsClient && appWsState === "open"),
    queryFn: () =>
      wsActions.terminalWorkspaceCandidates(appWsClient!, {
        workspace_id: workspaceId,
        project_name: projectName ?? null,
        workspace_name: workspaceName,
      }),
  });

  useEffect(() => {
    if (!candidates.isSuccess) return;

    const serverEntries = mergeTerminalCandidateEntries(workspaceId, candidates.data.candidates, entries);
    if (serverEntries.length > 0) {
      if (!sameTerminalEntries(entries, serverEntries)) {
        setEntries(workspaceId, serverEntries);
      }
      return;
    }

    if (entries.length === 0) {
      setEntries(workspaceId, [createDefaultTerminalEntry(workspaceId)]);
    }
  }, [candidates.data, candidates.isSuccess, entries, setEntries, workspaceId]);

  return candidates;
}

function sameTerminalEntries(left: MobileTerminalEntry[], right: MobileTerminalEntry[]) {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const next = right[index];
    return (
      entry.id === next.id &&
      entry.label === next.label &&
      entry.sessionId === next.sessionId &&
      entry.tmuxWindowName === next.tmuxWindowName &&
      entry.tmuxWindowIndex === next.tmuxWindowIndex &&
      entry.dynamicTitle === next.dynamicTitle &&
      entry.isNew === next.isNew
    );
  });
}
