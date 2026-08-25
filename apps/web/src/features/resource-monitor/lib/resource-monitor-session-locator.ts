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
 * Pass `project_id` for project-direct sessions and `workspace_id` for
 * workspace sessions. Never guesses when the live pane is missing.
 */
export function findResourceMonitorSessionLocation(
  workspacePanes: LiveResourceSessionPanes | null | undefined,
  hostId: string,
  sessionId: string | null | undefined,
): LiveResourceSessionLocation | null {
  return findLiveResourceSessionLocation(workspacePanes, hostId, sessionId);
}

/** @deprecated Use `findResourceMonitorSessionLocation`. */
export const findLiveResourceSessionLocationForMonitor =
  findResourceMonitorSessionLocation;

export { findLiveResourceSessionLocation, parseTerminalWorkspaceScopeKey };
