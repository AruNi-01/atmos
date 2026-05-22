"use client";

import React from "react";
import {
  ArrowRight,
  Check,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Edit2,
  GitBranch,
  GitPullRequestClosedIcon,
  GitPullRequestCreateIcon,
  Input,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  X,
  cn,
} from "@workspace/ui";

import type { Project, Workspace } from "@/types/types";
import {
  BranchSyncIndicator,
  getBranchSyncIndicatorState,
} from "./header-parts";

type BranchSyncState = ReturnType<typeof getBranchSyncIndicatorState>;

type CurrentBranchPullRequest = {
  number: number;
  state: string;
  title?: string | null;
};

type HeaderGitContextProps = {
  branchSyncState: BranchSyncState;
  currentBranchPR: CurrentBranchPullRequest | null;
  currentProject: Project | undefined;
  currentWorkspace: Workspace | undefined;
  displayCurrentBranch: string;
  displayTargetBranch: string;
  editedCurrentBranch: string;
  filteredBranches: string[];
  hasUncommittedChanges: boolean;
  hasUnpushedCommits: boolean;
  isEditingCurrentBranch: boolean;
  isLoadingBranches: boolean;
  isTargetBranchOpen: boolean;
  onCancelEditCurrentBranch: () => void;
  onOpenPr: (prNumber: number) => void;
  onRefreshChangedFiles: () => Promise<void> | void;
  onSaveCurrentBranch: () => Promise<void> | void;
  onSetTargetBranch: (projectId: string, branch: string) => Promise<void> | void;
  prIconRef: React.MutableRefObject<{
    startAnimation: () => void;
    stopAnimation: () => void;
  } | null>;
  setEditedCurrentBranch: React.Dispatch<React.SetStateAction<string>>;
  setIsEditingCurrentBranch: React.Dispatch<React.SetStateAction<boolean>>;
  setIsTargetBranchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTargetBranchFilter: React.Dispatch<React.SetStateAction<string>>;
  targetBranchFilter: string;
  uncommittedCount: number;
  unpushedCount: number;
};

export function HeaderGitContext({
  branchSyncState,
  currentBranchPR,
  currentProject,
  currentWorkspace,
  displayCurrentBranch,
  displayTargetBranch,
  editedCurrentBranch,
  filteredBranches,
  hasUncommittedChanges,
  hasUnpushedCommits,
  isEditingCurrentBranch,
  isLoadingBranches,
  isTargetBranchOpen,
  onCancelEditCurrentBranch,
  onOpenPr,
  onRefreshChangedFiles,
  onSaveCurrentBranch,
  onSetTargetBranch,
  prIconRef,
  setEditedCurrentBranch,
  setIsEditingCurrentBranch,
  setIsTargetBranchOpen,
  setTargetBranchFilter,
  targetBranchFilter,
  uncommittedCount,
  unpushedCount,
}: HeaderGitContextProps) {
  if (!currentWorkspace && !currentProject) {
    return null;
  }

  return (
    <div
      className={cn(
        "relative z-10 desktop-no-drag flex items-center space-x-1.5 bg-muted/40 px-2 py-1.5 rounded-md border border-transparent transition-all duration-300 ease-out h-8",
        currentWorkspace && isEditingCurrentBranch
          ? "border-sidebar-border bg-background shadow-xs w-fit"
          : "hover:bg-muted/60 hover:border-border w-fit max-w-[500px]",
      )}
    >
      {currentBranchPR && (
        <>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onOpenPr(currentBranchPR.number)}
                  onMouseEnter={() => prIconRef.current?.startAnimation()}
                  onMouseLeave={() => prIconRef.current?.stopAnimation()}
                  className="flex items-center space-x-1 py-0.5 px-1.5 rounded text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                  aria-label={`Open PR #${currentBranchPR.number}`}
                >
                  {currentBranchPR.state === "CLOSED" || currentBranchPR.state === "MERGED" ? (
                    <GitPullRequestClosedIcon
                      ref={prIconRef}
                      size={14}
                      className="shrink-0 pointer-events-none"
                    />
                  ) : (
                    <GitPullRequestCreateIcon
                      ref={prIconRef}
                      size={14}
                      className="shrink-0 pointer-events-none"
                    />
                  )}
                  <span>#{currentBranchPR.number}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {currentBranchPR.title}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="h-4 w-px bg-border/60 shrink-0 mx-0.5" />
        </>
      )}

      <div className="flex items-center space-x-1 shrink-0">
        <BranchSyncIndicator state={branchSyncState} />
        {currentWorkspace && isEditingCurrentBranch ? (
          <div className="flex items-center space-x-1 animate-in fade-in zoom-in-95 duration-200">
            <Input
              value={editedCurrentBranch}
              onChange={(e) => setEditedCurrentBranch(e.target.value)}
              className="h-6 w-48 text-[13px] px-2 py-0 bg-secondary/50 border-transparent focus:bg-background transition-colors rounded-sm focus:border-primary/20"
              placeholder="branch-name"
              onKeyDown={(e) => {
                if (e.key === "Enter") void onSaveCurrentBranch();
                if (e.key === "Escape") onCancelEditCurrentBranch();
              }}
              autoFocus
            />
            <button
              onClick={() => void onSaveCurrentBranch()}
              className="relative z-20 flex size-6 items-center justify-center rounded-sm text-success transition-colors hover:bg-success/10 shrink-0"
              aria-label="Save current branch"
            >
              <Check className="size-3.5" />
            </button>
            <button
              onClick={onCancelEditCurrentBranch}
              className="size-6 flex items-center justify-center hover:bg-muted rounded-sm text-muted-foreground transition-colors shrink-0"
              aria-label="Cancel editing"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <div
            role={currentWorkspace ? "button" : undefined}
            tabIndex={currentWorkspace ? 0 : undefined}
            className={cn(
              "flex items-center space-x-1.5 py-0.5 px-1 rounded transition-colors overflow-hidden",
              currentWorkspace && "cursor-pointer group/branch hover:bg-accent",
            )}
            onClick={currentWorkspace ? () => setIsEditingCurrentBranch(true) : undefined}
            onKeyDown={
              currentWorkspace
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setIsEditingCurrentBranch(true);
                    }
                  }
                : undefined
            }
          >
            <span className="text-[13px] font-medium text-foreground truncate block max-w-[120px]">
              {displayCurrentBranch}
            </span>
            {(hasUncommittedChanges || hasUnpushedCommits) && (
              <span className="text-[11px] text-warning font-medium shrink-0">
                {hasUncommittedChanges && `+${uncommittedCount}`}
                {hasUncommittedChanges && hasUnpushedCommits && " "}
                {hasUnpushedCommits && `↑${unpushedCount}`}
              </span>
            )}
            {currentWorkspace && (
              <Edit2 className="size-2.5 opacity-0 group-hover/branch:opacity-100 transition-opacity text-muted-foreground shrink-0" />
            )}
          </div>
        )}
      </div>

      <ArrowRight className="size-3 text-muted-foreground/50 shrink-0 -ml-1" />

      <div className="flex items-center shrink-0 min-w-0">
        <DropdownMenu
          open={isTargetBranchOpen}
          onOpenChange={(open) => {
            setIsTargetBranchOpen(open);
            if (open) setTargetBranchFilter("");
          }}
        >
          <DropdownMenuTrigger asChild>
            <button className="flex items-center space-x-1 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors outline-none cursor-pointer group/target py-0.5 px-1 rounded hover:bg-accent max-w-full">
              <span className="opacity-50 shrink-0">origin/</span>
              <span className="truncate block max-w-[100px]">{displayTargetBranch}</span>
              <Edit2 className="size-2.5 opacity-0 group-hover/target:opacity-100 transition-opacity ml-0.5 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-72 p-3 bg-background overflow-visible">
            <div className="space-y-2">
              <p className="text-[12px] text-foreground/90">Select target branch</p>
              <Input
                value={targetBranchFilter}
                onChange={(e) => setTargetBranchFilter(e.target.value)}
                placeholder="Search branches..."
                className="h-8 text-[12px] bg-background"
              />
            </div>
            <ScrollArea className="h-[240px] mt-2 overflow-x-auto">
              <div className="p-1 w-max min-w-full">
                {isLoadingBranches ? (
                  <div className="p-2 text-[12px] text-muted-foreground text-center">
                    Loading branches...
                  </div>
                ) : filteredBranches.length > 0 ? (
                  filteredBranches.map((branch) => (
                    <DropdownMenuItem
                      key={branch}
                      onClick={async () => {
                        if (!currentProject) return;
                        await onSetTargetBranch(currentProject.id, branch);
                        await onRefreshChangedFiles();
                      }}
                      className={cn(
                        "flex items-center justify-between text-[13px] cursor-pointer whitespace-nowrap min-w-max",
                        displayTargetBranch === branch && "bg-accent text-accent-foreground font-medium",
                      )}
                    >
                      <div className="flex items-center whitespace-nowrap">
                        {displayTargetBranch === branch ? (
                          <Check className="size-3.5 mr-2 text-emerald-500 shrink-0" />
                        ) : (
                          <GitBranch className="size-3.5 mr-2 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-muted-foreground/60 mr-1">origin/</span>
                        <span>{branch}</span>
                      </div>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <div className="p-2 text-[12px] text-muted-foreground text-center">
                    No matching branches
                  </div>
                )}
              </div>
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
