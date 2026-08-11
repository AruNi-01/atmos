import type { TerminalWorkspaceCandidate } from "@/api/types";
import type { MobileTerminalEntry } from "@/stores/terminal-store";

/** Cryptographically strong short id fragment (avoids Math.random for session ids). */
function randomIdFragment(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += (byte % 36).toString(36);
  }
  return out;
}

/**
 * Shell host/cwd OSC titles that crowd the tab strip without identifying work.
 * Keep this local so pure selection helpers stay free of shared title deps.
 */
function isLikelyNoisyOscTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return true;
  // user@host:path / user@host:~ forms from common shells
  if (/^[^@\s]+@[^:\s]+:/.test(t)) return true;
  // Bare shell process names
  if (/^(?:zsh|bash|sh|fish|nu|csh|tcsh|ksh)$/i.test(t)) return true;
  return false;
}

export function createMobileTerminalSessionId(workspaceId: string) {
  const suffix = randomIdFragment(8);
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
    id: `${workspaceId}:mobile-${Date.now()}-${randomIdFragment(5)}`,
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

/**
 * Short label for the top tab strip (keeps chrome compact).
 * Prefer the dynamic command title; only surface OSC when it is non-empty and
 * not shell host/cwd noise. Empty strings must not block fallbacks (`??` alone
 * treats `""` as present).
 */
export function terminalTabLabel(entry: Pick<MobileTerminalEntry, "dynamicTitle" | "label" | "oscTitle">): string {
  const osc = entry.oscTitle?.trim() ?? "";
  const usableOsc = osc && !isLikelyNoisyOscTitle(osc) ? osc : "";
  const raw =
    [entry.dynamicTitle, usableOsc, entry.label]
      .map((value) => value?.trim())
      .find((value) => value) ?? "Terminal";
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
