"use client";

import React, { useState, useEffect } from 'react';
import { useGitStore } from '@/hooks/use-git-store';
import { useEditorStore } from '@/hooks/use-editor-store';
import { Check, RefreshCw, Upload, Loader2, GitGraph, getFileIconProps } from '@workspace/ui';
import { cn } from "@/lib/utils";

import { useSearchParams } from 'next/navigation';

interface RightSidebarProps {
  // kept for compatibility if needed, but unused
  changes?: any[];
}

// File icon component matching the file tree
function FileIcon({ name, className }: { name: string; className?: string }) {
  const iconProps = getFileIconProps({ name, isDir: false, className });
  return <img {...iconProps} />;
}

const RightSidebar: React.FC<RightSidebarProps> = () => {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');
  const { currentProjectPath, openFile, getActiveFilePath } = useEditorStore();
  const activeFilePath = getActiveFilePath(workspaceId || undefined);

  const {
    gitStatus,
    changedFiles,
    setCurrentRepoPath,
    refreshGitStatus,
    refreshChangedFiles,
    totalAdditions,
    totalDeletions,
    commitChanges,
    pushChanges,
    isLoading,
    selectedFilePath
  } = useGitStore();

  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  // Sync current project path to git store
  useEffect(() => {
    if (currentProjectPath) {
      setCurrentRepoPath(currentProjectPath);
    }
  }, [currentProjectPath, setCurrentRepoPath]);

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setIsCommitting(true);
    try {
      await commitChanges(commitMessage);
      setCommitMessage("");
    } catch (e) {
      console.error(e);
    } finally {
      setIsCommitting(false);
    }
  };

  const handlePush = async () => {
    setIsPushing(true);
    try {
      await pushChanges();
    } catch (e) {
      console.error(e);
    } finally {
      setIsPushing(false);
    }
  };

  const hasUnpushedCommits = gitStatus?.has_unpushed_commits || false;
  const unpushedCount = gitStatus?.unpushed_count || 0;

  return (
    <aside className="w-full flex flex-col border-l border-white/5 h-full">

      {/* Changes Header */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase text-balance">Changes</span>
          {isLoading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground tabular-nums flex bg-sidebar-accent px-1.5 py-0.5 rounded-sm">
            <span className="text-emerald-500 mr-1">+{totalAdditions}</span>
            <span className="text-muted-foreground/50 mr-1">/</span>
            <span className="text-red-500">-{totalDeletions}</span>
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-sidebar-accent text-sidebar-foreground font-mono tabular-nums">
            {changedFiles.length}
          </span>
        </div>
      </div>

      {/* Commit Actions */}
      <div className="flex flex-col p-4 border-b border-sidebar-border gap-3">
        {changedFiles.length > 0 ? (
          <>
            <input
              type="text"
              placeholder="Commit message"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCommit();
                }
              }}
              className="w-full p-2 border border-sidebar-border rounded-sm bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all ease-out duration-200 text-xs"
            />
            <button
              onClick={handleCommit}
              disabled={isCommitting || !commitMessage.trim()}
              className={cn(
                "w-full flex items-center justify-center space-x-2 py-2 rounded-sm transition-all ease-out duration-200",
                isCommitting || !commitMessage.trim()
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-emerald-900/20 hover:bg-emerald-900/30 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40"
              )}
            >
              {isCommitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              <span className="text-[13px] font-medium text-pretty">{isCommitting ? 'Committing...' : 'Commit'}</span>
            </button>
          </>
        ) : (
          <div className="text-xs text-muted-foreground text-center py-2 flex flex-col items-center gap-2">
            <Check className="size-8 opacity-20" />
            <span>No changes to commit</span>
          </div>
        )}

        {/* Push Button */}
        {hasUnpushedCommits && (
          <button
            onClick={handlePush}
            disabled={isPushing}
            className="w-full flex items-center justify-center space-x-2 py-2 bg-blue-900/20 hover:bg-blue-900/30 text-blue-400 border border-blue-500/20 hover:border-blue-500/40 rounded-sm transition-all ease-out duration-200"
          >
            {isPushing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            <span className="text-[13px] font-medium text-pretty">
              {isPushing ? 'Pushing...' : `Push ${unpushedCount} Commit${unpushedCount > 1 ? 's' : ''}`}
            </span>
          </button>
        )}
      </div>

      {/* Changes List */}
      <div className="flex-1 overflow-y-auto overflow-x-auto no-scrollbar p-2">
        {changedFiles.map(file => {
          const fileName = file.path.split('/').pop() || file.path;
          const dirPath = file.path.split('/').slice(0, -1).join('/');
          
          return (
            <div
              key={file.path}
              onClick={() => openFile(`diff://${file.path}`, workspaceId || undefined)}
              className={cn(
                "group flex items-center px-3 py-2 rounded-sm cursor-pointer transition-colors ease-out duration-200 mb-0.5 min-w-max",
                activeFilePath === `diff://${file.path}` ? "bg-sidebar-accent text-sidebar-foreground" : "hover:bg-sidebar-accent/50"
              )}
            >
              {/* File icon */}
              <FileIcon name={fileName} className="size-4 mr-2 shrink-0" />
              {/* Filename (always fully visible, never truncate) */}
              <span className="text-[13px] text-muted-foreground group-hover:text-sidebar-foreground font-medium whitespace-nowrap shrink-0">
                {fileName}
              </span>
              {/* Path (truncate from start using rtl, max width constrained) */}
              {dirPath && (
                <span 
                  className="text-[11px] text-muted-foreground/50 max-w-[100px] truncate ml-2 shrink"
                  style={{ direction: 'rtl', textAlign: 'left' }}
                  title={dirPath}
                >
                  <span style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}>{dirPath}</span>
                </span>
              )}
              {/* Git stats (fixed position, always visible) */}
              <div className="flex items-center gap-1.5 text-[11px] font-mono ml-auto pl-3 shrink-0 tabular-nums">
                {file.additions > 0 && <span className="text-emerald-500">+{file.additions}</span>}
                {file.deletions > 0 && <span className="text-red-500">-{file.deletions}</span>}
                <span className={cn(
                  "opacity-70",
                  file.status === 'M' ? 'text-yellow-500' :
                    file.status === 'A' ? 'text-emerald-500' :
                      file.status === 'D' ? 'text-red-500' : 'text-foreground'
                )}>{file.status}</span>
              </div>
            </div>
          );
        })}

        {/* Placeholder for empty space */}
        <div className="h-4"></div>
      </div>

      {/* Action Pad */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="text-xs font-medium text-muted-foreground mb-3 uppercase text-balance">Quick Actions</div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { refreshGitStatus(); refreshChangedFiles(); }}
            className="flex flex-col items-center justify-center p-3 rounded-sm border border-sidebar-border hover:bg-sidebar-accent hover:border-sidebar-border/80 transition-all ease-out duration-200 group"
          >
            <RefreshCw className={cn("size-5 text-muted-foreground mb-2 group-hover:text-foreground transition-colors ease-out duration-200", isLoading && "animate-spin")} />
            <span className="text-xs font-medium text-sidebar-foreground text-pretty">Refresh Git</span>
          </button>
          <button className="flex flex-col items-center justify-center p-3 rounded-sm border border-sidebar-border hover:bg-sidebar-accent hover:border-sidebar-border/80 transition-all ease-out duration-200 group">
            <GitGraph className="size-5 text-muted-foreground mb-2 group-hover:text-foreground transition-colors ease-out duration-200" />
            <span className="text-xs font-medium text-sidebar-foreground text-pretty">Graph (Soon)</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default RightSidebar;