"use client";

import React from "react";
import {
  GitBranch,
  GitCommit as GitCommitIcon,
  GitPullRequest,
  GitPullRequestCreate,
  GitPullRequestClosed,
  Workflow,
  File,
  FileCheckCorner,
  Check,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui";
import { Tabs, TabsList, TabsTab } from "@workspace/ui";
import { cn } from "@/lib/utils";
import type { ChangesView } from "@/lib/nuqs/searchParams";
import { RefreshableTabsTab } from "@/components/ui/RefreshableTabsTab";

type ChangesSubTab = "changes" | "commits";
type PRSubTab = "open" | "closed";

export interface ChangesViewSwitcherProps {
  changesView: ChangesView;
  onViewChange: (view: ChangesView) => void;
  hasWorkingContext: boolean;
  hasUnreadReviewReplies?: boolean;
  changesSubTab: ChangesSubTab;
  onChangesSubTabChange: (tab: ChangesSubTab) => void;
  onRefreshChanges: () => void | Promise<void>;
  onRefreshCommits: () => void | Promise<void>;
  isChangesRefreshing: boolean;
  isCommitsRefreshing: boolean;
  prSubTab: PRSubTab;
  onPRSubTabChange: (tab: PRSubTab) => void;
  onRefreshOpenPRs: () => void | Promise<void>;
  onRefreshClosedPRs: () => void | Promise<void>;
  isOpenPRsLoading: boolean;
  isClosedPRsLoading: boolean;
  reviewActions?: React.ReactNode;
}

const VIEW_OPTIONS: Array<{
  value: ChangesView;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "changes", label: "Changes", Icon: GitBranch },
  { value: "pr", label: "PR", Icon: GitPullRequest },
  { value: "actions", label: "Actions", Icon: Workflow },
  { value: "review", label: "Review", Icon: FileCheckCorner },
];

export const ChangesViewSwitcher: React.FC<ChangesViewSwitcherProps> = ({
  changesView,
  onViewChange,
  hasWorkingContext,
  hasUnreadReviewReplies = false,
  changesSubTab,
  onChangesSubTabChange,
  onRefreshChanges,
  onRefreshCommits,
  isChangesRefreshing,
  isCommitsRefreshing,
  prSubTab,
  onPRSubTabChange,
  onRefreshOpenPRs,
  onRefreshClosedPRs,
  isOpenPRsLoading,
  isClosedPRsLoading,
  reviewActions,
}) => {
  if (!hasWorkingContext) {
    return (
      <div className="flex border-b border-sidebar-border shrink-0 bg-sidebar-accent/5 h-10 overflow-hidden" />
    );
  }

  const current =
    VIEW_OPTIONS.find((opt) => opt.value === changesView) ?? VIEW_OPTIONS[0];
  const CurrentIcon = current.Icon;
  const showUnreadDot =
    hasUnreadReviewReplies && changesView !== "review";

  const renderSubTabs = () => {
    if (changesView === "changes") {
      return (
        <Tabs
          value={changesSubTab}
          onValueChange={(v) => {
            onChangesSubTabChange(v as ChangesSubTab);
          }}
          className="flex-1 h-full min-w-0"
        >
          <TabsList variant="underline" className="h-full w-full gap-0 py-0!">
            <RefreshableTabsTab
              value="changes"
              activeValue={changesSubTab}
              refreshTitle="Refresh changes"
              onRefresh={onRefreshChanges}
              isRefreshing={isChangesRefreshing}
              className="flex-1 h-full! text-sm gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!"
            >
              <File className="size-3.5" />
              <span>Files</span>
            </RefreshableTabsTab>
            <RefreshableTabsTab
              value="commits"
              activeValue={changesSubTab}
              refreshTitle="Refresh commits"
              onRefresh={onRefreshCommits}
              isRefreshing={isCommitsRefreshing}
              className="flex-1 h-full! text-sm gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!"
            >
              <GitCommitIcon className="size-3.5" />
              <span>Commits</span>
            </RefreshableTabsTab>
          </TabsList>
        </Tabs>
      );
    }

    if (changesView === "pr") {
      return (
        <Tabs
          value={prSubTab}
          onValueChange={(v) => onPRSubTabChange(v as PRSubTab)}
          className="flex-1 h-full min-w-0"
        >
          <TabsList variant="underline" className="h-full w-full gap-0 py-0!">
            <RefreshableTabsTab
              value="open"
              activeValue={prSubTab}
              refreshTitle="Refresh open pull requests"
              onRefresh={onRefreshOpenPRs}
              isRefreshing={prSubTab === "open" && isOpenPRsLoading}
              className="flex-1 h-full! text-sm gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!"
            >
              <GitPullRequestCreate className="size-3.5" />
              <span>Open</span>
            </RefreshableTabsTab>
            <RefreshableTabsTab
              value="closed"
              activeValue={prSubTab}
              refreshTitle="Refresh closed pull requests"
              onRefresh={onRefreshClosedPRs}
              isRefreshing={prSubTab === "closed" && isClosedPRsLoading}
              className="flex-1 h-full! text-sm gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!"
            >
              <GitPullRequestClosed className="size-3.5" />
              <span>Closed</span>
            </RefreshableTabsTab>
          </TabsList>
        </Tabs>
      );
    }

    if (changesView === "review") {
      return reviewActions ? (
        <div className="flex-1 flex items-center min-w-0 pl-2">
          {reviewActions}
        </div>
      ) : null;
    }

    return null;
  };

  return (
    <div className="flex border-b border-sidebar-border shrink-0 bg-background/50 backdrop-blur-sm h-10">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "relative flex items-center justify-center gap-1.5 h-full px-3",
              "text-sm font-medium whitespace-nowrap transition-colors cursor-pointer",
              "data-[state=open]:bg-sidebar-accent/50 data-[state=open]:text-foreground",
              "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/30",
              changesView !== "changes" &&
                changesView !== "pr" &&
                changesView !== "review" &&
                "flex-1 justify-center",
            )}
          >
            <CurrentIcon className="size-3.5 shrink-0" />
            <span>{current.label}</span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
            {showUnreadDot && (
              <span className="absolute -top-0.5 right-0.5 bg-red-500 size-1.5 rounded-full" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[10rem]">
          {VIEW_OPTIONS.map((opt) => {
            const Icon = opt.Icon;
            const isActive = opt.value === changesView;
            return (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => {
                  if (!isActive) onViewChange(opt.value);
                }}
                className="flex items-center gap-2 text-xs"
              >
                <Icon className="size-3.5" />
                <span className="flex-1">{opt.label}</span>
                {isActive && <Check className="size-3.5 text-foreground" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {(() => {
        const subTabs = renderSubTabs();
        return subTabs ? (
          <>
            <div className="w-px self-stretch bg-sidebar-border shrink-0" />
            {subTabs}
          </>
        ) : null;
      })()}
    </div>
  );
};