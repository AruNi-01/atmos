import type { TerminalWorkspaceCandidate } from "@/api/types";
import type { MobileTerminalEntry } from "@/stores/terminal-store";

export function createMobileTerminalSessionId(workspaceId: string) {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${workspaceId}:mobile:${Date.now().toString(36)}:${suffix}`;
}

export function createDefaultTerminalEntry(workspaceId: string): MobileTerminalEntry {
  const id = `${workspaceId}:default`;
  return {
    id,
    workspaceId,
    label: "Default terminal",
    sessionId: createMobileTerminalSessionId(workspaceId),
    isNew: true,
  };
}

export function sortTerminalEntries(entries: MobileTerminalEntry[]): MobileTerminalEntry[] {
  return [...entries].sort((left, right) => {
    const leftNew = left.isNew ? 1 : 0;
    const rightNew = right.isNew ? 1 : 0;
    if (leftNew !== rightNew) return leftNew - rightNew;

    const leftHasIndex = left.tmuxWindowIndex != null;
    const rightHasIndex = right.tmuxWindowIndex != null;
    if (leftHasIndex && rightHasIndex && left.tmuxWindowIndex !== right.tmuxWindowIndex) {
      return left.tmuxWindowIndex! - right.tmuxWindowIndex!;
    }
    if (leftHasIndex !== rightHasIndex) {
      return leftHasIndex ? -1 : 1;
    }

    const labelCmp = left.label.localeCompare(right.label);
    if (labelCmp !== 0) return labelCmp;
    return left.id.localeCompare(right.id);
  });
}

export function mergeTerminalCandidateEntries(
  workspaceId: string,
  candidates: TerminalWorkspaceCandidate[],
  existingEntries: MobileTerminalEntry[],
): MobileTerminalEntry[] {
  const existingById = new Map(existingEntries.map((entry) => [entry.id, entry]));
  const serverEntries = candidates.map((candidate) => {
    const existingEntry = existingById.get(candidate.id);

    return {
      id: candidate.id,
      workspaceId: candidate.workspace_id || workspaceId,
      label: candidate.label,
      sessionId: existingEntry?.sessionId ?? createMobileTerminalSessionId(workspaceId),
      tmuxWindowName: candidate.tmux_window_name ?? undefined,
      tmuxWindowIndex: candidate.tmux_window_index ?? undefined,
      dynamicTitle: existingEntry?.dynamicTitle,
      isNew: false,
    };
  });

  const serverIds = new Set(serverEntries.map((entry) => entry.id));
  const localEntries = existingEntries.filter(
    (entry) => !isDefaultTerminalEntry(entry, workspaceId) && !serverIds.has(entry.id),
  );

  return sortTerminalEntries([...serverEntries, ...localEntries]);
}

export function nextActiveTerminalEntryId(
  entries: MobileTerminalEntry[],
  currentActiveId: string | null | undefined,
): string | null {
  if (currentActiveId && entries.some((entry) => entry.id === currentActiveId)) {
    return currentActiveId;
  }

  if (entries.length > 0) {
    return entries[0]!.id;
  }

  return null;
}

export function resolveActiveTerminalEntry(
  entries: MobileTerminalEntry[],
  activeEntryId: string | null | undefined,
): MobileTerminalEntry | null {
  const nextActiveId = nextActiveTerminalEntryId(entries, activeEntryId);
  return nextActiveId ? entries.find((entry) => entry.id === nextActiveId) ?? null : null;
}

function isDefaultTerminalEntry(entry: MobileTerminalEntry, workspaceId: string) {
  return entry.id === `${workspaceId}:default` && entry.isNew;
}
