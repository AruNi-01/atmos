"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Check,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Edit2,
  GitBranch,
  Input,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  X,
  cn,
} from "@workspace/ui";

import type { Project, Workspace } from "@/shared/types/domain";
import { WorkspacePrLifecycleIcon } from "@/features/github/components/WorkspacePrStatusIcon";
import { useOpenGithubCenterTab } from "@/features/github/hooks/use-open-github-center-tab";
import { useWorkspacePrStatus } from "@/features/github/hooks/use-workspace-pr-status";
import {
  BranchSyncIndicator,
  HEADER_CHIP_HOVER_CLASS,
  HEADER_CHIP_SURFACE_CLASS,
  getBranchSyncIndicatorState,
} from "./header-parts";

type BranchSyncState = ReturnType<typeof getBranchSyncIndicatorState>;

type HeaderGitContextProps = {
  branchSyncState: BranchSyncState;
  currentBranch: string | null;
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
  onRefreshChangedFiles: () => Promise<void> | void;
  onSaveCurrentBranch: () => Promise<void> | void;
  onSetTargetBranch: (projectId: string, branch: string) => Promise<void> | void;
  repoPath: string | null;
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
  currentBranch,
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
  onRefreshChangedFiles,
  onSaveCurrentBranch,
  onSetTargetBranch,
  repoPath,
  setEditedCurrentBranch,
  setIsEditingCurrentBranch,
  setIsTargetBranchOpen,
  setTargetBranchFilter,
  targetBranchFilter,
  uncommittedCount,
  unpushedCount,
}: HeaderGitContextProps) {
  const t = useTranslations("header");
  const { openPullRequestTab } = useOpenGithubCenterTab();
  const prRepoPath =
    repoPath?.trim() ||
    currentWorkspace?.localPath?.trim() ||
    currentProject?.mainFilePath?.trim() ||
    null;
  const { presentation: managedPr } = useWorkspacePrStatus({
    githubPr: currentWorkspace?.githubPr,
    branch: currentWorkspace?.branch || currentBranch,
    repoPath: prRepoPath,
  });
  const openManagedPullRequest = React.useCallback(() => {
    if (!managedPr) return;
    openPullRequestTab({
      owner: managedPr.owner,
      repo: managedPr.repo,
      prNumber: managedPr.number,
      title: managedPr.title,
      branch: currentWorkspace?.branch || currentBranch || displayCurrentBranch,
      contextId: currentWorkspace?.id ?? currentProject?.id,
    });
  }, [
    currentBranch,
    currentProject?.id,
    currentWorkspace?.branch,
    currentWorkspace?.id,
    displayCurrentBranch,
    managedPr,
    openPullRequestTab,
  ]);

  if (!currentWorkspace && !currentProject) {
    return null;
  }

  return (
    <div
      className={cn(
        "desktop-no-drag relative z-10 flex h-8 items-center space-x-1.5 rounded-md px-2 py-1.5",
        HEADER_CHIP_SURFACE_CLASS,
        currentWorkspace && isEditingCurrentBranch
          ? "w-fit border-sidebar-border bg-background shadow-xs"
          : cn(HEADER_CHIP_HOVER_CLASS, "w-fit max-w-[500px]"),
      )}
    >
      {managedPr ? (
        <>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={openManagedPullRequest}
                  className="group/pr flex shrink-0 items-center space-x-1 rounded px-1.5 py-0.5 text-[12px] font-medium hover:bg-accent"
                  aria-label={t("gitContext.openPr", { number: managedPr.number })}
                >
                  <WorkspacePrLifecycleIcon
                    state={managedPr.state}
                    checksTone={managedPr.checksTone}
                    className="pointer-events-none"
                  />
                  <span className="text-muted-foreground group-hover/pr:text-foreground">
                    #{managedPr.number}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {managedPr.title}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="mx-1.5 h-4 w-px shrink-0 bg-border/60" />
        </>
      ) : null}

      <div className="flex shrink-0 items-center space-x-1">
        <BranchSyncIndicator state={branchSyncState} />
        {currentWorkspace && isEditingCurrentBranch ? (
          <div className="flex animate-in items-center space-x-1 duration-200 zoom-in-95 fade-in">
            <Input
              value={editedCurrentBranch}
              onChange={(e) => setEditedCurrentBranch(e.target.value)}
              className="h-6 w-48 rounded-sm border-transparent bg-secondary/50 px-2 py-0 text-[13px] focus:border-primary/20 focus:bg-background"
              placeholder={t("gitContext.branchNamePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onSaveCurrentBranch();
                if (e.key === "Escape") onCancelEditCurrentBranch();
              }}
              autoFocus
            />
            <button
              onClick={() => void onSaveCurrentBranch()}
              className="relative z-20 flex size-6 shrink-0 items-center justify-center rounded-sm text-success hover:bg-success/10"
              aria-label={t("gitContext.saveCurrentBranch")}
            >
              <Check className="size-3.5" />
            </button>
            <button
              onClick={onCancelEditCurrentBranch}
              className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
              aria-label={t("gitContext.cancelEditing")}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <div
            role={currentWorkspace ? "button" : undefined}
            tabIndex={currentWorkspace ? 0 : undefined}
            className={cn(
              "flex items-center space-x-1.5 overflow-hidden rounded px-1 py-0.5",
              currentWorkspace && "group/branch cursor-pointer hover:bg-accent",
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
            <span className="block max-w-[120px] truncate text-[13px] font-medium text-foreground">
              {displayCurrentBranch}
            </span>
            {(hasUncommittedChanges || hasUnpushedCommits) && (
              <span className="shrink-0 text-[11px] font-medium text-warning">
                {hasUncommittedChanges && `+${uncommittedCount}`}
                {hasUncommittedChanges && hasUnpushedCommits && " "}
                {hasUnpushedCommits && `↑${unpushedCount}`}
              </span>
            )}
            {currentWorkspace && (
              <Edit2 className="size-2.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/branch:opacity-100" />
            )}
          </div>
        )}
      </div>

      <ArrowRight className="-ml-1 size-3 shrink-0 text-muted-foreground/50" />

      <div className="flex min-w-0 shrink-0 items-center">
        <DropdownMenu
          open={isTargetBranchOpen}
          onOpenChange={(open) => {
            setIsTargetBranchOpen(open);
            if (open) setTargetBranchFilter("");
          }}
        >
          <DropdownMenuTrigger asChild>
            <button className="group/target flex max-w-full cursor-pointer items-center space-x-1 rounded px-1 py-0.5 text-[13px] font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground">
              <span className="shrink-0 opacity-50">origin/</span>
              <span className="block max-w-[100px] truncate">{displayTargetBranch}</span>
              <Edit2 className="ml-0.5 size-2.5 shrink-0 opacity-0 transition-opacity group-hover/target:opacity-100" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-72 overflow-visible bg-background p-3">
            <div className="space-y-2">
              <p className="text-[12px] text-foreground/90">{t("gitContext.selectTargetBranch")}</p>
              <Input
                value={targetBranchFilter}
                onChange={(e) => setTargetBranchFilter(e.target.value)}
                placeholder={t("gitContext.searchBranches")}
                className="h-8 bg-background text-[12px]"
              />
            </div>
            <ScrollArea className="mt-2 h-[240px] overflow-x-auto">
              <div className="w-max min-w-full p-1">
                {isLoadingBranches ? (
                  <div className="p-2 text-center text-[12px] text-muted-foreground">
                    {t("gitContext.loadingBranches")}
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
                        "flex min-w-max cursor-pointer items-center justify-between text-[13px] whitespace-nowrap",
                        displayTargetBranch === branch &&
                          "bg-accent font-medium text-accent-foreground",
                      )}
                    >
                      <div className="flex items-center whitespace-nowrap">
                        {displayTargetBranch === branch ? (
                          <Check className="mr-2 size-3.5 shrink-0 text-emerald-500" />
                        ) : (
                          <GitBranch className="mr-2 size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="mr-1 text-muted-foreground/60">origin/</span>
                        <span>{branch}</span>
                      </div>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <div className="p-2 text-center text-[12px] text-muted-foreground">
                    {t("gitContext.noMatchingBranches")}
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
