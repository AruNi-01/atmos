import type { MobileTerminalEntry } from "@/stores/terminal-store";
import type { SessionInboxRow } from "./session-inbox";

/** Sessions that belong to the open project or workspace. */
export function rowsInScope(
  rows: readonly SessionInboxRow[],
  workspaceIds: ReadonlySet<string>,
  projectName?: string | null,
): SessionInboxRow[] {
  const project = projectName?.trim() || null;
  return rows.filter((row) => {
    if (row.workspaceId && workspaceIds.has(row.workspaceId)) return true;
    return Boolean(row.projectScoped && project && row.projectName === project);
  });
}

/**
 * Terminal switcher rows, in terminal order. Inbox metadata fills the status
 * icon and time when this window is already a session.
 */
export function rowsForTerminalEntries(
  entries: readonly MobileTerminalEntry[],
  inboxRows: readonly SessionInboxRow[],
  titleFor: (entry: MobileTerminalEntry) => string,
): SessionInboxRow[] {
  return entries.map((entry) => {
    const match = inboxRows.find((row) => row.terminalCandidateId === entry.id || row.id === entry.id);
    const title = titleFor(entry);
    if (!match) {
      return {
        archiveSessionId: null,
        branch: null,
        bucket: "done",
        id: entry.id,
        prState: null,
        projectName: null,
        projectScoped: false,
        terminalCandidateId: entry.id,
        title,
        updatedAt: null,
        workspaceId: entry.workspaceId,
        workspaceName: null,
      };
    }
    return {
      ...match,
      id: entry.id,
      projectName: null,
      terminalCandidateId: entry.id,
      title,
      workspaceName: null,
    };
  });
}
