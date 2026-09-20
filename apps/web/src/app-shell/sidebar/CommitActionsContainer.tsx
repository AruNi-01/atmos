"use client";

import React from "react";
import { CommitActions } from "@/app-shell/sidebar/CommitActions";
import { useDialogStore } from "@/app-shell/state/use-dialog-store";
import { useAgentChatStatusStore } from "@/features/agent/store/agent-chat-status-store";
import { useGitStore } from "@/features/git/store/use-git-store";
import { useGitChangedFilesQuery } from "@/features/git/hooks/use-git-changed-files-query";
import { useGitStatusQuery } from "@/features/git/hooks/use-git-status-query";
import type { GitChangedFile } from "@/api/ws-api";

interface ProjectLike {
  id: string;
  name: string;
}

interface WorkspaceLike {
  id: string;
  name?: string;
  localPath?: string | null;
}

interface CommitActionsContainerProps {
  className?: string;
  variant?: "sidebar" | "panel";
  currentProjectPath: string | null;
  currentProject: ProjectLike | undefined;
  currentWorkspace: WorkspaceLike | undefined;
  workspaceId: string | null | undefined;
  projectId: string | null | undefined;
}

const EMPTY_FILES: GitChangedFile[] = [];

export function CommitActionsContainer({
  className,
  variant,
  currentProjectPath,
  currentProject,
  currentWorkspace,
  workspaceId,
  projectId,
}: CommitActionsContainerProps) {
  const {
    setCurrentRepoPath,
    commitChanges,
    pushChanges,
    pullChanges,
    fetchChanges,
    syncChanges,
    stageFiles,
    stageAllUnstaged,
  } = useGitStore();

  const { enqueueAgentChatPrompt, setPendingAgentChatMode } = useDialogStore();
  const agentHasAgents = useAgentChatStatusStore((s) => s.hasInstalledAgents);
  const agentIsConnected = useAgentChatStatusStore((s) => s.isConnected);
  const agentIsBusy = useAgentChatStatusStore((s) => s.isBusy);

  const worktreeQuery = useGitChangedFilesQuery(currentProjectPath);
  const statusQuery = useGitStatusQuery(currentProjectPath);

  const stagedFiles = worktreeQuery.data?.staged_files ?? EMPTY_FILES;
  const unstagedFiles = worktreeQuery.data?.unstaged_files ?? EMPTY_FILES;
  const untrackedFiles = worktreeQuery.data?.untracked_files ?? EMPTY_FILES;
  const isBranchPublished = worktreeQuery.data?.is_branch_published ?? true;
  const gitStatus = statusQuery.data ?? null;

  React.useEffect(() => {
    setCurrentRepoPath(currentProjectPath);
  }, [currentProjectPath, setCurrentRepoPath]);

  const hasChanges =
    stagedFiles.length > 0 ||
    unstagedFiles.length > 0 ||
    untrackedFiles.length > 0;

  const stageAllUnstagedFn = React.useCallback(async () => {
    await stageAllUnstaged(unstagedFiles.map((f) => f.path));
  }, [stageAllUnstaged, unstagedFiles]);

  const stageFilesFn = React.useCallback(
    async (files: string[]) => {
      if (currentProjectPath) await stageFiles(files);
    },
    [stageFiles, currentProjectPath],
  );

  return (
    <CommitActions
      className={className}
      variant={variant}
      currentProjectPath={currentProjectPath}
      currentProject={currentProject}
      currentWorkspace={currentWorkspace}
      workspaceId={workspaceId}
      projectId={projectId}
      stagedFiles={stagedFiles}
      unstagedFiles={unstagedFiles}
      untrackedFiles={untrackedFiles}
      isBranchPublished={isBranchPublished}
      gitStatus={gitStatus}
      hasChanges={hasChanges}
      commitChanges={commitChanges}
      pushChanges={pushChanges}
      stageAllUnstaged={stageAllUnstagedFn}
      pullChanges={pullChanges}
      fetchChanges={fetchChanges}
      syncChanges={syncChanges}
      agentHasAgents={agentHasAgents}
      agentIsConnected={agentIsConnected}
      agentIsBusy={agentIsBusy}
      enqueueAgentChatPrompt={enqueueAgentChatPrompt}
      setPendingAgentChatMode={setPendingAgentChatMode}
    />
  );
}
