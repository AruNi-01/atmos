"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { Button, Input, cn } from "@workspace/ui";
import { LinearIcon } from "@workspace/ui/components/icons/linear-icon";
import { Loader2, RefreshCw, Search, Settings2, X } from "lucide-react";
import type { LinearIssuePayload } from "@atmos/api-types/ws/dto/linear";
import { wsLinearApi } from "@/api/ws/linear-api";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { queryKeys } from "@/api/query/query-keys";
import {
  ensureLinearLocalKeysHydrated,
  getActiveLinearLocalKey,
  getLinearAuthSelection,
  resolveLinearCredentialSource,
  selectLinearOauth,
} from "@/features/settings/lib/linear-local-keys";
import {
  hubConfigured,
  hubLinearStatus,
  hubMe,
} from "@/api/hub-client";
import { settingsModalParams, centerStageParams } from "@/shared/lib/nuqs/searchParams";
import { GithubListPagination } from "@/features/github/components/GithubListPagination";
import {
  DEFAULT_TASK_LINEAR_FILTERS,
  TaskLinearFilterMenu,
  type TaskLinearFilters,
} from "@/features/task/components/TaskLinearFilterMenu";
import { TaskLinearTable } from "@/features/task/components/TaskLinearTable";
import {
  TaskLinearDrawer,
  type TaskLinearDrawerController,
} from "@/features/task/components/TaskLinearDrawer";
import {
  TaskGithubDrawerHost,
  type TaskGithubDrawerController,
} from "@/features/task/components/task-github-drawer/TaskGithubDrawerHost";
import {
  issueDrawerKey,
  prDrawerKey,
} from "@/features/task/components/task-github-drawer/types";
import { openTaskWorkspaceCreate } from "@/features/task/lib/open-task-workspace-create";
import { findLinkedWorkspaceForLinearIssue } from "@/features/task/lib/find-linked-workspace";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import type { LinearGithubRefPayload } from "@atmos/api-types/ws/dto/linear";

const PAGE_SIZE = 20;

function issueToWire(issue: LinearIssuePayload) {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    description: issue.description ?? null,
    priority: issue.priority ?? 0,
    state_name: issue.state_name ?? null,
    state_type: issue.state_type ?? null,
    project_name: issue.project_name ?? null,
    project_id: issue.project_id ?? null,
    team_id: issue.team_id ?? null,
    team_key: issue.team_key ?? null,
    labels: issue.labels ?? [],
    assignee: issue.assignee ?? null,
    github_refs: issue.github_refs ?? [],
    created_at: issue.created_at ?? null,
    updated_at: issue.updated_at ?? null,
  };
}

type TaskLinearPanelProps = {
  /**
   * Host for auth chip + refresh in the stable Task source header (parent Tabs row).
   * When set, actions are portaled there so they sit next to Atmos/GitHub/Linear tabs.
   */
  headerTrailingHost?: HTMLElement | null;
};

export function TaskLinearPanel({
  headerTrailingHost = null,
}: TaskLinearPanelProps) {
  const t = useTranslations("appShell.task");
  const router = useAppRouter();
  const projects = useProjects();
  const scope = useComputerQueryScope();
  const drawerControllerRef = React.useRef<TaskLinearDrawerController | null>(
    null,
  );
  const githubDrawerControllerRef =
    React.useRef<TaskGithubDrawerController | null>(null);
  const [, setNewWorkspace] = useQueryState(
    "newWorkspace",
    centerStageParams.newWorkspace,
  );
  const [isSettingsOpen, setIsSettingsOpen] = useQueryState(
    "settingsModal",
    settingsModalParams.settingsModal,
  );
  const [, setActiveSettingTab] = useQueryState(
    "activeSettingTab",
    settingsModalParams.activeSettingTab,
  );

  const openLinearIntegrations = useCallback(() => {
    void setActiveSettingTab("integrations");
    void setIsSettingsOpen(true);
  }, [setActiveSettingTab, setIsSettingsOpen]);

  const openAccountSettings = useCallback(() => {
    void setActiveSettingTab("account");
    void setIsSettingsOpen(true);
  }, [setActiveSettingTab, setIsSettingsOpen]);

  // Linear issues are not bound to an Atmos project — do not preselect one for Create.
  const [filters, setFilters] = useState<TaskLinearFilters>(() => ({
    ...DEFAULT_TASK_LINEAR_FILTERS,
  }));

  /** Committed search query applied to the API. */
  const [queryApplied, setQueryApplied] = useState("");
  /** Search box text — local while typing. */
  const [queryDraft, setQueryDraft] = useState("");

  /** Cursor-based paging: after-cursor keyed by page number (≥ 2). */
  const [page, setPage] = useState(1);
  const [afterByPage, setAfterByPage] = useState<Record<number, string>>({});

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [keysEpoch, setKeysEpoch] = useState(0);
  /** Until local keys hydrate, selection is still the empty default — do not flash empty/connect UI. */
  const [keysReady, setKeysReady] = useState(false);
  useEffect(() => {
    void ensureLinearLocalKeysHydrated().then(() => {
      setKeysEpoch((n) => n + 1);
      setKeysReady(true);
    });
  }, []);
  const selection = getLinearAuthSelection();
  const activeLocal = getActiveLinearLocalKey();
  const hubReady = hubConfigured();

  const statusQuery = useQuery({
    queryKey: [
      ...queryKeys.computer.root(scope),
      "linear",
      "status",
      selection.mode,
      activeLocal?.id ?? null,
      hubReady,
      keysEpoch,
    ] as const,
    queryFn: async () => {
      await ensureLinearLocalKeysHydrated();
      const sel = getLinearAuthSelection();
      const local = getActiveLinearLocalKey();
      // Local API key path: no Hub / Atmos login required.
      if (sel.mode !== "oauth" && local?.api_key?.trim()) {
        return wsLinearApi.status({ linearApiKey: local.api_key });
      }
      // OAuth path (explicit) or optional Hub probe when no local key.
      if (hubReady) {
        try {
          const me = await hubMe();
          if (!me) {
            return {
              connected: false,
              needs_hub_login: sel.mode === "oauth",
            };
          }
          const hub = await hubLinearStatus();
          return {
            connected: hub.connected,
            auth_method: hub.auth_method ?? "oauth",
            viewer_name: hub.viewer_name ?? null,
            viewer_email: hub.viewer_email ?? null,
            needs_hub_login: false,
          };
        } catch {
          /* fall through */
        }
      }
      return wsLinearApi.status({ linearApiKey: null });
    },
    // Wait for credential cache so the first status request uses real selection.
    // OAuth completes in another tab; refetch when the Task view is focused again.
    enabled: keysReady,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  // Cross-device: Hub OAuth follows Atmos user_id. On a fresh machine selection is
  // "none" — adopt OAuth when Hub already has it and no local API key is active.
  useEffect(() => {
    if (!keysReady) return;
    if (!statusQuery.data?.connected) return;
    if (statusQuery.data.auth_method && statusQuery.data.auth_method !== "oauth") {
      return;
    }
    const sel = getLinearAuthSelection();
    if (sel.mode === "oauth" || sel.mode === "local") return;
    if (getActiveLinearLocalKey()) return;
    void selectLinearOauth().then(() => setKeysEpoch((n) => n + 1));
  }, [keysReady, statusQuery.data?.connected, statusQuery.data?.auth_method]);

  // After Settings → Integrations / Account, re-check credentials once the modal closes.
  const settingsOpenRef = React.useRef(isSettingsOpen);
  useEffect(() => {
    const wasOpen = settingsOpenRef.current;
    settingsOpenRef.current = isSettingsOpen;
    if (wasOpen && !isSettingsOpen) {
      void ensureLinearLocalKeysHydrated().then(() => {
        setKeysEpoch((n) => n + 1);
      });
    }
  }, [isSettingsOpen]);

  const usedLocalCredential =
    selection.mode !== "oauth" && Boolean(activeLocal?.api_key);
  const source = resolveLinearCredentialSource({
    selection,
    oauthConnected:
      !usedLocalCredential && Boolean(statusQuery.data?.connected),
    hasLocalKey: Boolean(activeLocal),
  });
  const connected = source === "oauth" || source === "local";

  /** Auth path still resolving — never show "not connected" / empty list yet. */
  const authLoading =
    !keysReady ||
    statusQuery.isPending ||
    statusQuery.isLoading ||
    (statusQuery.isFetching && statusQuery.data === undefined);

  const filterOptionsQuery = useQuery({
    queryKey: [...queryKeys.computer.root(scope), "linear", "filters"] as const,
    queryFn: () => wsLinearApi.filterOptions(),
    enabled: connected && !authLoading,
    staleTime: 60_000,
  });

  const after = page <= 1 ? undefined : afterByPage[page];

  const listQuery = useQuery({
    queryKey: [
      ...queryKeys.computer.root(scope),
      "linear",
      "issues",
      filters.preset,
      filters.stateTypes.join(","),
      filters.assigneeIds.join(","),
      filters.labelIds.join(","),
      filters.teamId,
      filters.projectId,
      queryApplied,
      page,
      after ?? null,
      PAGE_SIZE,
    ] as const,
    queryFn: () =>
      wsLinearApi.issueList({
        preset: filters.preset,
        team_id: filters.teamId || undefined,
        project_id: filters.projectId || undefined,
        state_types:
          filters.stateTypes.length > 0 ? [...filters.stateTypes] : undefined,
        assignee_ids:
          filters.assigneeIds.length > 0 ? [...filters.assigneeIds] : undefined,
        label_ids:
          filters.labelIds.length > 0 ? [...filters.labelIds] : undefined,
        query: queryApplied.trim() || undefined,
        first: PAGE_SIZE,
        after,
      }),
    // Cursor pages need an `after` token; never fetch page N>1 without one.
    enabled: connected && !authLoading && (page <= 1 || Boolean(after)),
    staleTime: 15_000,
  });

  // Remember end_cursor so "next page" can request with `after`.
  useEffect(() => {
    const end = listQuery.data?.end_cursor;
    if (!end || !listQuery.data?.has_next_page) return;
    setAfterByPage((prev) => {
      if (prev[page + 1] === end) return prev;
      return { ...prev, [page + 1]: end };
    });
  }, [listQuery.data?.end_cursor, listQuery.data?.has_next_page, page]);

  const issues: LinearIssuePayload[] = listQuery.data?.issues ?? [];
  const hasMore = Boolean(listQuery.data?.has_next_page);
  const refreshing = listQuery.isFetching || listQuery.isRefetching;
  /** Issue list not ready yet — prefer loading over empty. */
  const listLoading =
    connected &&
    !authLoading &&
    (listQuery.isPending ||
      listQuery.isLoading ||
      (listQuery.isFetching && issues.length === 0));

  const resetPaging = useCallback(() => {
    setPage(1);
    setAfterByPage({});
  }, []);

  const handleFiltersChange = useCallback(
    (next: TaskLinearFilters) => {
      setFilters(next);
      resetPaging();
    },
    [resetPaging],
  );

  const commitQuery = useCallback(() => {
    const next = queryDraft.trim();
    if (next === queryApplied) {
      if (queryDraft !== next) setQueryDraft(next);
      return;
    }
    setQueryApplied(next);
    setQueryDraft(next);
    resetPaging();
  }, [queryApplied, queryDraft, resetPaging]);

  const clearQuery = useCallback(() => {
    setQueryDraft("");
    if (queryApplied) {
      setQueryApplied("");
      resetPaging();
    }
  }, [queryApplied, resetPaging]);

  const handlePageChange = useCallback(
    (next: number) => {
      const target = Math.max(1, next);
      if (target === page) return;

      // Previous pages re-use stored cursors.
      if (target < page) {
        setPage(target);
        return;
      }

      // Only advance one step at a time (cursor pagination).
      if (target !== page + 1 || !hasMore) return;

      const endCursor = listQuery.data?.end_cursor;
      if (!endCursor && !afterByPage[target]) return;

      if (endCursor) {
        setAfterByPage((prev) =>
          prev[target] === endCursor ? prev : { ...prev, [target]: endCursor },
        );
      }
      setPage(target);
    },
    [afterByPage, hasMore, listQuery.data?.end_cursor, page],
  );

  const refresh = useCallback(() => {
    void statusQuery.refetch();
    void listQuery.refetch();
    void filterOptionsQuery.refetch();
  }, [statusQuery, listQuery, filterOptionsQuery]);

  /**
   * Open New Workspace overlay with Linear (and optional linked GitHub) prefills.
   * Do not preselect Atmos project — Linear issues are not bound to a local project.
   * Association is written after submit via `atmos.pendingLinearLink`.
   * autoExtractTodos stays off by default in the overlay.
   */
  const openCreateFromIssue = useCallback(
    (issue: LinearIssuePayload) => {
      setActionError(null);
      const linked = findLinkedWorkspaceForLinearIssue(projects, issue.id);
      if (linked) {
        router.push(`/workspace?id=${linked.workspace.id}`);
        return;
      }
      const gh = (issue.github_refs ?? []).find(
        (r) => r.kind === "issue" || r.kind === "pull",
      );
      openTaskWorkspaceCreate({
        requireProjectPick: true,
        displayName: `${issue.identifier} ${issue.title}`.trim().slice(0, 120),
        // Keep composer empty — do not paste Linear description into the prompt.
        initialRequirement: null,
        linearIssue: issueToWire(issue),
        link: gh
          ? {
              kind: gh.kind === "pull" ? "pr" : "issue",
              owner: gh.owner,
              repo: gh.repo,
              number: gh.number,
              title: issue.title,
              url: gh.url,
            }
          : null,
        setNewWorkspace: (v) => {
          void setNewWorkspace(v);
        },
      });
    },
    [projects, router, setNewWorkspace],
  );

  const handleOpenIssue = useCallback((issue: LinearIssuePayload) => {
    drawerControllerRef.current?.openIssue(issue);
  }, []);

  const handleEnterWorkspace = useCallback(
    (workspaceId: string) => {
      router.push(`/workspace?id=${workspaceId}`);
    },
    [router],
  );

  const resolveLinkedWorkspaceId = useCallback(
    (issue: LinearIssuePayload) =>
      findLinkedWorkspaceForLinearIssue(projects, issue.id)?.workspace.id ??
      null,
    [projects],
  );

  /** Open linked GitHub issue/PR in Atmos Task drawer (same as GitHub tab). */
  const handleOpenGithubRef = useCallback((ref: LinearGithubRefPayload) => {
    const controller = githubDrawerControllerRef.current;
    const isPr = ref.kind === "pull" || ref.kind === "pr";
    if (!controller) {
      if (ref.url) window.open(ref.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (isPr) {
      controller.openPr({
        kind: "pr",
        key: prDrawerKey(ref.owner, ref.repo, ref.number),
        owner: ref.owner,
        repo: ref.repo,
        prNumber: ref.number,
        branch: "main",
        title: null,
      });
      return;
    }
    controller.openIssue({
      kind: "issue",
      key: issueDrawerKey(ref.owner, ref.repo, ref.number),
      owner: ref.owner,
      repo: ref.repo,
      issueNumber: ref.number,
      title: null,
    });
  }, []);

  const headerActions = (
    <div className="flex h-7 items-center gap-1.5">
      <span className="hidden h-7 items-center rounded-full border border-border bg-muted/30 px-2.5 text-[11px] font-medium text-foreground sm:inline-flex">
        {source === "local"
          ? t("linear.chip.localApiKey")
          : t("linear.chip.oauthAccount")}
      </span>
      <Button
        type="button"
        size="icon-xs"
        variant="outline"
        className="size-7 sm:size-7"
        onClick={refresh}
        disabled={!connected || refreshing}
        title={t("linear.refresh")}
        aria-label={t("linear.refresh")}
      >
        <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
      </Button>
    </div>
  );

  const portaledHeaderActions =
    headerTrailingHost != null
      ? createPortal(headerActions, headerTrailingHost)
      : null;

  // Auth probe only (local key hydrate + status) — not the issue list yet.
  if (authLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {portaledHeaderActions}
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-label={t("linear.table.loading")} />
        </div>
      </div>
    );
  }

  // Sign-in wall only for explicit OAuth; local keys never require Hub login.
  const needsHubLogin =
    Boolean(statusQuery.data?.needs_hub_login) && selection.mode === "oauth";

  if (needsHubLogin || !connected) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-5 flex size-16 items-center justify-center rounded-3xl bg-muted/20 text-muted-foreground">
          <LinearIcon className="size-8" size={32} />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          {needsHubLogin ? t("linear.signInRequired") : t("linear.notConnected")}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-pretty text-muted-foreground">
          {needsHubLogin ? t("linear.signInHint") : t("linear.connectHint")}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {needsHubLogin ? (
            <>
              <Button
                type="button"
                className="gap-1.5"
                onClick={openAccountSettings}
              >
                <Settings2 className="size-4" />
                {t("linear.openAccountSettings")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={openLinearIntegrations}
              >
                {t("linear.openIntegrations")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              className="gap-1.5"
              onClick={openLinearIntegrations}
            >
              <Settings2 className="size-4" />
              {t("linear.openIntegrations")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
      {portaledHeaderActions}

      {/*
        Fixed shell: filters + pagination stay pinned; only the table body scrolls.
        Mirrors TaskGithubPanel layout.
      */}
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden px-6 py-3">
        {/* Search · Filter — fixed toolbar */}
        <div className="flex min-w-0 shrink-0 items-center gap-2 pb-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={queryDraft}
              onChange={(e) => setQueryDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitQuery();
                }
              }}
              onBlur={() => {
                commitQuery();
              }}
              placeholder={t("linear.filters.searchPlaceholder")}
              aria-label={t("linear.filters.searchPlaceholder")}
              className="h-8 border-border/70 bg-background pl-8 pr-8 text-[12px] shadow-none"
            />
            {queryDraft || queryApplied ? (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={clearQuery}
                title={t("linear.search.clear")}
                aria-label={t("linear.search.clear")}
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <TaskLinearFilterMenu
              filters={filters}
              onFiltersChange={handleFiltersChange}
              teams={filterOptionsQuery.data?.teams ?? []}
              linearProjects={filterOptionsQuery.data?.projects ?? []}
              users={filterOptionsQuery.data?.users ?? []}
              labels={filterOptionsQuery.data?.labels ?? []}
            />
          </div>
        </div>

        {actionError ? (
          <p className="mb-2 shrink-0 text-xs text-destructive">{actionError}</p>
        ) : null}

        {/* Table shell always mounts; loading / empty / error live inside the body. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <TaskLinearTable
              issues={issues}
              busyId={busyId}
              bodyState={
                listLoading
                  ? "loading"
                  : listQuery.isError
                    ? "error"
                    : issues.length === 0
                      ? "empty"
                      : "ready"
              }
              bodyMessage={
                listQuery.isError ? t("linear.loadError") : t("linear.empty")
              }
              onOpenIssue={handleOpenIssue}
              onCreateWorkspace={openCreateFromIssue}
              onEnterWorkspace={handleEnterWorkspace}
              resolveLinkedWorkspaceId={resolveLinkedWorkspaceId}
              onOpenGithubRef={handleOpenGithubRef}
            />
          </div>

          <div className="flex min-w-0 shrink-0 items-center justify-end gap-3 pt-2">
            <GithubListPagination
              page={page}
              hasMore={hasMore}
              onPageChange={handlePageChange}
              previousLabel={t("linear.pagination.previous")}
              nextLabel={t("linear.pagination.next")}
              layout="full"
              className="mt-0 w-auto justify-end pb-0"
            />
          </div>
        </div>
      </div>

      <TaskLinearDrawer
        controllerRef={drawerControllerRef}
        onCreateWorkspace={openCreateFromIssue}
        onEnterWorkspace={handleEnterWorkspace}
        resolveLinkedWorkspaceId={resolveLinkedWorkspaceId}
        onOpenGithubRef={handleOpenGithubRef}
      />

      {/* Same in-app GitHub detail drawer as the Task GitHub tab */}
      <TaskGithubDrawerHost controllerRef={githubDrawerControllerRef} />
    </div>
  );
}
