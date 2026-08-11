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

/** Local mobile terminal tab (not from server candidates). Becomes active after append. */
export function createLocalTerminalEntry(
  workspaceId: string,
  existingEntries: MobileTerminalEntry[],
): MobileTerminalEntry {
  return {
    id: `${workspaceId}:mobile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    workspaceId,
    label: `Terminal ${existingEntries.length + 1}`,
    sessionId: createMobileTerminalSessionId(workspaceId),
    isNew: true,
  };
}

/**
 * Append a local terminal and select it. Pure helper for the flat multi-tab model:
 * server candidates stay as discrete tabs; new tabs append and become active.
 */
export function appendLocalTerminalEntry(
  workspaceId: string,
  existingEntries: MobileTerminalEntry[],
): { activeEntryId: string; entries: MobileTerminalEntry[]; entry: MobileTerminalEntry } {
  const entry = createLocalTerminalEntry(workspaceId, existingEntries);
  return {
    activeEntryId: entry.id,
    entries: [...existingEntries, entry],
    entry,
  };
}

/** Short label for the top tab strip (keeps chrome compact). */
export function terminalTabLabel(entry: Pick<MobileTerminalEntry, "dynamicTitle" | "label" | "oscTitle">): string {
  const raw = (entry.oscTitle ?? entry.dynamicTitle ?? entry.label).trim();
  if (!raw) return "Terminal";
  if (raw.length <= 22) return raw;
  return `${raw.slice(0, 20)}…`;
}

export function mergeTerminalCandidateEntries(
  workspaceId: string,
  candidates: TerminalWorkspaceCandidate[],
  existingEntries: MobileTerminalEntry[],
): MobileTerminalEntry[] {
  const existingById = new Map(existingEntries.map((entry) => [entry.id, entry]));
  const serverEntries = candidates.map((candidate) => {
    const existingEntry =
      existingById.get(candidate.id) ??
      existingEntries.find(
        (entry) =>
          entry.tmuxWindowIndex != null &&
          candidate.tmux_window_index != null &&
          entry.tmuxWindowIndex === candidate.tmux_window_index,
      ) ??
      existingEntries.find(
        (entry) =>
          entry.tmuxWindowName &&
          candidate.tmux_window_name &&
          entry.tmuxWindowName === candidate.tmux_window_name,
      );

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

  const localEntries = existingEntries.filter(
    (entry) =>
      !isDefaultTerminalEntry(entry, workspaceId) &&
      !serverEntries.some((serverEntry) => representsSameTerminal(entry, serverEntry)),
  );

  return [...serverEntries, ...localEntries];
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

function representsSameTerminal(left: MobileTerminalEntry, right: MobileTerminalEntry) {
  if (left.id === right.id) return true;
  if (left.tmuxWindowIndex != null && left.tmuxWindowIndex === right.tmuxWindowIndex) return true;
  if (left.tmuxWindowName && left.tmuxWindowName === right.tmuxWindowName) return true;
  return false;
}
