import {
  findLiveResourceSessionLocation,
  parseTerminalWorkspaceScopeKey,
  type LiveResourceSessionLocation,
  type LiveResourceSessionPanes,
} from "@/features/terminal/public";

export type {
  LiveResourceSessionLocation,
  LiveResourceSessionPanes,
} from "@/features/terminal/public";

/**
 * Resource Monitor entry for resolving a live session to its Center Space
 * and terminal pane. Delegates to the terminal-owned locator.
 */
export function findLiveResourceSessionLocationForMonitor(
  workspacePanes: LiveResourceSessionPanes | null | undefined,
  hostId: string,
  sessionId: string | null | undefined,
): LiveResourceSessionLocation | null {
  return findLiveResourceSessionLocation(workspacePanes, hostId, sessionId);
}

export { findLiveResourceSessionLocation, parseTerminalWorkspaceScopeKey };
