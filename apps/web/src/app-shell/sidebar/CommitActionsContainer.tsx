"use client";

import React from "react";
import { CommitActions } from "@/app-shell/sidebar/CommitActions";
import { useDialogStore } from "@/app-shell/state/use-dialog-store";
import { useAgentChatUrl } from "@/features/agent/hooks/use-agent-chat-url";
import { useAgentChatStatusStore } from "@/features/agent/store/agent-chat-status-store";
import { useGitStore } from "@/features/git/store/use-git-store";

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
    stagedFiles,
    unstagedFiles,
    untrackedFiles,
    setCurrentRepoPath,
    isBranchPublished,
    commitChanges,
    pushChanges,
    stageAllUnstaged,
    pullChanges,
    fetchChanges,
    syncChanges,
    gitStatus,
  } = useGitStore();
  const { enqueueAgentChatPrompt, setPendingAgentChatMode } = useDialogStore();
  const [, setAgentChatOpen] = useAgentChatUrl();
  const agentHasAgents = useAgentChatStatusStore((s) => s.hasInstalledAgents);
  const agentIsConnected = useAgentChatStatusStore((s) => s.isConnected);
  const agentIsBusy = useAgentChatStatusStore((s) => s.isBusy);

  React.useEffect(() => {
    setCurrentRepoPath(currentProjectPath);
  }, [currentProjectPath, setCurrentRepoPath]);

  const hasChanges =
    stagedFiles.length > 0 ||
    unstagedFiles.length > 0 ||
    untrackedFiles.length > 0;

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
      stageAllUnstaged={stageAllUnstaged}
      pullChanges={pullChanges}
      fetchChanges={fetchChanges}
      syncChanges={syncChanges}
      agentHasAgents={agentHasAgents}
      agentIsConnected={agentIsConnected}
      agentIsBusy={agentIsBusy}
      enqueueAgentChatPrompt={enqueueAgentChatPrompt}
      setPendingAgentChatMode={setPendingAgentChatMode}
      setAgentChatOpen={setAgentChatOpen}
    />
  );
}
