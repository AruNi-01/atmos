"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Check,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  toastManager,
} from "@workspace/ui";
import { ChevronDown } from "lucide-react";

import type { GitCommit } from "@/features/github/hooks/use-github";
import { cn } from "@/shared/lib/utils";

export type ChangesDiffScope = "branch" | "unstaged" | "staged" | "commit";

interface ChangesScopeMenuProps {
  scope: ChangesDiffScope;
  selectedCommitHash: string | null;
  commits: GitCommit[];
  loadingCommits: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectScope: (scope: Exclude<ChangesDiffScope, "commit">) => void;
  onSelectCommit: (commitHash: string) => void;
  onOpenHistory?: () => void;
}

interface ChangesToolbarProps extends ChangesScopeMenuProps {
  className?: string;
  isBusy?: boolean;
  onStageAll?: () => Promise<void> | void;
  onUnstageAll?: () => Promise<void> | void;
  onDiscardTracked?: () => Promise<void> | void;
  onTrashUntracked?: () => Promise<void> | void;
}

function formatCommitScopeLabel(commit: GitCommit | undefined, fallbackHash: string | null) {
  if (commit) return commit.short_hash;
  return fallbackHash ? fallbackHash.slice(0, 7) : null;
}

function ChangesScopeMenu({
  scope,
  selectedCommitHash,
  commits,
  loadingCommits,
  stagedCount,
  unstagedCount,
  untrackedCount,
  open,
  onOpenChange,
  onSelectScope,
  onSelectCommit,
  onOpenHistory,
}: ChangesScopeMenuProps) {
  const t = useTranslations("AppShell.chrome");
  const selectedCommit = commits.find((commit) => commit.hash === selectedCommitHash);
  const label =
    scope === "commit"
      ? formatCommitScopeLabel(selectedCommit, selectedCommitHash) ??
        t("rightSidebar.changes.scope.commit")
      : scope === "branch"
        ? t("rightSidebar.changes.scope.branch")
        : scope === "staged"
          ? t("rightSidebar.changes.scope.staged")
          : t("rightSidebar.changes.scope.unstaged");

  const renderTrailingCheck = (checked: boolean) =>
    checked ? <Check className="size-3.5 shrink-0" /> : null;
  const renderCountBadge = (count: number) =>
    count > 0 ? (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
        {count}
      </span>
    ) : null;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          title={t("rightSidebar.changes.selectScope")}
          aria-label={t("rightSidebar.changes.selectScope")}
          className="min-w-0 max-w-[45%] justify-start gap-1 rounded-md px-2 text-xs text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-foreground"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => onSelectScope("unstaged")}
        >
          <span>{t("rightSidebar.changes.scope.unstaged")}</span>
          {renderCountBadge(unstagedCount + untrackedCount)}
          <span className="flex-1" />
          {renderTrailingCheck(scope === "unstaged")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => onSelectScope("staged")}
        >
          <span>{t("rightSidebar.changes.scope.staged")}</span>
          {renderCountBadge(stagedCount)}
          <span className="flex-1" />
          {renderTrailingCheck(scope === "staged")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            className={cn(
              "group/commit-scope cursor-pointer",
              scope === "commit" &&
                "[&>svg:last-child]:hidden hover:[&>svg:last-child]:block data-[state=open]:[&>svg:last-child]:block",
            )}
          >
            <span className="flex-1">{t("rightSidebar.changes.scope.commit")}</span>
            {scope === "commit" ? (
              <Check className="size-3.5 shrink-0 group-hover/commit-scope:hidden group-data-[state=open]/commit-scope:hidden" />
            ) : null}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 w-80 overflow-y-auto">
            {loadingCommits && commits.length === 0 ? (
              <DropdownMenuItem disabled>
                {t("rightSidebar.changes.loadingCommits")}
              </DropdownMenuItem>
            ) : commits.length === 0 ? (
              <DropdownMenuItem disabled>
                {t("rightSidebar.changes.noCommitsOnBranch")}
              </DropdownMenuItem>
            ) : (
              commits.map((commit) => (
                <DropdownMenuItem
                  key={commit.hash}
                  className="min-w-0 cursor-pointer"
                  onSelect={() => onSelectCommit(commit.hash)}
                >
                  <span className="w-14 shrink-0 font-mono text-[11px] text-muted-foreground">
                    {commit.short_hash}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{commit.subject}</span>
                  {renderTrailingCheck(
                    scope === "commit" && selectedCommitHash === commit.hash,
                  )}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => onSelectScope("branch")}
        >
          <span className="flex-1">{t("rightSidebar.changes.scope.branch")}</span>
          {renderTrailingCheck(scope === "branch")}
        </DropdownMenuItem>
        {onOpenHistory ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" onSelect={onOpenHistory}>
              <span className="flex-1">{t("rightSidebar.changes.history")}</span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ChangesToolbar({
  className,
  commits,
  isBusy = false,
  loadingCommits,
  onOpenChange,
  onOpenHistory,
  onSelectCommit,
  onSelectScope,
  onStageAll,
  onUnstageAll,
  onDiscardTracked,
  onTrashUntracked,
  open,
  scope,
  selectedCommitHash,
  stagedCount,
  unstagedCount,
  untrackedCount,
}: ChangesToolbarProps) {
  const t = useTranslations("AppShell.chrome");
  const [isRunningAction, setIsRunningAction] = React.useState(false);
  const actionsBusy = isBusy || isRunningAction;
  const canStageAll =
    scope === "unstaged" &&
    unstagedCount + untrackedCount > 0 &&
    Boolean(onStageAll);
  const canUnstageAll =
    scope === "staged" && stagedCount > 0 && Boolean(onUnstageAll);
  const canDiscardTracked =
    scope === "unstaged" && unstagedCount > 0 && Boolean(onDiscardTracked);
  const canTrashUntracked =
    scope === "unstaged" && untrackedCount > 0 && Boolean(onTrashUntracked);
  const primaryAction = scope === "staged" ? onUnstageAll : onStageAll;
  const primaryEnabled = scope === "staged" ? canUnstageAll : canStageAll;
  const primaryLabel =
    scope === "staged"
      ? t("rightSidebar.changes.actions.unstageAll")
      : t("rightSidebar.changes.actions.stageAll");

  const runAction = React.useCallback(
    async (action: (() => Promise<void> | void) | undefined) => {
      if (!action || actionsBusy) return;

      setIsRunningAction(true);
      try {
        await action();
      } catch (error) {
        toastManager.add({
          title: t("rightSidebar.changes.actions.failedTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("rightSidebar.changes.actions.failedDescription"),
          type: "error",
        });
      } finally {
        setIsRunningAction(false);
      }
    },
    [actionsBusy, t],
  );

  return (
    <div
      className={cn(
        "flex h-full w-full min-w-0 items-center justify-between gap-2 px-2",
        className,
      )}
    >
      <ChangesScopeMenu
        scope={scope}
        selectedCommitHash={selectedCommitHash}
        commits={commits}
        loadingCommits={loadingCommits}
        stagedCount={stagedCount}
        unstagedCount={unstagedCount}
        untrackedCount={untrackedCount}
        open={open}
        onOpenChange={onOpenChange}
        onSelectScope={onSelectScope}
        onSelectCommit={onSelectCommit}
        onOpenHistory={onOpenHistory}
      />

      <div className="flex shrink-0 items-center">
        <Button
          type="button"
          size="xs"
          disabled={!primaryEnabled || actionsBusy}
          loading={isRunningAction}
          onClick={() => void runAction(primaryAction)}
          className="rounded-r-none border-r-primary-foreground/20 px-2.5"
        >
          {primaryLabel}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              disabled={actionsBusy}
              aria-label={t("rightSidebar.changes.actions.moreActions")}
              title={t("rightSidebar.changes.actions.moreActions")}
              className="rounded-l-none border-l-0"
            >
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              disabled={!canStageAll || actionsBusy}
              onSelect={() => void runAction(onStageAll)}
            >
              {t("rightSidebar.changes.actions.stageAll")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canUnstageAll || actionsBusy}
              onSelect={() => void runAction(onUnstageAll)}
            >
              {t("rightSidebar.changes.actions.unstageAll")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={!canDiscardTracked || actionsBusy}
              onSelect={() => void runAction(onDiscardTracked)}
            >
              {t("rightSidebar.changes.actions.discardTracked")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={!canTrashUntracked || actionsBusy}
              onSelect={() => void runAction(onTrashUntracked)}
            >
              {t("rightSidebar.changes.actions.trashUntracked")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
