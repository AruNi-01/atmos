"use client";

import { useDialogStore } from "@/app-shell/state/use-dialog-store";
import {
  useTaskWorkspaceDraftStore,
  type TaskWorkspaceLinkDraft,
} from "@/features/task/store/task-workspace-draft-store";

/**
 * Open the New Workspace overlay with project + Issue/PR link prefilled.
 * Call from Task list rows or GitHub drawer Create Workspace actions.
 */
export function openTaskWorkspaceCreate(input: {
  projectId: string | null | undefined;
  link: TaskWorkspaceLinkDraft;
  setNewWorkspace: (value: boolean) => void | Promise<unknown>;
}) {
  const projectId = input.projectId?.trim() || "";
  if (projectId) {
    useDialogStore.getState().setSelectedProjectId(projectId);
    useTaskWorkspaceDraftStore.getState().setDraft({
      projectId,
      link: input.link,
    });
  } else {
    // Still open overlay; user picks project, link may not auto-apply without projectId.
    useTaskWorkspaceDraftStore.getState().setDraft({
      projectId: "",
      link: input.link,
    });
  }
  void input.setNewWorkspace(true);
}
