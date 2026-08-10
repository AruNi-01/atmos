"use client";

import { useDialogStore } from "@/app-shell/state/use-dialog-store";
import {
  useTaskWorkspaceDraftStore,
  type TaskWorkspaceLinearDraft,
  type TaskWorkspaceLinkDraft,
} from "@/features/task/store/task-workspace-draft-store";

/**
 * Open the New Workspace overlay with project + optional Issue/PR / Linear prefills.
 * Call from Task list rows or GitHub drawer Create Workspace actions.
 */
export function openTaskWorkspaceCreate(input: {
  projectId?: string | null | undefined;
  /** When true, leave Atmos project empty so the user chooses (e.g. Linear tasks). */
  requireProjectPick?: boolean;
  link?: TaskWorkspaceLinkDraft | null;
  displayName?: string | null;
  initialRequirement?: string | null;
  linearIssue?: TaskWorkspaceLinearDraft | null;
  setNewWorkspace: (value: boolean) => void | Promise<unknown>;
}) {
  const requireProjectPick = Boolean(input.requireProjectPick);
  const projectId = requireProjectPick ? "" : input.projectId?.trim() || "";
  if (requireProjectPick) {
    // Clear launcher selection so Welcome does not inherit the last sidebar project.
    useDialogStore.getState().setSelectedProjectId("");
  } else if (projectId) {
    useDialogStore.getState().setSelectedProjectId(projectId);
  }

  useTaskWorkspaceDraftStore.getState().setDraft({
    projectId,
    requireProjectPick,
    link: input.link ?? null,
    displayName: input.displayName ?? null,
    initialRequirement: input.initialRequirement ?? null,
    linearIssue: input.linearIssue ?? null,
  });

  // Persist Linear snapshot for post-create link even if draft is consumed early.
  if (input.linearIssue) {
    try {
      sessionStorage.setItem(
        "atmos.pendingLinearLink",
        JSON.stringify(input.linearIssue),
      );
    } catch {
      /* ignore quota / private mode */
    }
  }

  void input.setNewWorkspace(true);
}
