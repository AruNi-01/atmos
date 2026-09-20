"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  cn,
  FilePlus2,
  getFileIconProps,
  GitBranch,
  GitCommit,
  GitGraph,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  FileDiff,
  MorphingSearch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type MorphingSearchItem,
} from "@workspace/ui";
import { CenterExplorerToggle } from "@/app-shell/CenterExplorerToggle";
import {
  CENTER_EXPLORER_COMMIT_LIMIT,
  filterExplorerSearchEntries,
  flattenFileTreeEntries,
  pathHasHiddenSegment,
  readFilesLandingSearch,
  relativeParentPath,
  writeFilesLandingSearch,
} from "@/app-shell/center-explorer-landing";
import {
  CENTER_EXPLORER_BODY_INSET_CLASS,
  type CenterExplorerKind,
} from "@/app-shell/center-explorer-layout";
import { activateCenterChromeTab } from "@/app-shell/center-stage-activate";
import {
  CHANGES_TAB_VALUE,
  FILES_TAB_VALUE,
  useToolCenterTabsStore,
} from "@/app-shell/center-tool-tabs";
import type { GitChangedFile } from "@/api/ws-api";
import { buildDiffGroupPath } from "@/features/diff/lib/diff-editor-paths";
import { useFileTreeQuery } from "@/features/files/hooks/use-file-tree-query";
import { useFileTreeStore } from "@/features/files/store/use-file-tree-store";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import {
  computeCompareParams,
  selectCompareChangedFiles,
  EMPTY_CHANGED_FILES,
  GIT_WORKTREE_PARAMS,
} from "@/features/git/lib/git-query-options";
import { useGitChangedFilesQuery } from "@/features/git/hooks/use-git-changed-files-query";
import { useGitStatusQuery } from "@/features/git/hooks/use-git-status-query";
import { useOpenGitHistoryCenterTab } from "@/features/git/hooks/use-open-git-history-center-tab";
import { useChangesScopeBridge } from "@/features/git/store/use-changes-scope-bridge";
import { useGitLog, useGithubPRList } from "@/features/github/hooks/use-github";
import { useOpenGithubCenterTab } from "@/features/github/hooks/use-open-github-center-tab";
import {
  setCenterExplorerCollapsed,
  useCenterFileRecents,
} from "@/shared/stores/use-ui-pref-hooks";

const LANDING_ROW_CLASS =
  "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent/50";

function sumChangeCounts(files: GitChangedFile[]) {
  return files.reduce(
    (totals, file) => ({
      additions: totals.additions + file.additions,
      deletions: totals.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
}

function FileTypeIcon({
  name,
  isDir,
}: {
  name: string;
  isDir: boolean;
}) {
  const iconProps = getFileIconProps({ name, isDir, className: "size-4" });
  // eslint-disable-next-line @next/next/no-img-element -- file icons are tiny decorative assets from the UI package.
  return <img {...iconProps} alt="" />;
}

function ExplorerLandingRow({
  icon,
  title,
  meta,
  onSelect,
  testId,
  titleClassName,
  tooltip,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  onSelect: () => void;
  testId?: string;
  titleClassName?: string;
  tooltip?: string;
}) {
  const row = (
    <button
      type="button"
      className={LANDING_ROW_CLASS}
      data-center-explorer-row={testId}
      onClick={onSelect}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span
        className={cn(
          "min-w-0 max-w-[70%] shrink-0 truncate text-sm text-foreground",
          titleClassName,
        )}
      >
        {title}
      </span>
      {meta ? (
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </button>
  );

  if (!tooltip) return row;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-md break-all text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function ChangeStatusRow({
  icon,
  label,
  additions,
  deletions,
  testId,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  additions: number;
  deletions: number;
  testId: string;
  onSelect: () => void;
}) {
  if (additions <= 0 && deletions <= 0) return null;
  return (
    <button
      type="button"
      data-center-explorer-change-status={testId}
      className={LANDING_ROW_CLASS}
      onClick={onSelect}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {label}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-medium tabular-nums">
        {additions > 0 ? (
          <span className="text-emerald-500">+{additions}</span>
        ) : null}
        {deletions > 0 ? (
          <span className="text-red-500">-{deletions}</span>
        ) : null}
      </span>
    </button>
  );
}

function prStateIcon(state: string | undefined, isDraft?: boolean) {
  const normalized = String(state ?? "open").toLowerCase();
  if (normalized === "merged") {
    return <GitMerge className="size-4 text-purple-500" />;
  }
  if (normalized === "closed") {
    return <GitPullRequestClosed className="size-4 text-red-500" />;
  }
  if (isDraft) {
    return <GitPullRequest className="size-4 text-muted-foreground" />;
  }
  return <GitPullRequest className="size-4 text-emerald-500" />;
}

/**
 * Shared Files/Changes empty-state shell. Content sits in the upper third of
 * the panel (not vertically centered) so primary actions stay near the top.
 */
function ExplorerLandingShell({
  kind,
  className,
  children,
}: {
  kind: CenterExplorerKind;
  className?: string;
  children: React.ReactNode;
}) {
  const toolbarIconBtnClass =
    "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer select-none";

  return (
    <div
      data-center-explorer-landing={kind}
      className={cn(
        "pointer-events-auto flex h-full min-h-0 flex-col bg-background",
        className,
      )}
    >
      <div
        data-center-explorer-chrome=""
        className="flex h-8 shrink-0 items-center justify-end bg-background/50 px-2.5 backdrop-blur-sm"
      >
        <CenterExplorerToggle
          kind={kind}
          foldScopeId={kind === "changes" ? CHANGES_TAB_VALUE : undefined}
          className={toolbarIconBtnClass}
        />
      </div>
      <div
        className={cn(
          "flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 pt-[min(18vh,7.5rem)] pb-10",
          CENTER_EXPLORER_BODY_INSET_CLASS,
        )}
      >
        <div className="flex w-full max-w-md flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}

function FilesExplorerLanding({
  contextId,
  rootPath,
  className,
}: {
  contextId: string;
  rootPath: string | null;
  className?: string;
}) {
  const t = useTranslations("appShell.centerExplorer");
  const recents = useCenterFileRecents(contextId);
  const initialSearch = readFilesLandingSearch(contextId);
  const [query, setQuery] = React.useState(initialSearch.query);
  const [searchOpen, setSearchOpen] = React.useState(initialSearch.open);
  const needle = query.trim();
  const fileTreeQuery = useFileTreeQuery(needle ? rootPath : null, true);
  const searchEntries = React.useMemo(
    () =>
      filterExplorerSearchEntries(
        flattenFileTreeEntries(fileTreeQuery.data?.tree),
        needle,
      ),
    [fileTreeQuery.data?.tree, needle],
  );

  React.useEffect(() => {
    writeFilesLandingSearch(contextId, { query, open: searchOpen });
  }, [contextId, query, searchOpen]);

  const handleSearchOpenChange = React.useCallback((open: boolean) => {
    setSearchOpen(open);
  }, []);

  const openPath = React.useCallback(
    (path: string) => {
      // Dismiss overlay first so keep-alive + portal cannot leave the landing
      // surface active while the editor attaches.
      setSearchOpen(false);
      writeFilesLandingSearch(contextId, { query, open: false });
      // Replace the Files empty landing in-place: open as preview, activate the
      // file, then close the Files tool tab so reconcile does not stack both.
      void useEditorStore.getState().openFile(path, contextId, { preview: true });
      activateCenterChromeTab(contextId, path, { placement: "focused" });
      useToolCenterTabsStore.getState().close(contextId, FILES_TAB_VALUE);
    },
    [contextId, query],
  );

  const revealFolder = React.useCallback(
    (path: string) => {
      setSearchOpen(false);
      writeFilesLandingSearch(contextId, { query, open: false });
      if (pathHasHiddenSegment(path)) {
        useFileTreeStore.getState().setShowHidden(true);
      }
      setCenterExplorerCollapsed("files", false);
      useEditorStore.getState().requestFileTreeReveal(path, contextId);
    },
    [contextId, query],
  );

  const handleNewFile = React.useCallback(() => {
    const path = useEditorStore.getState().openUntitledMarkdown(contextId);
    if (path) activateCenterChromeTab(contextId, path, { placement: "focused" });
  }, [contextId]);

  const searchItems = React.useMemo<MorphingSearchItem[]>(
    () =>
      searchEntries.map((entry) => ({
        id: entry.path,
        title: entry.name,
        description: relativeParentPath(entry.path, rootPath) || undefined,
        keywords: [entry.path, entry.name],
        leading: <FileTypeIcon name={entry.name} isDir={entry.isDir} />,
        onSelect: () =>
          entry.isDir ? revealFolder(entry.path) : openPath(entry.path),
      })),
    [openPath, revealFolder, rootPath, searchEntries],
  );

  return (
    <ExplorerLandingShell kind="files" className={className}>
      <div data-center-explorer-search="" className="w-full">
        <MorphingSearch
          items={searchItems}
          placeholder={t("searchPlaceholder")}
          emptyMessage={
            fileTreeQuery.isLoading && needle
              ? t("searching")
              : needle
                ? t("noSearchResults")
                : t("searchHint")
          }
          shortcut=""
          open={searchOpen}
          defaultOpen={initialSearch.open}
          defaultQuery={initialSearch.query}
          closeOnSelect
          clearOnSelect={false}
          onOpenChange={handleSearchOpenChange}
          onQueryChange={setQuery}
          className="h-10 w-full"
        />
      </div>

      <ExplorerLandingRow
        testId="new-file"
        icon={<FilePlus2 className="size-4" />}
        title={t("newFile")}
        onSelect={handleNewFile}
      />

      {recents.length > 0 ? (
        <div className="flex flex-col" data-center-explorer-recents="">
          <div className="px-2 pb-1 text-xs text-muted-foreground">{t("recents")}</div>
          {recents.map((item) => (
            <ExplorerLandingRow
              key={item.path}
              testId="recent-file"
              icon={<FileTypeIcon name={item.name} isDir={false} />}
              title={item.name}
              meta={relativeParentPath(item.path, rootPath)}
              onSelect={() => openPath(item.path)}
            />
          ))}
        </div>
      ) : null}
    </ExplorerLandingShell>
  );
}

function ChangesExplorerLanding({
  contextId,
  repoPath,
  className,
}: {
  contextId: string;
  repoPath: string | null;
  className?: string;
}) {
  const t = useTranslations("appShell.centerExplorer");
  const tChanges = useTranslations("AppShell.chrome.changes");
  const { openGitHistoryTab } = useOpenGitHistoryCenterTab();
  const { openPullRequestTab } = useOpenGithubCenterTab();
  const requestChangesScope = useChangesScopeBridge((s) => s.requestScope);
  const requestCommitScope = useChangesScopeBridge((s) => s.requestCommitScope);
  const gitLog = useGitLog({
    repoPath,
    limit: CENTER_EXPLORER_COMMIT_LIMIT,
  });
  const commits = gitLog.commits.slice(0, CENTER_EXPLORER_COMMIT_LIMIT);

  const statusQuery = useGitStatusQuery(repoPath);
  const defaultBranch = statusQuery.data?.default_branch ?? null;
  const currentBranch = statusQuery.data?.current_branch ?? null;
  const githubOwner = statusQuery.data?.github_owner ?? null;
  const githubRepo = statusQuery.data?.github_repo ?? null;

  const worktreeQuery = useGitChangedFilesQuery(repoPath, GIT_WORKTREE_PARAMS);
  const branchQuery = useGitChangedFilesQuery(
    repoPath,
    computeCompareParams("branch", defaultBranch, null),
  );

  const stagedFiles = worktreeQuery.data?.staged_files ?? EMPTY_CHANGED_FILES;
  const unstagedFiles = worktreeQuery.data?.unstaged_files ?? EMPTY_CHANGED_FILES;
  const untrackedFiles = worktreeQuery.data?.untracked_files ?? EMPTY_CHANGED_FILES;
  const { files: branchFiles } = selectCompareChangedFiles(branchQuery.data);

  const changeStatusRows = React.useMemo(() => {
    const rows: Array<{
      key: "branch" | "staged" | "unstaged";
      label: string;
      icon: React.ReactNode;
      additions: number;
      deletions: number;
    }> = [];

    const branchStats = sumChangeCounts(branchFiles);
    if (branchStats.additions > 0 || branchStats.deletions > 0) {
      rows.push({
        key: "branch",
        label: tChanges("branchChanges"),
        icon: <GitBranch className="size-4" />,
        ...branchStats,
      });
    }

    const stagedStats = sumChangeCounts(stagedFiles);
    if (stagedStats.additions > 0 || stagedStats.deletions > 0) {
      rows.push({
        key: "staged",
        label: tChanges("stagedChanges"),
        icon: <FileDiff className="size-4" />,
        ...stagedStats,
      });
    }

    const unstagedStats = sumChangeCounts([
      ...unstagedFiles,
      ...untrackedFiles,
    ]);
    if (unstagedStats.additions > 0 || unstagedStats.deletions > 0) {
      rows.push({
        key: "unstaged",
        label: tChanges("unstagedChanges"),
        icon: <FileDiff className="size-4" />,
        ...unstagedStats,
      });
    }

    return rows;
  }, [
    branchFiles,
    stagedFiles,
    tChanges,
    unstagedFiles,
    untrackedFiles,
  ]);

  const { data: prListData } = useGithubPRList({
    owner: githubOwner ?? undefined,
    repo: githubRepo ?? undefined,
    branch: currentBranch ?? undefined,
    state: "all",
    enabled: Boolean(githubOwner && githubRepo && currentBranch),
  });

  const linkedPrs = React.useMemo(() => {
    if (!Array.isArray(prListData) || !currentBranch) return [];
    return prListData
      .filter((pr) => {
        const head =
          typeof pr.headRefName === "string"
            ? pr.headRefName
            : typeof (pr as { head_ref?: string }).head_ref === "string"
              ? (pr as { head_ref?: string }).head_ref
              : "";
        return head === currentBranch;
      })
      .slice(0, 8);
  }, [currentBranch, prListData]);

  const openChangeStatus = React.useCallback(
    (scope: "branch" | "staged" | "unstaged") => {
      const groupPath = buildDiffGroupPath(scope);
      requestChangesScope(scope);
      setCenterExplorerCollapsed("changes", false, groupPath);
      void useEditorStore.getState().openFile(groupPath, contextId, {
        preview: false,
      });
      activateCenterChromeTab(contextId, groupPath, { placement: "focused" });
    },
    [contextId, requestChangesScope],
  );

  const openRecentCommit = React.useCallback(
    (commitHash: string) => {
      const groupPath = buildDiffGroupPath("commit");
      requestCommitScope(commitHash);
      setCenterExplorerCollapsed("changes", false, groupPath);
      void useEditorStore.getState().openFile(groupPath, contextId, {
        preview: false,
      });
      activateCenterChromeTab(contextId, groupPath, { placement: "focused" });
    },
    [contextId, requestCommitScope],
  );

  return (
    <ExplorerLandingShell kind="changes" className={className}>
      {changeStatusRows.length > 0 ? (
        <div
          data-center-explorer-change-status-list=""
          className="flex flex-col"
        >
          {changeStatusRows.map((row) => (
            <ChangeStatusRow
              key={row.key}
              testId={row.key}
              icon={row.icon}
              label={row.label}
              additions={row.additions}
              deletions={row.deletions}
              onSelect={() => openChangeStatus(row.key)}
            />
          ))}
        </div>
      ) : null}

      {linkedPrs.length > 0 && githubOwner && githubRepo && currentBranch ? (
        <div className="flex flex-col" data-center-explorer-pr-list="">
          <div className="px-2 pb-1 text-xs text-muted-foreground">
            {t("pullRequests")}
          </div>
          {linkedPrs.map((pr) => {
            const number = Number(pr.number);
            const title = String(pr.title ?? "").trim();
            return (
              <ExplorerLandingRow
                key={number}
                testId="linked-pr"
                icon={prStateIcon(
                  typeof pr.state === "string" ? pr.state : undefined,
                  Boolean(pr.isDraft),
                )}
                title={t("pullRequestNumber", { number })}
                titleClassName="max-w-[30%] font-medium"
                meta={title}
                onSelect={() =>
                  openPullRequestTab({
                    owner: githubOwner,
                    repo: githubRepo,
                    branch: currentBranch,
                    prNumber: number,
                    title,
                    contextId,
                  })
                }
              />
            );
          })}
        </div>
      ) : null}

      {commits.length > 0 ? (
        <div className="flex flex-col">
          <div className="px-2 pb-1 text-xs text-muted-foreground">
            {t("recentCommits")}
          </div>
          {commits.map((commit) => (
            <ExplorerLandingRow
              key={commit.hash}
              testId="recent-commit"
              icon={<GitCommit className="size-4" />}
              title={commit.subject}
              meta={commit.short_hash}
              tooltip={`${commit.short_hash}  ${commit.subject}`}
              onSelect={() => openRecentCommit(commit.hash)}
            />
          ))}
        </div>
      ) : null}

      <ExplorerLandingRow
        testId="graph-history"
        icon={<GitGraph className="size-4" />}
        title={t("graphHistory")}
        onSelect={() => openGitHistoryTab()}
      />
    </ExplorerLandingShell>
  );
}

export function CenterExplorerLanding({
  kind,
  contextId,
  rootPath = null,
  repoPath = null,
  className,
}: {
  kind: CenterExplorerKind;
  contextId: string;
  rootPath?: string | null;
  repoPath?: string | null;
  className?: string;
}) {
  if (kind === "files") {
    return (
      <FilesExplorerLanding
        key={contextId}
        contextId={contextId}
        rootPath={rootPath}
        className={className}
      />
    );
  }
  return (
    <ChangesExplorerLanding
      contextId={contextId}
      repoPath={repoPath}
      className={className}
    />
  );
}
