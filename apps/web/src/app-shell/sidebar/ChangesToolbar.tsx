"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui";
import { ChevronDown, File, List, ListTree } from "lucide-react";

import type { GitCommit } from "@/features/github/hooks/use-github";
import { cn } from "@/shared/lib/utils";
import { RefreshableTabsTab } from "@/shared/components/ui/RefreshableTabsTab";

export type ChangesDiffScope = "branch" | "unstaged" | "staged" | "commit";

interface ChangesScopeMenuProps {
  scope: ChangesDiffScope;
  selectedCommitHash: string | null;
  commits: GitCommit[];
  loadingCommits: boolean;
  stagedCount: number;
  unstagedCount: number;
  open: boolean;
  isVisible: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectScope: (scope: Exclude<ChangesDiffScope, "commit">) => void;
  onSelectCommit: (commitHash: string) => void;
  onOpenHistory?: () => void;
}

interface ChangesToolbarProps extends Omit<ChangesScopeMenuProps, "isVisible"> {
  activeValue: string;
  className?: string;
  isRefreshing?: boolean;
  onRefresh: () => Promise<unknown> | void;
  onToggleViewMode: () => void;
  value: string;
  viewMode: "list" | "tree";
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
  open,
  isVisible,
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
        <span
          role="button"
          title={t("rightSidebar.changes.selectScope")}
          aria-label={t("rightSidebar.changes.selectScope")}
          tabIndex={isVisible ? 0 : -1}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
          className="flex h-full min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3 shrink-0" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => onSelectScope("unstaged")}
        >
          <span>{t("rightSidebar.changes.scope.unstaged")}</span>
          {renderCountBadge(unstagedCount)}
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
  activeValue,
  className,
  commits,
  isRefreshing,
  loadingCommits,
  onOpenChange,
  onRefresh,
  onOpenHistory,
  onSelectCommit,
  onSelectScope,
  onToggleViewMode,
  open,
  scope,
  selectedCommitHash,
  stagedCount,
  unstagedCount,
  value,
  viewMode,
}: ChangesToolbarProps) {
  const t = useTranslations("AppShell.chrome");

  return (
    <RefreshableTabsTab
      value={value}
      activeValue={activeValue}
      refreshTitle={t("rightSidebar.changes.refreshChanges")}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      forceActionsVisible={open}
      trailingAction={({ isVisible }) => (
        <>
          <ChangesScopeMenu
            scope={scope}
            selectedCommitHash={selectedCommitHash}
            commits={commits}
            loadingCommits={loadingCommits}
            stagedCount={stagedCount}
            unstagedCount={unstagedCount}
            open={open}
            isVisible={isVisible}
            onOpenChange={onOpenChange}
            onSelectScope={onSelectScope}
            onSelectCommit={onSelectCommit}
            onOpenHistory={onOpenHistory}
          />
          <span
            role="button"
            title={
              viewMode === "tree"
                ? t("rightSidebar.changes.showAsList")
                : t("rightSidebar.changes.showAsTree")
            }
            aria-label={
              viewMode === "tree"
                ? t("rightSidebar.changes.showChangedFilesAsList")
                : t("rightSidebar.changes.showChangedFilesAsTree")
            }
            tabIndex={isVisible ? 0 : -1}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleViewMode();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onToggleViewMode();
            }}
            className="flex h-full w-8 cursor-pointer items-center justify-center border-l border-sidebar-border/60 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            {viewMode === "tree" ? (
              <List className="size-3.5" />
            ) : (
              <ListTree className="size-3.5" />
            )}
          </span>
        </>
      )}
      className={className}
    >
      <File className="size-3.5" />
      <span>{t("rightSidebar.changes.diffTab")}</span>
    </RefreshableTabsTab>
  );
}
