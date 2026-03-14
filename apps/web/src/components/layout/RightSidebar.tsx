"use client";

import React, {
  useState,
  useEffect,
  useMemo,
} from "react";
import { useGitStore } from "@/hooks/use-git-store";
import { useEditorStore } from "@/hooks/use-editor-store";
import { useProjectStore } from "@/hooks/use-project-store";
import {
  Check,
  Tabs,
  TabsList,
  TabsTab,
} from "@workspace/ui";
import {
  GitBranch,
  Play,
  GitPullRequest,
  FolderOpen,
  GitCommit as GitCommitIcon,
} from "lucide-react";
import { Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryState, useQueryStates } from "nuqs";
import {
  centerStageParams,
  rightSidebarParams,
  rightSidebarModalParams,
  type RightSidebarTab,
} from "@/lib/nuqs/searchParams";
import { useContextParams } from "@/hooks/use-context-params";
import type { ActionRun } from "@/components/github/ActionsPanel";
import dynamic from "next/dynamic";
import { useDialogStore } from "@/hooks/use-dialog-store";
import { useGitInfoStore } from "@/hooks/use-git-info-store";
import { PRPanel } from "@/components/github/PRPanel";
import { CommitsPanel } from "@/components/github/CommitsPanel";
import { ActionsPanel } from "@/components/github/ActionsPanel";
import { useAgentChatUrl } from "@/hooks/use-agent-chat-url";
import { useAgentChatStatusStore } from "@/hooks/use-agent-chat-status";

import { ChangeSection } from '@/components/layout/sidebar/ChangeSection';
import { ChangesViewSwitcher } from '@/components/layout/sidebar/ChangesViewSwitcher';
import { CommitActions } from '@/components/layout/sidebar/CommitActions';
import { RightSidebarDialogs, type ConfirmDialogState } from '@/components/layout/sidebar/RightSidebarDialogs';

const AgentChatPanel = dynamic(
  () => import("@/components/agent/AgentChatPanel").then((m) => m.AgentChatPanel),
  { ssr: false },
);
const RunPreviewPanel = dynamic(
  () => import("@/components/run-preview/RunPreviewPanel").then((m) => m.RunPreviewPanel),
  { ssr: false },
);

interface RightSidebarProps {
  // kept for compatibility if needed, but unused
  changes?: unknown[];
}

const RightSidebar: React.FC<RightSidebarProps> = () => {
  const { workspaceId, projectId: projectIdFromUrl } = useContextParams();
  const currentProjectPath = useEditorStore(s => s.currentProjectPath);
  const projects = useProjectStore(s => s.projects);
  const {
    setCodeReviewDialogOpen,
    enqueueAgentChatPrompt,
    setPendingAgentChatMode,
  } = useDialogStore();
  const [, setAgentChatOpen] = useAgentChatUrl();
  const agentHasAgents = useAgentChatStatusStore((s) => s.hasInstalledAgents);
  const agentIsConnected = useAgentChatStatusStore((s) => s.isConnected);
  const agentIsBusy = useAgentChatStatusStore((s) => s.isBusy);

  const currentProject = useMemo(
    () => projects.find(
      (p) =>
        (workspaceId && p.workspaces.some((w) => w.id === workspaceId)) ||
        (!workspaceId && projectIdFromUrl === p.id),
    ),
    [projects, workspaceId, projectIdFromUrl],
  );
  const currentWorkspace = useMemo(
    () => currentProject?.workspaces.find(
      (w) => w.id === workspaceId,
    ),
    [currentProject, workspaceId],
  );

  const effectiveContextId = workspaceId || projectIdFromUrl;

  const {
    stagedFiles,
    unstagedFiles,
    untrackedFiles,
    setCurrentRepoPath,
    refreshGitStatus,
    refreshChangedFiles,
    isBranchPublished,
    commitChanges,
    pushChanges,
    stageFiles,
    unstageFiles,
    discardUnstagedChanges,
    discardUntrackedFiles,
    stageAllUnstaged,
    stageAllUntracked,
    unstageAll,
    discardAllUnstaged,
    discardAllUntracked,
    pullChanges,
    fetchChanges,
    syncChanges,
    isLoading,
    gitStatus,
  } = useGitStore();

  const [isGlobalActionLoading, setIsGlobalActionLoading] = useState(false);

  const [{ rsTab: activeTab, rsView: changesView }, setSidebarParams] =
    useQueryStates(rightSidebarParams);
  const [activeCenterTab] = useQueryState("tab", centerStageParams.tab);
  const [
    { rsPr: activePrNumber, rsRunId: activeRunId, rsCreatePr },
    setModalParams,
  ] = useQueryStates(rightSidebarModalParams);
  const { activeActionRun, setActiveActionRun } = useDialogStore();

  const [changesSubTab, setChangesSubTab] = useState<"changes" | "commits">(
    "changes",
  );
  const [prRefreshKey, setPrRefreshKey] = useState(0);
  const [actionsRefreshKey, setActionsRefreshKey] = useState(0);

  const { githubOwner, githubRepo, currentBranch } = useGitInfoStore();

  const [confirmDialog, setConfirmDialog] = useState<
    ConfirmDialogState & { action: () => Promise<void> }
  >({
    isOpen: false,
    title: "",
    description: "",
    action: async () => {},
    confirmLabel: "Confirm",
    isDestructive: false,
  });

  const confirmAction = (
    title: string,
    description: React.ReactNode,
    action: () => Promise<void>,
    confirmLabel = "Confirm",
    isDestructive = false,
  ) => {
    setConfirmDialog({
      isOpen: true,
      title,
      description,
      action,
      confirmLabel,
      isDestructive,
    });
  };

  const handleConfirm = async () => {
    setIsGlobalActionLoading(true);
    try {
      await confirmDialog.action();
    } catch (e) {
      console.error(e);
    } finally {
      setIsGlobalActionLoading(false);
      setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
    }
  };

  const handleDiscardUnstaged = (files: string[]) => {
    confirmAction(
      "Discard Changes?",
      `Are you sure you want to discard changes in ${files.length} file(s)? This action cannot be undone.`,
      async () => await discardUnstagedChanges(files),
      "Discard Changes",
      true,
    );
  };

  const handleDiscardUntracked = (files: string[]) => {
    confirmAction(
      "Delete Files?",
      `Are you sure you want to delete ${files.length} untracked file(s)? This action cannot be undone.`,
      async () => await discardUntrackedFiles(files),
      "Delete Files",
      true,
    );
  };

  const handleDiscardAllUnstaged = () => {
    confirmAction(
      "Discard All Changes?",
      "Are you sure you want to discard all unstaged changes? This action cannot be undone.",
      async () => await discardAllUnstaged(),
      "Discard All",
      true,
    );
  };

  const handleDiscardAllUntracked = () => {
    confirmAction(
      "Delete All Untracked?",
      "Are you sure you want to delete all untracked files? This action cannot be undone.",
      async () => await discardAllUntracked(),
      "Delete All",
      true,
    );
  };

  useEffect(() => {
    setCurrentRepoPath(currentProjectPath || null);
  }, [currentProjectPath, setCurrentRepoPath]);

  const hasWorkingContext = !!(
    currentProjectPath &&
    (workspaceId || projectIdFromUrl)
  );

  const hasChanges =
    stagedFiles.length > 0 ||
    unstagedFiles.length > 0 ||
    untrackedFiles.length > 0;
  const showWikiAskSidebar = activeCenterTab === "wiki";

  return (
    <aside className="w-full flex flex-col h-full">
      <div className={cn("flex-1 min-h-0", !showWikiAskSidebar && "hidden")}>
        <AgentChatPanel variant="sidebar" mode="wiki_ask" publishStatus={false} />
      </div>
      <div className={cn("flex-1 min-h-0", showWikiAskSidebar && "hidden")}>
          <Tabs
            value={activeTab}
            onValueChange={(v) => setSidebarParams({ rsTab: v as RightSidebarTab })}
            className="flex flex-col h-full"
          >
        {/* Tabs Header */}
        <div className="h-10 flex border-b border-sidebar-border shrink-0 bg-background/50 backdrop-blur-sm">
          <TabsList
            variant="underline"
            className="w-full h-full gap-0 items-stretch py-0!"
          >
            <TabsTab
              value="changes"
              className="flex-1 h-full! text-[12px] gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!"
            >
              <GitPullRequest className="size-3.5" />
              <span>Changes/PR</span>
            </TabsTab>
            <TabsTab
              value="run-preview"
              className="flex-1 h-full! text-[12px] gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!"
            >
              <Play className="size-3.5" />
              <span>Run/Preview</span>
            </TabsTab>
          </TabsList>
        </div>

        <div
          className={cn(
            "flex-1 flex flex-col min-h-0",
            activeTab !== "changes" && "hidden",
          )}
        >
          {/* Changes / PR / Actions Header */}
          <ChangesViewSwitcher
            changesView={changesView}
            onViewChange={(view) => setSidebarParams({ rsView: view })}
            hasWorkingContext={hasWorkingContext}
            isLoading={isLoading}
            onRefreshGitStatus={refreshGitStatus}
            onRefreshChangedFiles={refreshChangedFiles}
            onCodeReview={() => setCodeReviewDialogOpen(true)}
            onRefreshPr={() => setPrRefreshKey(Date.now())}
            onCreatePr={() => setModalParams({ rsCreatePr: true })}
            onRefreshActions={() => setActionsRefreshKey(Date.now())}
          />

          {/* Changes / Commits sub-tab bar - sticky, only shown in 'changes' view */}
          {changesView === "changes" && hasWorkingContext && (
            <div className="px-3 h-9 flex items-center justify-between shrink-0 border-b border-sidebar-border/50 bg-background/50 backdrop-blur-sm relative z-[1]">
              <span className="text-xs font-bold text-muted-foreground tracking-wider leading-none">
                Changes
              </span>
              <Tabs
                value={changesSubTab}
                onValueChange={(v) =>
                  setChangesSubTab(v as "changes" | "commits")
                }
                className="h-full"
              >
                <TabsList variant="underline" className="h-full !py-0">
                  <TabsTab value="changes" className="">
                    <GitBranch className="size-3" />
                    <span className="text-xs">Changes</span>
                  </TabsTab>
                  <TabsTab value="commits" className="">
                    <GitCommitIcon className="size-3" />
                    <span className="text-xs">Commits</span>
                  </TabsTab>
                </TabsList>
              </Tabs>
            </div>
          )}

          {/* Content Area */}
          <div
            className={cn(
              "flex-1 overflow-y-auto no-scrollbar",
              changesView === "changes" && changesSubTab !== "commits"
                ? "p-2"
                : "pt-0 px-2 pb-2",
              changesView === "changes" &&
                changesSubTab !== "commits" &&
                hasWorkingContext &&
                !hasChanges &&
                !isLoading &&
                "flex items-center justify-center",
              changesView === "changes" &&
                !hasWorkingContext &&
                "flex items-center justify-center",
              changesView !== "changes" &&
                !hasWorkingContext &&
                "flex items-center justify-center",
            )}
          >
            {!hasWorkingContext ? (
              <div className="flex flex-col items-center text-muted-foreground/50">
                <FolderOpen className="size-8 opacity-20 mb-2" />
                <span className="text-xs text-center">
                  Select a project or workspace to view changes
                </span>
              </div>
            ) : changesView === "pr" ? (
              githubOwner && githubRepo && currentBranch ? (
                <PRPanel
                  key={prRefreshKey}
                  owner={githubOwner}
                  repo={githubRepo}
                  branch={currentBranch}
                  onPrClick={(num) => setModalParams({ rsPr: num })}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 py-10">
                  <GitPullRequest className="size-8 opacity-20 mb-2" />
                  <span className="text-xs text-center">
                    Not a GitHub repository
                  </span>
                </div>
              )
            ) : changesView === "actions" ? (
              githubOwner && githubRepo && currentBranch ? (
                <ActionsPanel
                  key={actionsRefreshKey}
                  owner={githubOwner}
                  repo={githubRepo}
                  branch={currentBranch}
                  onRunClick={(run: ActionRun) => {
                    setActiveActionRun(run);
                    setModalParams({ rsRunId: run.databaseId });
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 py-10">
                  <Workflow className="size-8 opacity-20 mb-2" />
                  <span className="text-xs text-center">
                    Not a GitHub repository
                  </span>
                </div>
              )
            ) : changesView === "changes" ? (
              hasWorkingContext ? (
                <>
                  {changesSubTab === "commits" ? (
                    <div className="-mx-2 -mb-2 flex-1 h-full">
                      {currentProjectPath && currentBranch ? (
                        <CommitsPanel
                          repoPath={currentProjectPath}
                          branch={currentBranch}
                          owner={githubOwner ?? undefined}
                          repo={githubRepo ?? undefined}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center min-h-[200px] text-muted-foreground/50">
                          <span className="text-xs">No repository context</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {!hasChanges && !isLoading ? (
                        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/50">
                          <Check className="size-8 opacity-20 mb-2" />
                          <span className="text-xs">No changes detected</span>
                        </div>
                      ) : (
                        <>
                          <ChangeSection
                            title="Staged Changes"
                            files={stagedFiles}
                            workspaceId={workspaceId}
                            onUnstage={unstageFiles}
                            onUnstageAll={unstageAll}
                          />
                          <ChangeSection
                            title="Unstaged Changes"
                            files={unstagedFiles}
                            workspaceId={workspaceId}
                            onStage={stageFiles}
                            onDiscard={handleDiscardUnstaged}
                            onStageAll={stageAllUnstaged}
                            onDiscardAll={handleDiscardAllUnstaged}
                          />
                          <ChangeSection
                            title="Untracked Changes"
                            files={untrackedFiles}
                            workspaceId={workspaceId}
                            onStage={stageFiles}
                            onDiscard={handleDiscardUntracked}
                            onStageAll={stageAllUntracked}
                            onDiscardAll={handleDiscardAllUntracked}
                          />
                        </>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center text-muted-foreground/50">
                  <FolderOpen className="size-8 opacity-20 mb-2" />
                  <span className="text-xs text-center">
                    Select a project or workspace to view changes
                  </span>
                </div>
              )
            ) : null}
          </div>

          {/* Commit Actions (Sticky Bottom) */}
          {hasWorkingContext &&
            changesView === "changes" &&
            changesSubTab !== "commits" && (
              <CommitActions
                currentProjectPath={currentProjectPath}
                currentProject={currentProject}
                currentWorkspace={currentWorkspace}
                workspaceId={workspaceId}
                projectId={projectIdFromUrl}
                stagedFiles={stagedFiles}
                unstagedFiles={unstagedFiles}
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
            )}
        </div>

        <div
          className={cn(
            "flex-1 min-h-0",
            activeTab !== "run-preview" && "hidden",
          )}
        >
          <RunPreviewPanel
            workspaceId={effectiveContextId}
            projectId={currentProject?.id}
            isActive={activeTab === "run-preview"}
            projectName={currentProject?.name}
            workspaceName={currentWorkspace?.name}
          />
        </div>
      </Tabs>

      <RightSidebarDialogs
        confirmDialog={confirmDialog}
        onConfirm={handleConfirm}
        onCloseConfirm={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        isGlobalActionLoading={isGlobalActionLoading}
        githubOwner={githubOwner}
        githubRepo={githubRepo}
        currentBranch={currentBranch}
        activePrNumber={activePrNumber}
        onClosePr={() => setModalParams({ rsPr: null })}
        onPrMerged={() => {
          refreshGitStatus();
          refreshChangedFiles();
        }}
        activeRunId={activeRunId}
        activeActionRun={activeActionRun}
        onCloseActions={() => {
          setActiveActionRun(null);
          setModalParams({ rsRunId: null });
        }}
        rsCreatePr={!!rsCreatePr}
        onCloseCreatePr={() => setModalParams({ rsCreatePr: false })}
        onPrCreated={() => setPrRefreshKey(Date.now())}
      />
      </div>
    </aside>
  );
};

export default RightSidebar;
