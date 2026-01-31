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
} from "@workspace/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui";
import { GitBranch, Play, GitPullRequest, GitPullRequestCreateArrow } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams } from 'next/navigation';
import { GitChangedFile } from '@/api/ws-api';
import { RunPreviewPanel } from "@/components/run-preview/RunPreviewPanel";

interface RightSidebarProps {
  // kept for compatibility if needed, but unused
  changes?: any[];
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
  const { openFile, getActiveFilePath } = useEditorStore();
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
            <button onClick={(e) => { e.stopPropagation(); onStageAll(); }} title="Stage All" className="p-1 hover:bg-sidebar-accent rounded hover:text-foreground text-muted-foreground transition-colors">
              <Plus className="size-3.5" />
            </button>
          )}
          {onUnstageAll && (
            <button onClick={(e) => { e.stopPropagation(); onUnstageAll(); }} title="Unstage All" className="p-1 hover:bg-sidebar-accent rounded hover:text-foreground text-muted-foreground transition-colors">
              <Minus className="size-3.5" />
            </button>
          )}
          {onDiscardAll && (
            <button onClick={(e) => { e.stopPropagation(); onDiscardAll(); }} title="Discard All" className="p-1 hover:bg-sidebar-accent rounded hover:text-foreground text-muted-foreground transition-colors">
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
                onClick={() => openFile(`diff://${file.path}`, workspaceId || undefined)}
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
                      <span className={cn(
                        "flex",
                        file.additions > file.deletions ? "text-emerald-500" : "text-red-500"
                      )}>
                        {file.additions > 0 ? `+${file.additions}` : `-${file.deletions}`}
                      </span>
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
                        className="p-1 hover:bg-background rounded-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    )}
                    {onUnstage && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onUnstage([file.path]); }}
                        title="Unstage Changes"
                        className="p-1 hover:bg-background rounded-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Minus className="size-3.5" />
                      </button>
                    )}
                    {onDiscard && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDiscard([file.path]); }}
                        title="Discard Changes"
                        className="p-1 hover:bg-background rounded-sm text-muted-foreground hover:text-foreground transition-colors"
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
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');
  const { currentProjectPath } = useEditorStore();
  const { projects } = useProjectStore();
  const currentProject = projects.find(p => p.workspaces.some(w => w.id === workspaceId));
  const currentWorkspace = currentProject?.workspaces.find(w => w.id === workspaceId);

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

  // Sync current project path to git store
  useEffect(() => {
    if (currentProjectPath) {
      setCurrentRepoPath(currentProjectPath);
    }
  }, [currentProjectPath, setCurrentRepoPath]);



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
    <aside className="w-full flex flex-col border-l border-white/5 h-full">
      <Tabs defaultValue="changes" value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        {/* Tabs Header */}
        <div className="h-10 flex items-center px-2 border-b border-sidebar-border shrink-0 bg-background/50 backdrop-blur-sm">
          <TabsList variant="underline" className="w-full gap-1">
            <TabsTab value="changes" className="flex-1 h-7 text-[12px] gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0">
              <GitBranch className="size-3.5" />
              <span>Changes</span>
            </TabsTab>
            <TabsTab value="run-preview" className="flex-1 h-7 text-[12px] gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0">
              <Play className="size-3.5" />
              <span>Run/Preview</span>
            </TabsTab>
          </TabsList>
        </div>

        <div className={cn("flex-1 flex flex-col min-h-0", activeTab !== "changes" && "hidden")}>
          {/* Changes Header */}
          <div className="h-9 flex items-center justify-between px-3 border-b border-sidebar-border shrink-0 bg-sidebar-accent/5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Source Control</span>
              {(isLoading || isGlobalActionLoading) && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-1.5 px-2 py-1 hover:bg-sidebar-accent rounded-sm text-muted-foreground hover:text-foreground transition-colors"
                title="Create PR"
              >
                <GitPullRequestCreateArrow className="size-3" />
                <span className="text-[10px] font-medium">Create PR</span>
              </button>
              <button
                onClick={() => { refreshGitStatus(); refreshChangedFiles(); }}
                className="p-1 hover:bg-sidebar-accent rounded-sm text-muted-foreground hover:text-foreground transition-colors"
                title="Refresh"
              >
                <RefreshCw className={cn("size-3", isLoading && "animate-spin")} />
              </button>
            </div>
          </div>

          {/* Changes List */}
          <div className="flex-1 overflow-y-auto no-scrollbar p-2">
            {!hasChanges && !isLoading ? (
              <div className="flex flex-col items-center justify-center p-8 text-muted-foreground/50">
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
                  onDiscard={discardUnstagedChanges}
                  onStageAll={stageAllUnstaged}
                  onDiscardAll={discardAllUnstaged}
                />
                <ChangeSection
                  title="Untracked Changes"
                  files={untrackedFiles}
                  workspaceId={workspaceId}
                  onStage={stageFiles}
                  onDiscard={discardUntrackedFiles}
                  onStageAll={stageAllUntracked}
                  onDiscardAll={discardAllUntracked}
                />
              </>
            )}
          </div>

          {/* Commit Actions (Sticky Bottom) */}
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
        </div>

        <div className={cn("flex-1 min-h-0", activeTab !== "run-preview" && "hidden")}>
          <RunPreviewPanel
            workspaceId={workspaceId}
            projectId={currentProject?.id}
            isActive={activeTab === "run-preview"}
            projectName={currentProject?.name}
            workspaceName={currentWorkspace?.name}
          />
        </div>
      </Tabs>
    </aside >
  );
};

export default RightSidebar;