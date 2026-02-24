"use client";

import React, { useState, useEffect } from 'react';
import { useGitStore } from '@/hooks/use-git-store';
import { useEditorStore } from '@/hooks/use-editor-store';
import { useProjectStore } from '@/hooks/use-project-store';
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
  toastManager
} from "@workspace/ui";
import { GitBranch, Play, GitPullRequest, GitPullRequestCreateArrow, FolderOpen, Bot, Link } from "lucide-react";
import { cn } from "@/lib/utils";
import { useContextParams } from "@/hooks/use-context-params";
import { GitChangedFile } from '@/api/ws-api';
import { RunPreviewPanel } from "@/components/run-preview/RunPreviewPanel";
import { useDialogStore } from "@/hooks/use-dialog-store";

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
  const { setCodeReviewDialogOpen } = useDialogStore();

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
  const [activeTab, setActiveTab] = useState("changes");

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

  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0 || untrackedFiles.length > 0;
  const showPublishButton = !isBranchPublished;
  const showPushButton = isBranchPublished && !!gitStatus?.has_unpushed_commits && stagedFiles.length === 0 && !commitMessage.trim();

  return (
    <aside className="w-full flex flex-col h-full">
      <Tabs defaultValue="changes" value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        {/* Tabs Header */}
        <div className="h-10 flex border-b border-sidebar-border shrink-0 bg-background/50 backdrop-blur-sm">
          <TabsList variant="underline" className="w-full h-full gap-0 items-stretch !py-0">
            <TabsTab value="changes" className="flex-1 !h-full text-[12px] gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none !border-0">
              <GitBranch className="size-3.5" />
              <span>Changes</span>
            </TabsTab>
            <TabsTab value="run-preview" className="flex-1 !h-full text-[12px] gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none !border-0">
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex-1 flex items-center justify-center gap-1.5 transition-colors group cursor-pointer border-r border-sidebar-border/50 hover:bg-sidebar-accent text-muted-foreground hover:text-foreground"
                      title="Agent Review"
                    >
                      <Bot className="size-3.5" />
                      <span className="text-[11px] font-medium">Review</span>
                      <ChevronDown className="size-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onClick={() => setCodeReviewDialogOpen(true)}>
                      <Bot className="size-3 mr-2" />
                      <span>Code Agent Review</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toastManager.add({ title: "Coming Soon", type: "info" })}>
                      <Link className="size-3 mr-2" />
                      <span>Qodo</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toastManager.add({ title: "Coming Soon", type: "info" })}>
                      <Link className="size-3 mr-2" />
                      <span>Devin Review</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <button
                  className="flex-1 flex items-center justify-center gap-1.5 transition-colors group cursor-pointer border-r border-sidebar-border/50 hover:bg-sidebar-accent text-muted-foreground hover:text-foreground"
                  title="Create PR"
                >
                  <GitPullRequestCreateArrow className="size-3.5" />
                  <span className="text-[11px] font-medium">Create PR</span>
                </button>

                <button
                  onClick={() => { refreshGitStatus(); refreshChangedFiles(); }}
                  className="w-10 flex items-center justify-center transition-colors group cursor-pointer hover:bg-sidebar-accent text-muted-foreground hover:text-foreground"
                  title="Refresh"
                >
                  <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
                </button>
              </>
            )}
          </div>

          {/* Changes List */}
          <div className={cn(
            "flex-1 overflow-y-auto no-scrollbar p-2",
            (!hasWorkingContext || (!hasChanges && !isLoading)) && "flex items-center justify-center"
          )}>
            {!hasWorkingContext ? (
              <div className="flex flex-col items-center text-muted-foreground/50">
                <FolderOpen className="size-8 opacity-20 mb-2" />
                <span className="text-xs text-center">Select a project or workspace to view changes</span>
              </div>
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

          {/* Commit Actions (Sticky Bottom) - Only show when working context exists */}
          {hasWorkingContext && (
            <div className="p-3 border-t border-sidebar-border shrink-0 space-y-3  backdrop-blur-sm">
              {/* Input */}
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
                className="w-full min-h-[60px] p-2.5 bg-sidebar-accent/50 border-transparent focus:border-sidebar-border/50 focus:bg-sidebar-accent rounded-md text-sidebar-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0 transition-all ease-out duration-200 text-xs resize-none"
              />

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
    </aside >
  );
};

export default RightSidebar;