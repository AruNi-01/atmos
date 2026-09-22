import type { TerminalWorkspaceCandidate } from "@/api/types";
import type { MobileTerminalEntry } from "@/stores/terminal-store";

export function createMobileTerminalSessionId(workspaceId: string) {
  const bytes = new Uint8Array(5);
  globalThis.crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
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

/** Select a flattened terminal entry once, and only when that candidate id is loaded. */
export function matchingTerminalEntryId(
  entries: ReadonlyArray<{ id: string }>,
  requestedId: string | null | undefined,
): string | null {
  if (!requestedId) return null;
  return entries.some((entry) => entry.id === requestedId) ? requestedId : null;
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

export type TerminalGroupItem = {
  detail?: string;
  id: string;
  label: string;
};

export function tabItemsFromEntries(
  entries: MobileTerminalEntry[],
  titleFor?: (entry: MobileTerminalEntry) => string,
): TerminalGroupItem[] {
  const labels = entries.map((entry) => titleFor?.(entry) ?? entry.label);
  const labelCounts = new Map<string, number>();
  for (const label of labels) {
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  return entries.map((entry, index) => {
    const label = labels[index]!;
    return {
      detail: drawerDetail(entry, (labelCounts.get(label) ?? 0) > 1),
      id: entry.id,
      label,
    };
  });
}

function drawerDetail(entry: MobileTerminalEntry, duplicateLabel: boolean): string | undefined {
  if (entry.isNew) return "New";
  if (!duplicateLabel) return undefined;
  const windowLabel = entry.tmuxWindowIndex != null ? `Window ${entry.tmuxWindowIndex}` : undefined;
  const tail = entry.id.split(":").pop();
  if (windowLabel && tail && tail !== String(entry.tmuxWindowIndex)) {
    return `${windowLabel} · ${tail}`;
  }
  return windowLabel ?? (tail && tail !== entry.label ? tail : undefined);
}

function isDefaultTerminalEntry(entry: MobileTerminalEntry, workspaceId: string) {
  return entry.id === `${workspaceId}:default` && entry.isNew;
}
