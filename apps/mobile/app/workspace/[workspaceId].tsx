import { useEffect, useRef } from "react";
import { useLocalSearchParams } from "expo-router";
import { matchingTerminalEntryId } from "@/features/terminal/terminal-selection";
import { WorkspaceScreen } from "@/features/workspaces/WorkspaceScreen";
import { useTerminalStore } from "@/stores/terminal-store";

export default function WorkspaceRoute() {
  const params = useLocalSearchParams<{ terminal?: string; workspaceId: string }>();
  const workspaceId = firstParam(params.workspaceId);
  const terminalId = firstParam(params.terminal);
  useFocusedTerminal(workspaceId, terminalId);
  return <WorkspaceScreen workspaceId={workspaceId} />;
}

function useFocusedTerminal(workspaceId: string, terminalId: string) {
  const entries = useTerminalStore((state) =>
    workspaceId ? state.entriesByWorkspaceId[workspaceId] : undefined,
  );
  const setActiveEntry = useTerminalStore((state) => state.setActiveEntry);
  const appliedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceId || !terminalId) return;
    const key = `${workspaceId}:${terminalId}`;
    if (appliedKeyRef.current === key) return;
    const match = matchingTerminalEntryId(entries ?? [], terminalId);
    if (!match) return;
    setActiveEntry(workspaceId, match);
    appliedKeyRef.current = key;
  }, [entries, setActiveEntry, terminalId, workspaceId]);
}

function firstParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ?? "";
}
