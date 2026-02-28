"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGitStore } from '@/hooks/use-git-store';
import { useEditorStore } from '@/hooks/use-editor-store';
import { useProjectStore } from '@/hooks/use-project-store';
import { useWebSocketStore } from '@/hooks/use-websocket';
import {
  Check,
  RefreshCw,
  Upload,
  Loader2,
  getFileIconProps,
  ChevronRight,
  Plus,
  Minus,
  Undo2,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Tabs,
  TabsList,
  TabsTab,
  TabsPanel
} from '@workspace/ui';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toastManager
} from "@workspace/ui";
import { GitBranch, Play, GitPullRequest, GitPullRequestCreateArrow, FolderOpen, Bot, Link, FileCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryStates } from "nuqs";
import { rightSidebarParams, rightSidebarModalParams, type RightSidebarTab, type ChangesView } from "@/lib/nuqs/searchParams";
import { useContextParams } from "@/hooks/use-context-params";
import { GitChangedFile, functionSettingsApi, skillsApi } from '@/api/ws-api';
import { RunPreviewPanel } from "@/components/run-preview/RunPreviewPanel";
import { useDialogStore } from "@/hooks/use-dialog-store";
import { useGitInfoStore } from '@/hooks/use-git-info-store';
import { PRDetailModal } from '@/components/github/PRDetailModal';
import { PRCreateModal } from '@/components/github/PRCreateModal';
import { PRPanel } from '@/components/github/PRPanel';
import { ActionsPanel, type ActionRun } from '@/components/github/ActionsPanel';
import { ActionsDetailModal } from '@/components/github/ActionsDetailModal';
import { Workflow } from 'lucide-react';
import { useAgentChatUrl } from '@/hooks/use-agent-chat-url';
import { useAgentChatStatusStore } from '@/hooks/use-agent-chat-status';

interface RightSidebarProps {
  // kept for compatibility if needed, but unused
  changes?: unknown[];
}

// File icon component matching the file tree
function FileIcon({ name, className }: { name: string; className?: string }) {
  const iconProps = getFileIconProps({ name, isDir: false, className });
  return <img {...iconProps} />;
}




interface ChangeSectionProps {
  title: string;
  files: GitChangedFile[];
  defaultOpen?: boolean;
  onStage?: (files: string[]) => void;
  onUnstage?: (files: string[]) => void;
  onDiscard?: (files: string[]) => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
  onDiscardAll?: () => void;
  workspaceId: string | null;
}

const ChangeSection: React.FC<ChangeSectionProps> = ({
  title,
  files,
  defaultOpen = true,
  onStage,
  onUnstage,
  onDiscard,
  onStageAll,
  onUnstageAll,
  onDiscardAll,
  workspaceId
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const { openFile, getActiveFilePath, pinFile } = useEditorStore();
  const activeFilePath = getActiveFilePath(workspaceId || undefined);

  if (files.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <div className="flex items-center justify-between px-2 py-1 hover:bg-sidebar-accent/50 group/header rounded-sm mb-1">
        <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors w-full">
          <ChevronRight className={cn("size-3.5 transition-transform duration-200", isOpen && "rotate-90")} />
          <span>{title}</span>
          <span className="text-[10px] ml-1 px-1.5 rounded-full bg-sidebar-accent text-muted-foreground tabular-nums">
            {files.length}
          </span>
        </CollapsibleTrigger>

        <div className="flex items-center gap-1 opacity-0 group-hover/header:opacity-100 transition-opacity">
          {onStageAll && (
            <button onClick={(e) => { e.stopPropagation(); onStageAll(); }} title="Stage All" className="p-1 hover:bg-sidebar-accent rounded-sm cursor-pointer hover:text-foreground text-muted-foreground transition-colors">
              <Plus className="size-3.5" />
            </button>
          )}
          {onUnstageAll && (
            <button onClick={(e) => { e.stopPropagation(); onUnstageAll(); }} title="Unstage All" className="p-1 hover:bg-sidebar-accent rounded-sm cursor-pointer hover:text-foreground text-muted-foreground transition-colors">
              <Minus className="size-3.5" />
            </button>
          )}
          {onDiscardAll && (
            <button onClick={(e) => { e.stopPropagation(); onDiscardAll(); }} title="Discard All" className="p-1 hover:bg-sidebar-accent rounded-sm cursor-pointer hover:text-foreground text-muted-foreground transition-colors">
              <Undo2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 mt-0.5 overflow-hidden pb-2">
          {files.map(file => {
            const fileName = file.path.split('/').pop() || file.path;
            const parts = file.path.split('/');
            parts.pop(); // remove filename
            const dirPath = parts.join('/');

            return (
              <div
                key={file.path}
                onClick={() => openFile(`diff://${file.path}`, workspaceId || undefined, { preview: true })}
                onDoubleClick={() => pinFile(`diff://${file.path}`, workspaceId || undefined)}
                className={cn(
                  "group flex items-center px-2 py-1.5 cursor-pointer transition-colors ease-out duration-200 w-full relative rounded-sm gap-2",
                  activeFilePath === `diff://${file.path}` ? "bg-sidebar-accent text-sidebar-foreground" : "hover:bg-sidebar-accent/50"
                )}
              >
                {/* File icon */}
                <FileIcon name={fileName} className="size-4 shrink-0" />

                {/* Filename */}
                <span className="text-[13px] text-muted-foreground group-hover:text-sidebar-foreground font-medium whitespace-nowrap shrink-0">
                  {fileName}
                </span>

                {/* Path - fills space, truncates first */}
                <span
                  className="text-[11px] text-muted-foreground/40 whitespace-nowrap truncate min-w-0 flex-1 text-left"
                  dir="rtl"
                >
                  {dirPath ? `${dirPath}/` : ""}
                </span>

                {/* Git stats or Hover Actions - shrinks second */}
                <div className="flex items-center h-4 shrink min-w-0 overflow-hidden">
                  {/* Default State: Stats & Status */}
                  <div className={cn(
                    "flex items-center gap-2 text-[11px] font-mono tabular-nums group-hover:hidden min-w-[30px] justify-end",
                  )}>
                    {file.status !== '?' && (
                      <div className="flex items-center gap-1 font-medium">
                        {file.additions > 0 && (
                          <span className="text-emerald-500">+{file.additions}</span>
                        )}
                        {file.deletions > 0 && (
                          <span className="text-red-500">-{file.deletions}</span>
                        )}
                      </div>
                    )}
                    <span className={cn(
                      "w-3 text-center font-bold",
                      file.status === 'M' ? 'text-yellow-500' :
                        file.status === 'A' || file.status === '?' ? 'text-emerald-500' :
                          file.status === 'D' ? 'text-red-500' : 'text-foreground'
                    )}>{file.status === '?' ? 'U' : file.status}</span>
                  </div>

                  {/* Hover Actions */}
                  <div className="hidden group-hover:flex items-center gap-1">
                    {onStage && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onStage([file.path]); }}
                        title="Stage Changes"
                        className="p-1 hover:bg-background rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    )}
                    {onUnstage && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onUnstage([file.path]); }}
                        title="Unstage Changes"
                        className="p-1 hover:bg-background rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Minus className="size-3.5" />
                      </button>
                    )}
                    {onDiscard && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDiscard([file.path]); }}
                        title="Discard Changes"
                        className="p-1 hover:bg-background rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Undo2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const RightSidebar: React.FC<RightSidebarProps> = () => {
  const { workspaceId, projectId: projectIdFromUrl } = useContextParams();
  const { currentProjectPath } = useEditorStore();
  const { projects } = useProjectStore();
  const { setCodeReviewDialogOpen, setPendingAgentChatPrompt } = useDialogStore();
  const [, setAgentChatOpen] = useAgentChatUrl();
  const agentHasAgents = useAgentChatStatusStore((s) => s.hasInstalledAgents);
  const agentIsConnected = useAgentChatStatusStore((s) => s.isConnected);
  const agentIsBusy = useAgentChatStatusStore((s) => s.isBusy);

  const [acpNewSession, setAcpNewSession] = useState(false);
  const [aiPopoverOpen, setAiPopoverOpen] = useState(false);
  const aiPopoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    functionSettingsApi.get().then((s) => {
      setAcpNewSession(s.git_commit?.acp_new_session_switch ?? false);
    }).catch(() => {});
  }, []);

  const handleAcpNewSessionToggle = useCallback((checked: boolean) => {
    setAcpNewSession(checked);
    functionSettingsApi.update("git_commit", "acp_new_session_switch", checked).catch(() => {});
  }, []);

  const currentProject = projects.find(p =>
    (workspaceId && p.workspaces.some(w => w.id === workspaceId)) ||
    (!workspaceId && projectIdFromUrl === p.id)
  );
  const currentWorkspace = currentProject?.workspaces.find(w => w.id === workspaceId);

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
    gitStatus
  } = useGitStore();

  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isGlobalActionLoading, setIsGlobalActionLoading] = useState(false);
  const [{ rsTab: activeTab, rsView: changesView }, setSidebarParams] = useQueryStates(rightSidebarParams);
  const [{ rsPr: activePrNumber, rsRunId: activeRunId, rsCreatePr }, setModalParams] = useQueryStates(rightSidebarModalParams);
  const { activeActionRun, setActiveActionRun } = useDialogStore();

  const [isChangesActionReady, setIsChangesActionReady] = useState(false);
  const [isChangesHovered, setIsChangesHovered] = useState(false);

  const [isPrActionReady, setIsPrActionReady] = useState(false);
  const [isPrHovered, setIsPrHovered] = useState(false);
  const [prRefreshKey, setPrRefreshKey] = useState(0);

  const [isActionsActionReady, setIsActionsActionReady] = useState(false);
  const [isActionsHovered, setIsActionsHovered] = useState(false);
  const [actionsRefreshKey, setActionsRefreshKey] = useState(0);

  const send = useWebSocketStore(s => s.send);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (changesView === 'changes') {
      timer = setTimeout(() => {
        setIsChangesActionReady(true);
      }, 1000);
      setIsPrActionReady(false);
      setIsActionsActionReady(false);
    } else if (changesView === 'pr') {
      timer = setTimeout(() => {
        setIsPrActionReady(true);
      }, 1000);
      setIsChangesActionReady(false);
      setIsActionsActionReady(false);
    } else if (changesView === 'actions') {
      timer = setTimeout(() => {
        setIsActionsActionReady(true);
      }, 1000);
      setIsChangesActionReady(false);
      setIsPrActionReady(false);
    } else {
      setIsChangesActionReady(false);
      setIsPrActionReady(false);
      setIsActionsActionReady(false);
    }
    return () => clearTimeout(timer);
  }, [changesView]);

  const showChangesActions = changesView === 'changes' && isChangesActionReady && isChangesHovered;
  const showPrActions = changesView === 'pr' && isPrActionReady && isPrHovered;
  const showActionsActions = changesView === 'actions' && isActionsActionReady && isActionsHovered;

  const { githubOwner, githubRepo, currentBranch } = useGitInfoStore();

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: React.ReactNode;
    action: () => Promise<void>;
    confirmLabel: string;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: "",
    description: "",
    action: async () => { },
    confirmLabel: "Confirm",
    isDestructive: false,
  });

  const confirmAction = (
    title: string,
    description: React.ReactNode,
    action: () => Promise<void>,
    confirmLabel = "Confirm",
    isDestructive = false
  ) => {
    setConfirmDialog({
      isOpen: true,
      title,
      description,
      action,
      confirmLabel,
      isDestructive
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
      setConfirmDialog(prev => ({ ...prev, isOpen: false }));
    }
  };

  // Wrapped handlers for destructive actions
  const handleDiscardUnstaged = (files: string[]) => {
    confirmAction(
      "Discard Changes?",
      `Are you sure you want to discard changes in ${files.length} file(s)? This action cannot be undone.`,
      async () => await discardUnstagedChanges(files),
      "Discard Changes",
      true
    );
  };

  const handleDiscardUntracked = (files: string[]) => {
    confirmAction(
      "Delete Files?",
      `Are you sure you want to delete ${files.length} untracked file(s)? This action cannot be undone.`,
      async () => await discardUntrackedFiles(files),
      "Delete Files",
      true
    );
  };

  const handleDiscardAllUnstaged = () => {
    confirmAction(
      "Discard All Changes?",
      "Are you sure you want to discard all unstaged changes? This action cannot be undone.",
      async () => await discardAllUnstaged(),
      "Discard All",
      true
    );
  };

  const handleDiscardAllUntracked = () => {
    confirmAction(
      "Delete All Untracked?",
      "Are you sure you want to delete all untracked files? This action cannot be undone.",
      async () => await discardAllUntracked(),
      "Delete All",
      true
    );
  };

  // Sync current project path to git store
  useEffect(() => {
    // Set path if available, otherwise clear it
    setCurrentRepoPath(currentProjectPath || null);
  }, [currentProjectPath, setCurrentRepoPath]);

  // Check if we have a valid working context
  const hasWorkingContext = !!(currentProjectPath && (workspaceId || projectIdFromUrl));



  const handlePublish = async () => {
    setIsGlobalActionLoading(true);
    try {
      await pushChanges();
    } catch (e) {
      console.error(e);
    } finally {
      setIsGlobalActionLoading(false);
    }
  };

  const handleGlobalAction = async (action: () => Promise<void>) => {
    setIsGlobalActionLoading(true);
    try {
      await action();
    } catch (e) {
      console.error(e);
    } finally {
      setIsGlobalActionLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;

    setIsCommitting(true);
    try {
      // If nothing is staged but we have unstaged changes, stage them first (VS Code style)
      if (stagedFiles.length === 0 && unstagedFiles.length > 0) {
        await stageAllUnstaged();
      }

      await commitChanges(commitMessage);
      setCommitMessage("");
    } catch (e) {
      console.error(e);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleGenerateCommitMessage = async () => {
    if (!agentHasAgents) {
      toastManager.add({
        title: "No ACP Agent Available",
        description: "Install an ACP agent first to use AI commit message generation.",
        type: "error",
      });
      return;
    }

    try {
      const skillInstalled = await skillsApi.isGitCommitSkillInstalledInSystem();
      if (!skillInstalled) {
        toastManager.add({
          title: "Git Commit Skill Not Found",
          description: "The git-commit skill is not installed.",
          type: "error",
          actionProps: {
            children: "Install Now",
            onClick: async () => {
              const id = toastManager.add({ title: "Installing git-commit skill...", type: "loading", timeout: 0 });
              try {
                await skillsApi.syncSingleSystemSkill("git-commit");
                toastManager.update(id, { title: "Git Commit Skill Installed", type: "success", timeout: 3000, actionProps: undefined });
              } catch {
                toastManager.update(id, { title: "Install Failed", description: "Failed to install. Please try again.", type: "error", timeout: 5000, actionProps: undefined });
              }
            },
          },
        });
        return;
      }
    } catch {
      toastManager.add({
        title: "Skill Check Failed",
        description: "Unable to verify git-commit skill status. Please try again.",
        type: "error",
      });
      return;
    }

    if (!acpNewSession && (!agentIsConnected || agentIsBusy)) {
      toastManager.add({
        title: "Agent Chat Busy",
        description: "The default Chat agent is busy or not connected. Please wait and try again.",
        type: "warning",
      });
      return;
    }

    const skillPath = "~/.atmos/skills/.system/git-commit/SKILL.md";
    const prompt = `Read the skill instructions at ${skillPath} and follow the full workflow: analyze the diff, generate a conventional commit message, and execute the git commit. Do not ask for confirmation.`;
    setPendingAgentChatPrompt({
      prompt,
      forceNewSession: acpNewSession,
    });
    setAgentChatOpen(true);
    toastManager.add({
      title: "Generating Commit Message",
      description: "Prompt sent to Agent. It will analyze changes and auto-commit. No further action needed.",
      type: "success",
    });
  };

  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0 || untrackedFiles.length > 0;
  const showPublishButton = !isBranchPublished;
  const showPushButton = isBranchPublished && !!gitStatus?.has_unpushed_commits && stagedFiles.length === 0 && !commitMessage.trim();

  return (
    <aside className="w-full flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={(v) => setSidebarParams({ rsTab: v as RightSidebarTab })} className="flex flex-col h-full">
        {/* Tabs Header */}
        <div className="h-10 flex border-b border-sidebar-border shrink-0 bg-background/50 backdrop-blur-sm">
          <TabsList variant="underline" className="w-full h-full gap-0 items-stretch py-0!">
            <TabsTab value="changes" className="flex-1 h-full! text-[12px] gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!">
              <GitPullRequest className="size-3.5" />
              <span>Changes/PR</span>
            </TabsTab>
            <TabsTab value="run-preview" className="flex-1 h-full! text-[12px] gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!">
              <Play className="size-3.5" />
              <span>Run/Preview</span>
            </TabsTab>
          </TabsList>
        </div>

        <div className={cn("flex-1 flex flex-col min-h-0", activeTab !== "changes" && "hidden")}>
          {/* Changes Header */}
          <div className="flex border-b border-sidebar-border shrink-0 bg-sidebar-accent/5 h-10 overflow-hidden">
            {hasWorkingContext && (
              <>
                {/* Changes Toggle */}
                <div
                  className={cn(
                    "flex-1 flex items-center justify-center transition-colors relative cursor-pointer border-r border-sidebar-border/50 overflow-hidden",
                    changesView === 'changes'
                      ? (showChangesActions ? "text-foreground" : "bg-sidebar-accent text-foreground")
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )}
                  onMouseEnter={() => setIsChangesHovered(true)}
                  onMouseLeave={() => setIsChangesHovered(false)}
                  onClick={() => {
                    if (changesView !== 'changes') {
                      setSidebarParams({ rsView: 'changes' });
                    }
                  }}
                >
                  {/* Default State (Changes Icon/Text) */}
                  <div className={cn(
                    "flex items-center gap-1.5 justify-center transition-all duration-300 ease-out",
                    showChangesActions ? "-translate-y-10 opacity-0" : ""
                  )}>
                    <GitBranch className="size-3.5" />
                    <span className="text-[11px] font-medium">Changes</span>
                  </div>

                  {/* Hover State (Refresh + Review) */}
                  <div className={cn(
                    "absolute inset-0 flex transition-all duration-300 ease-out divide-x divide-sidebar-border/50",
                    showChangesActions ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0 pointer-events-none"
                  )}>
                    {/* Left side: Refresh */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        refreshGitStatus();
                        refreshChangedFiles();
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 hover:bg-sidebar-accent group/refresh cursor-pointer transition-colors"
                      title="Refresh"
                    >
                      <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
                    </button>

                    {/* Right side: Agent Review */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCodeReviewDialogOpen(true);
                      }}
                      className="flex-1 flex items-center justify-center hover:bg-sidebar-accent cursor-pointer transition-colors"
                      title="Agent Review"
                    >
                      <FileCheck className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Pull Requests Toggle */}
                <div
                  className={cn(
                    "flex-1 flex items-center justify-center transition-colors relative cursor-pointer border-r border-sidebar-border/50 overflow-hidden group",
                    changesView === 'pr'
                      ? (showPrActions ? "text-foreground" : "bg-sidebar-accent text-foreground")
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )}
                  onMouseEnter={() => setIsPrHovered(true)}
                  onMouseLeave={() => setIsPrHovered(false)}
                  onClick={() => {
                    if (changesView !== 'pr') {
                      setSidebarParams({ rsView: 'pr' });
                    }
                  }}
                  title="Pull Requests"
                >
                  {/* Default State (PR Icon/Text) */}
                  <div className={cn(
                    "flex items-center gap-1.5 justify-center transition-all duration-300 ease-out",
                    showPrActions ? "-translate-y-10 opacity-0" : ""
                  )}>
                    <GitPullRequest className="size-3.5" />
                    <span className="text-[11px] font-medium">PR</span>
                  </div>

                  {/* Hover State (Refresh + Create PR) */}
                  <div className={cn(
                    "absolute inset-0 flex transition-all duration-300 ease-out divide-x divide-sidebar-border/50",
                    showPrActions ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0 pointer-events-none"
                  )}>
                    {/* Left side: Refresh */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrRefreshKey(Date.now());
                      }}
                      className="flex-1 flex items-center justify-center hover:bg-sidebar-accent cursor-pointer transition-colors"
                      title="Refresh"
                    >
                      <RefreshCw className="size-3.5" />
                    </button>

                    {/* Right side: Create PR */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalParams({ rsCreatePr: true });
                      }}
                      className="flex-1 flex items-center justify-center hover:bg-sidebar-accent cursor-pointer transition-colors"
                      title="Create PR"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Actions Toggle */}
                <div
                  className={cn(
                    "flex-1 flex items-center justify-center transition-colors relative cursor-pointer border-r border-transparent overflow-hidden h-full",
                    changesView === 'actions'
                      ? (showActionsActions ? "text-foreground" : "bg-sidebar-accent text-foreground")
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )}
                  onClick={() => {
                    if (changesView !== 'actions') setSidebarParams({ rsView: 'actions' });
                  }}
                  onMouseEnter={() => setIsActionsHovered(true)}
                  onMouseLeave={() => setIsActionsHovered(false)}
                  title="Actions"
                >
                  <div className={cn(
                    "flex items-center gap-1.5 justify-center transition-all duration-300 ease-out",
                    showActionsActions ? "-translate-y-10 opacity-0" : ""
                  )}>
                    <Workflow className="size-3.5" />
                    <span className="text-[11px] font-medium">Actions</span>
                  </div>

                  <div className={cn(
                    "absolute inset-0 flex transition-all duration-300 ease-out",
                    showActionsActions ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0 pointer-events-none"
                  )}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionsRefreshKey(Date.now());
                      }}
                      className="flex-1 flex items-center justify-center hover:bg-sidebar-accent cursor-pointer transition-colors"
                      title="Refresh"
                    >
                      <RefreshCw className="size-3.5" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Content Area */}
          <div className={cn(
            "flex-1 overflow-y-auto no-scrollbar",
            changesView === 'changes' ? "p-2" : "pt-0 px-2 pb-2",
            (!hasWorkingContext || (changesView === 'changes' && !hasChanges && !isLoading)) && "flex items-center justify-center"
          )}>
            {!hasWorkingContext ? (
              <div className="flex flex-col items-center text-muted-foreground/50">
                <FolderOpen className="size-8 opacity-20 mb-2" />
                <span className="text-xs text-center">Select a project or workspace to view changes</span>
              </div>
            ) : changesView === 'pr' ? (
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
                  <span className="text-xs text-center">Not a GitHub repository</span>
                </div>
              )
            ) : changesView === 'actions' ? (
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
                  <span className="text-xs text-center">Not a GitHub repository</span>
                </div>
              )
            ) : !hasChanges && !isLoading ? (
              <div className="flex flex-col items-center text-muted-foreground/50">
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
          </div>

          {/* Commit Actions (Sticky Bottom) - Only show when working context exists and in changes view */}
          {hasWorkingContext && changesView === 'changes' && (
            <div className="p-3 border-t border-sidebar-border shrink-0 space-y-3  backdrop-blur-sm">
              {/* Input with AI generate button */}
              <div className="relative">
                <textarea
                  placeholder="Message (⌘+Enter to commit)"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleCommit();
                    }
                  }}
                  className="w-full min-h-[60px] p-2.5 pr-8 bg-sidebar-accent/50 border-transparent focus:border-sidebar-border/50 focus:bg-sidebar-accent rounded-md text-sidebar-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0 transition-all ease-out duration-200 text-xs resize-none"
                />
                <Popover open={aiPopoverOpen} onOpenChange={setAiPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      onClick={handleGenerateCommitMessage}
                      onMouseEnter={() => {
                        if (aiPopoverTimer.current) clearTimeout(aiPopoverTimer.current);
                        aiPopoverTimer.current = setTimeout(() => setAiPopoverOpen(true), 400);
                      }}
                      onMouseLeave={() => {
                        if (aiPopoverTimer.current) { clearTimeout(aiPopoverTimer.current); aiPopoverTimer.current = null; }
                      }}
                      disabled={!hasChanges}
                      title="AI Generate Commit Message"
                      className={cn(
                        "absolute top-1.5 right-1.5 p-1 rounded-sm transition-colors",
                        hasChanges
                          ? "text-muted-foreground hover:text-amber-500 hover:bg-sidebar-accent cursor-pointer"
                          : "text-muted-foreground/30 cursor-not-allowed"
                      )}
                    >
                      <Sparkles className="size-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="end"
                    className="w-52 p-1"
                    onMouseEnter={() => {
                      if (aiPopoverTimer.current) { clearTimeout(aiPopoverTimer.current); aiPopoverTimer.current = null; }
                    }}
                    onMouseLeave={() => {
                      aiPopoverTimer.current = setTimeout(() => setAiPopoverOpen(false), 300);
                    }}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    <div className="flex items-center justify-between gap-3 rounded-sm px-2.5 py-2 hover:bg-muted transition-colors">
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <label htmlFor="acp-new-session" className="text-xs font-medium text-popover-foreground cursor-help select-none">
                              New ACP Session
                            </label>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[200px] text-xs">
                            Enabling this starts a fresh ACP session each time, which may take ~10s to initialize.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Switch
                        id="acp-new-session"
                        checked={acpNewSession}
                        onCheckedChange={handleAcpNewSessionToggle}
                        className="scale-80 shrink-0"
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Main Button with Dropdown */}
              <div className="flex items-stretch gap-px h-8 w-full group shadow-sm">
                <button
                  onClick={showPublishButton ? handlePublish : showPushButton ? () => handleGlobalAction(pushChanges) : handleCommit}
                  disabled={isCommitting || isGlobalActionLoading || (!showPublishButton && !showPushButton && (!commitMessage.trim() || (stagedFiles.length === 0 && unstagedFiles.length === 0)))}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 rounded-l-md transition-all text-xs font-semibold select-none",
                    (isCommitting || isGlobalActionLoading || (!showPublishButton && !showPushButton && (!commitMessage.trim() || (stagedFiles.length === 0 && unstagedFiles.length === 0))))
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : showPushButton
                        ? "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-sidebar-border"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  {(isCommitting || isGlobalActionLoading) && <Loader2 className="size-3.5 animate-spin" />}
                  <span>
                    {showPublishButton
                      ? (isGlobalActionLoading ? 'Publishing...' : 'Publish Branch')
                      : showPushButton
                        ? (isGlobalActionLoading ? 'Syncing...' : `Sync Changes ${gitStatus?.unpushed_count ? `↑${gitStatus.unpushed_count}` : ''}`)
                        : (isCommitting ? 'Committing...' : 'Commit')
                    }
                  </span>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className={cn(
                      "px-2 flex items-center justify-center rounded-r-md border-l transition-colors",
                      (isCommitting || isGlobalActionLoading || (!showPublishButton && !showPushButton && (!commitMessage.trim() || (stagedFiles.length === 0 && unstagedFiles.length === 0))))
                        ? "bg-muted text-muted-foreground border-l-transparent"
                        : showPushButton
                          ? "bg-secondary text-secondary-foreground hover:bg-secondary/80 border-y border-r border-sidebar-border border-l-sidebar-border/50"
                          : "bg-primary text-primary-foreground hover:bg-primary/90 border-l-primary-foreground/10",
                    )}
                      disabled={isCommitting || isGlobalActionLoading || (!showPublishButton && !showPushButton && (!commitMessage.trim() || (stagedFiles.length === 0 && unstagedFiles.length === 0)))}
                    >
                      <ChevronDown className="size-3.5 opacity-80" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => handleGlobalAction(pullChanges)}>
                      <ArrowDown className="mr-2 size-4" /> Pull
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGlobalAction(pushChanges)}>
                      <Upload className="mr-2 size-4" /> Push
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGlobalAction(fetchChanges)}>
                      <RefreshCw className="mr-2 size-4" /> Fetch
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGlobalAction(syncChanges)}>
                      <RefreshCw className="mr-2 size-4" /> Sync
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
        </div>

        <div className={cn("flex-1 min-h-0", activeTab !== "run-preview" && "hidden")}>
          <RunPreviewPanel
            workspaceId={effectiveContextId}
            projectId={currentProject?.id}
            isActive={activeTab === "run-preview"}
            projectName={currentProject?.name}
            workspaceName={currentWorkspace?.name}
          />
        </div>
      </Tabs>

      <Dialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
            <DialogDescription>
              {confirmDialog.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              variant={confirmDialog.isDestructive ? "destructive" : "default"}
              size="sm"
              onClick={handleConfirm}
              disabled={isGlobalActionLoading}
            >
              {isGlobalActionLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {confirmDialog.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {githubOwner && githubRepo && currentBranch && (
        <PRDetailModal
          isOpen={activePrNumber !== null}
          onOpenChange={(open) => {
            if (!open) setModalParams({ rsPr: null });
          }}
          owner={githubOwner}
          repo={githubRepo}
          branch={currentBranch}
          prNumber={activePrNumber}
          onMerged={() => {
            refreshGitStatus();
            refreshChangedFiles();
          }}
        />
      )}

      {githubOwner && githubRepo && currentBranch && (
        <ActionsDetailModal
          isOpen={activeRunId !== null}
          onOpenChange={(open) => {
            if (!open) {
              setActiveActionRun(null);
              setModalParams({ rsRunId: null });
            }
          }}
          owner={githubOwner}
          repo={githubRepo}
          run={activeActionRun}
          runId={activeRunId}
        />
      )}
      {githubOwner && githubRepo && currentBranch && (
        <PRCreateModal
          isOpen={!!rsCreatePr}
          onOpenChange={(open) => setModalParams({ rsCreatePr: open })}
          owner={githubOwner}
          repo={githubRepo}
          branch={currentBranch}
          onCreated={() => setPrRefreshKey(Date.now())}
        />
      )}
    </aside >
  );
};

export default RightSidebar;