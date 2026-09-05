"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  cn,
  FilePlus2,
  getFileIconProps,
  GitCommit,
  GitGraph,
  Input,
  Search,
} from "@workspace/ui";
import { CenterExplorerToggle } from "@/app-shell/CenterExplorerToggle";
import {
  CENTER_EXPLORER_COMMIT_LIMIT,
  filterExplorerSearchEntries,
  flattenFileTreeEntries,
  pathHasHiddenSegment,
  relativeParentPath,
} from "@/app-shell/center-explorer-landing";
import {
  CENTER_EXPLORER_BODY_INSET_CLASS,
  type CenterExplorerKind,
} from "@/app-shell/center-explorer-layout";
import { activateCenterChromeTab } from "@/app-shell/center-stage-activate";
import { useFileTreeQuery } from "@/features/files/hooks/use-file-tree-query";
import { useFileTreeStore } from "@/features/files/store/use-file-tree-store";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useOpenGitHistoryCenterTab } from "@/features/git/hooks/use-open-git-history-center-tab";
import { useGitLog } from "@/features/github/hooks/use-github";
import {
  setCenterExplorerCollapsed,
  useCenterFileRecents,
} from "@/shared/stores/use-ui-pref-hooks";

const LANDING_ROW_CLASS =
  "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent/50";

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
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  onSelect: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={LANDING_ROW_CLASS}
      data-center-explorer-row={testId}
      onClick={onSelect}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 max-w-[70%] shrink-0 truncate text-sm text-foreground">
        {title}
      </span>
      {meta ? (
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </button>
  );
}

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
        className="flex h-8 shrink-0 items-center justify-end border-b border-border bg-background/50 px-2.5 backdrop-blur-sm"
      >
        <CenterExplorerToggle kind={kind} className={toolbarIconBtnClass} />
      </div>
      <div
        className={cn(
          "flex min-h-0 flex-1 justify-center overflow-y-auto px-6 py-10",
          CENTER_EXPLORER_BODY_INSET_CLASS,
        )}
      >
        <div className="my-auto flex w-full max-w-md flex-col gap-3">{children}</div>
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
  const [query, setQuery] = React.useState("");
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

  const openPath = React.useCallback(
    (path: string) => {
      void useEditorStore.getState().openFile(path, contextId, { preview: false });
      activateCenterChromeTab(contextId, path, { placement: "focused" });
    },
    [contextId],
  );

  const revealFolder = React.useCallback(
    (path: string) => {
      if (pathHasHiddenSegment(path)) {
        useFileTreeStore.getState().setShowHidden(true);
      }
      setCenterExplorerCollapsed("files", false);
      useEditorStore.getState().requestFileTreeReveal(path, contextId);
    },
    [contextId],
  );

  const handleNewFile = React.useCallback(() => {
    const path = useEditorStore.getState().openUntitledMarkdown(contextId);
    if (path) activateCenterChromeTab(contextId, path, { placement: "focused" });
  }, [contextId]);

  return (
    <ExplorerLandingShell kind="files" className={className}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          data-center-explorer-search=""
          className="h-10 rounded-full bg-background pr-4 pl-9 shadow-none"
        />
      </div>

      <ExplorerLandingRow
        testId="new-file"
        icon={<FilePlus2 className="size-4" />}
        title={t("newFile")}
        onSelect={handleNewFile}
      />

      {needle ? (
        <div className="flex flex-col">
          {searchEntries.length === 0 && !fileTreeQuery.isLoading ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {t("noSearchResults")}
            </p>
          ) : (
            searchEntries.map((entry) => (
              <ExplorerLandingRow
                key={entry.path}
                testId={entry.isDir ? "search-dir" : "search-file"}
                icon={<FileTypeIcon name={entry.name} isDir={entry.isDir} />}
                title={entry.name}
                meta={relativeParentPath(entry.path, rootPath)}
                onSelect={() =>
                  entry.isDir ? revealFolder(entry.path) : openPath(entry.path)
                }
              />
            ))
          )}
        </div>
      ) : recents.length > 0 ? (
        <div className="flex flex-col">
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
  repoPath,
  className,
}: {
  repoPath: string | null;
  className?: string;
}) {
  const t = useTranslations("appShell.centerExplorer");
  const { openGitHistoryTab } = useOpenGitHistoryCenterTab();
  const gitLog = useGitLog({
    repoPath,
    limit: CENTER_EXPLORER_COMMIT_LIMIT,
  });
  const commits = gitLog.commits.slice(0, CENTER_EXPLORER_COMMIT_LIMIT);

  return (
    <ExplorerLandingShell kind="changes" className={className}>
      <ExplorerLandingRow
        testId="graph-history"
        icon={<GitGraph className="size-4" />}
        title={t("graphHistory")}
        onSelect={() => openGitHistoryTab()}
      />

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
              onSelect={() => openGitHistoryTab(commit.hash)}
            />
          ))}
        </div>
      ) : null}
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
        contextId={contextId}
        rootPath={rootPath}
        className={className}
      />
    );
  }
  return <ChangesExplorerLanding repoPath={repoPath} className={className} />;
}
