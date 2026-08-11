"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useQueryState, useQueryStates } from "nuqs";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TabsSubtle,
  TabsSubtleItem,
  cn,
} from "@workspace/ui";
import {
  ArrowUpDown,
  CircleDot,
  GitPullRequest,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type { Project } from "@/shared/types/domain";
import {
  type GithubLinkedRefPayload,
  type GithubSearchItemPayload,
  wsGithubApi,
} from "@/api/ws/github-api";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { queryKeys } from "@/api/query/query-keys";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import {
  githubRepoAssigneesQueryOptions,
  githubRepoLabelsQueryOptions,
} from "@/features/github/lib/github-query-options";
import { GithubListPagination } from "@/features/github/components/GithubListPagination";
import {
  TaskGithubFilterMenu,
  type TaskGithubFilters,
  type TaskGithubStateFilter,
} from "@/features/task/components/TaskGithubFilterMenu";
import { TaskGithubTable } from "@/features/task/components/TaskGithubTable";
import { TaskGithubCreateIssueDialog } from "@/features/task/components/TaskGithubCreateIssueDialog";
import {
  useProjectGithubRepos,
  type ProjectGithubRepo,
} from "@/features/task/hooks/use-project-github-repos";
import {
  TaskGithubDrawerHost,
  type TaskGithubDrawerController,
} from "@/features/task/components/task-github-drawer/TaskGithubDrawerHost";
import {
  issueDrawerKey,
  prDrawerKey,
} from "@/features/task/components/task-github-drawer/types";
import { openTaskWorkspaceCreate } from "@/features/task/lib/open-task-workspace-create";
import {
  TASK_GITHUB_PAGE_SIZE,
  TASK_GITHUB_SORT_OPTIONS,
  filtersFromUrl,
  type TaskGithubKind,
} from "@/features/task/lib/task-github-panel-model";
import { findLinkedWorkspaceForGithubItem } from "@/features/task/lib/find-linked-workspace";
import {
  applyManagedToQuery,
  applySortToQuery,
  managedFiltersEqual,
  parseManagedFromQuery,
  parseSortFromQuery,
} from "@/features/task/lib/task-github-query-sync";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import {
  centerStageParams,
  taskParams,
  type TaskGithubSortParam,
} from "@/shared/lib/nuqs/searchParams";

type TaskGithubPanelProps = {
  projects: Project[];
  /**
   * Host for + / refresh in the stable Task source header (parent Tabs row).
   * When set, actions are portaled there so they sit next to Atmos/GitHub tabs.
   */
  headerTrailingHost?: HTMLElement | null;
};

export function TaskGithubPanel({ projects, headerTrailingHost = null }: TaskGithubPanelProps) {
  const t = useTranslations("appShell.task.github");
  const router = useAppRouter();
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const drawerControllerRef = React.useRef<TaskGithubDrawerController | null>(null);
  const [, setNewWorkspace] = useQueryState("newWorkspace", centerStageParams.newWorkspace);
  const [createIssueOpen, setCreateIssueOpen] = useState(false);
  const [createIssueProjectId, setCreateIssueProjectId] = useState<string | null>(null);
  const [createProjectPickerOpen, setCreateProjectPickerOpen] = useState(false);

  const [urlState, setUrlState] = useQueryStates({
    taskGhKind: taskParams.taskGhKind,
    taskGhState: taskParams.taskGhState,
    taskGhRepos: taskParams.taskGhRepos,
    taskGhAssignees: taskParams.taskGhAssignees,
    taskGhLabels: taskParams.taskGhLabels,
    taskGhQ: taskParams.taskGhQ,
    taskGhPage: taskParams.taskGhPage,
    taskGhSort: taskParams.taskGhSort,
  });

  const kind = urlState.taskGhKind as TaskGithubKind;
  const page = Math.max(1, urlState.taskGhPage || 1);
  const sort = urlState.taskGhSort;
  const filters = useMemo(
    () =>
      filtersFromUrl({
        taskGhState: urlState.taskGhState,
        taskGhRepos: urlState.taskGhRepos,
        taskGhAssignees: urlState.taskGhAssignees,
        taskGhLabels: urlState.taskGhLabels,
      }),
    [
      urlState.taskGhAssignees,
      urlState.taskGhLabels,
      urlState.taskGhRepos,
      urlState.taskGhState,
    ],
  );

  /** Committed query applied to the API (URL-backed). */
  const queryApplied = urlState.taskGhQ;
  /** Search box text — local while typing, hydrated from URL. */
  const [queryDraft, setQueryDraft] = useState(queryApplied);
  /** Avoid filter→query→filter feedback loops. */
  const syncLockRef = React.useRef<"filters" | "query" | null>(null);

  useEffect(() => {
    setQueryDraft(queryApplied);
  }, [queryApplied]);

  const setKind = useCallback(
    (next: TaskGithubKind) => {
      void setUrlState({ taskGhKind: next, taskGhPage: 1 });
    },
    [setUrlState],
  );

  const setPage = useCallback(
    (next: number) => {
      void setUrlState({ taskGhPage: Math.max(1, next) });
    },
    [setUrlState],
  );

  const setSort = useCallback(
    (next: TaskGithubSortParam) => {
      // Keep `sort:` visible in the search box (same string the API uses).
      const nextQ = applySortToQuery(queryDraft, next);
      setQueryDraft(nextQ);
      void setUrlState({ taskGhSort: next, taskGhQ: nextQ, taskGhPage: 1 });
    },
    [queryDraft, setUrlState],
  );

  const writeFilters = useCallback(
    (next: TaskGithubFilters, query?: string, nextSort?: TaskGithubSortParam) => {
      void setUrlState({
        taskGhState: next.state,
        taskGhRepos: next.repoFullNames,
        taskGhAssignees: next.assignees,
        taskGhLabels: next.labels,
        ...(query !== undefined ? { taskGhQ: query } : null),
        ...(nextSort !== undefined ? { taskGhSort: nextSort } : null),
        taskGhPage: 1,
      });
    },
    [setUrlState],
  );

  const { repos, loading: reposLoading } = useProjectGithubRepos(projects, true);

  const activeRepos = useMemo(() => {
    if (filters.repoFullNames.length === 0) return repos;
    const selected = new Set(filters.repoFullNames);
    return repos.filter((repo) => selected.has(repo.fullName));
  }, [filters.repoFullNames, repos]);

  const repoByFullName = useMemo(() => {
    const map = new Map<string, ProjectGithubRepo>();
    for (const repo of repos) map.set(repo.fullName, repo);
    return map;
  }, [repos]);

  const searchRepos = useMemo(
    () => activeRepos.map((r) => ({ owner: r.owner, repo: r.repo })),
    [activeRepos],
  );

  const searchEnabled = searchRepos.length > 0;

  // Ensure committed query always carries managed filters + sort: (box + API).
  // Matches commitQuery / clearQuery so first paint does not omit default `is:open`.
  const apiQuery = useMemo(
    () =>
      applySortToQuery(
        applyManagedToQuery(queryApplied, {
          state: filters.state,
          assignees: filters.assignees,
          labels: filters.labels,
        }),
        sort,
      ),
    [filters.assignees, filters.labels, filters.state, queryApplied, sort],
  );

  // Hydrate incomplete box on first open / URL filter changes so the search
  // string mirrors structured filters (is:open by default) + sort:.
  // Previously only sort: was written; is:open appeared only after focus+blur.
  useEffect(() => {
    const normalized = applySortToQuery(
      applyManagedToQuery(queryApplied, {
        state: filters.state,
        assignees: filters.assignees,
        labels: filters.labels,
      }),
      sort,
    );
    if (normalized === queryApplied) return;
    setQueryDraft(normalized);
    void setUrlState({ taskGhQ: normalized });
  }, [
    filters.assignees,
    filters.labels,
    filters.state,
    queryApplied,
    setUrlState,
    sort,
  ]);

  const searchQuery = useQuery(
    wsQueryOptions({
      scope,
      connectionState,
      queryKey: queryKeys.computer.githubSearch(scope, {
        kind: kind === "issues" ? "issue" : "pr",
        repos: searchRepos.map((r) => `${r.owner}/${r.repo}`).sort().join(","),
        state: filters.state,
        assignees: [...filters.assignees].sort().join(","),
        labels: [...filters.labels].sort().join(","),
        query: apiQuery,
        page,
        perPage: TASK_GITHUB_PAGE_SIZE,
      }),
      queryFn: () =>
        wsGithubApi.search({
          kind: kind === "issues" ? "issue" : "pr",
          repos: searchRepos,
          state: filters.state,
          assignees: filters.assignees,
          labels: filters.labels,
          query: apiQuery || null,
          page,
          perPage: TASK_GITHUB_PAGE_SIZE,
        }),
      // Keep last Issues/PRs page warm when switching kind or leaving the Task tab.
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      enabled: searchEnabled,
    }),
  );

  const items = searchQuery.data?.items ?? [];
  const hasMore = Boolean(searchQuery.data?.has_more);
  // Prefer cached data: only full-page loading when there is nothing to show yet.
  const loading =
    (reposLoading && repos.length === 0) ||
    (searchEnabled && searchQuery.isLoading && !searchQuery.data);
  const refreshing =
    searchEnabled &&
    searchQuery.isFetching &&
    Boolean(searchQuery.data);

  const handleRefresh = useCallback(() => {
    void searchQuery.refetch();
  }, [searchQuery]);

  const handleIssueCreated = useCallback(
    (result: { owner: string; repo: string; number?: number | null; url: string }) => {
      void searchQuery.refetch();
      // Open the new issue in the task drawer when we have a number.
      if (result.number != null) {
        const projectId =
          repoByFullName.get(`${result.owner}/${result.repo}`)?.projectId ?? null;
        drawerControllerRef.current?.openIssue({
          kind: "issue",
          key: issueDrawerKey(result.owner, result.repo, result.number),
          owner: result.owner,
          repo: result.repo,
          issueNumber: result.number,
          projectId,
        });
      }
    },
    [repoByFullName, searchQuery],
  );

  const assigneeQueries = useQueries({
    queries: activeRepos.map((repo) =>
      githubRepoAssigneesQueryOptions(
        scope,
        connectionState,
        { owner: repo.owner, repo: repo.repo },
        { enabled: searchEnabled },
      ),
    ),
  });

  const labelQueries = useQueries({
    queries: activeRepos.map((repo) =>
      githubRepoLabelsQueryOptions(
        scope,
        connectionState,
        { owner: repo.owner, repo: repo.repo },
        { enabled: searchEnabled },
      ),
    ),
  });

  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const query of assigneeQueries) {
      for (const assignee of query.data ?? []) {
        if (assignee.login) set.add(assignee.login);
      }
    }
    for (const login of filters.assignees) set.add(login);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [assigneeQueries, filters.assignees]);

  const labelOptions = useMemo(() => {
    const map = new Map<string, { name: string; color?: string | null }>();
    for (const query of labelQueries) {
      for (const label of query.data ?? []) {
        if (label.name && !map.has(label.name)) {
          map.set(label.name, { name: label.name, color: label.color });
        }
      }
    }
    for (const name of filters.labels) {
      if (!map.has(name)) map.set(name, { name, color: null });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filters.labels, labelQueries]);

  /** Structured filters → search box (repos never written into the query). */
  const handleFiltersChange = useCallback(
    (next: TaskGithubFilters) => {
      const managedChanged = !managedFiltersEqual(
        {
          state: filters.state,
          assignees: filters.assignees,
          labels: filters.labels,
        },
        {
          state: next.state,
          assignees: next.assignees,
          labels: next.labels,
        },
      );
      if (!managedChanged) {
        // Repo-only change — keep query text, reset page.
        writeFilters(next);
        return;
      }
      if (syncLockRef.current === "query") {
        writeFilters(next);
        return;
      }
      syncLockRef.current = "filters";
      const nextQ = applySortToQuery(
        applyManagedToQuery(queryDraft, {
          state: next.state,
          assignees: next.assignees,
          labels: next.labels,
        }),
        sort,
      );
      setQueryDraft(nextQ);
      writeFilters(next, nextQ);
      queueMicrotask(() => {
        if (syncLockRef.current === "filters") syncLockRef.current = null;
      });
    },
    [filters.assignees, filters.labels, filters.state, queryDraft, sort, writeFilters],
  );

  /** Commit search on Enter / blur only — no live request while typing. */
  const commitQuery = useCallback(() => {
    const text = queryDraft.trim();
    const parsed = parseManagedFromQuery(text);
    // Prefer explicit `is:` in the box; otherwise keep the current filter state.
    const state = parsed.stateExplicit ? parsed.state : filters.state;
    const sortFromBox = parseSortFromQuery(text);
    const nextSort = sortFromBox ?? sort;
    const normalized = applySortToQuery(
      applyManagedToQuery(text, {
        state,
        assignees: parsed.assignees,
        labels: parsed.labels,
      }),
      nextSort,
    );
    // Skip no-op commits (same applied query + same managed filters + sort).
    if (
      normalized === queryApplied &&
      nextSort === sort &&
      managedFiltersEqual(
        { state: filters.state, assignees: filters.assignees, labels: filters.labels },
        { state, assignees: parsed.assignees, labels: parsed.labels },
      )
    ) {
      if (queryDraft !== normalized) setQueryDraft(normalized);
      return;
    }
    syncLockRef.current = "filters";
    setQueryDraft(normalized);
    writeFilters(
      {
        ...filters,
        state,
        assignees: parsed.assignees,
        labels: parsed.labels,
      },
      normalized,
      nextSort,
    );
    queueMicrotask(() => {
      if (syncLockRef.current === "filters") syncLockRef.current = null;
    });
  }, [filters, queryApplied, queryDraft, sort, writeFilters]);

  const clearQuery = useCallback(() => {
    // Clear freeform + managed tokens, reset filters to open / no assignee / no label.
    // Keep the current sort in the box.
    const nextFilters: TaskGithubFilters = {
      ...filters,
      state: "open",
      assignees: [],
      labels: [],
    };
    const nextQ = applySortToQuery(
      applyManagedToQuery("", {
        state: "open",
        assignees: [],
        labels: [],
      }),
      sort,
    );
    syncLockRef.current = "filters";
    setQueryDraft(nextQ);
    writeFilters(nextFilters, nextQ);
    queueMicrotask(() => {
      if (syncLockRef.current === "filters") syncLockRef.current = null;
    });
  }, [filters, sort, writeFilters]);

  const projectIdForItem = useCallback(
    (item: GithubSearchItemPayload) =>
      repoByFullName.get(`${item.owner}/${item.repo}`)?.projectId ?? null,
    [repoByFullName],
  );

  const handleOpenLinkedRef = useCallback(
    (parent: GithubSearchItemPayload, ref: GithubLinkedRefPayload) => {
      const projectId = projectIdForItem(parent);
      const controller = drawerControllerRef.current;
      const isPr = ref.kind === "pr";
      if (!controller) {
        if (ref.url) {
          window.open(ref.url, "_blank", "noopener,noreferrer");
          return;
        }
        const path = isPr ? "pull" : "issues";
        window.open(
          `https://github.com/${parent.owner}/${parent.repo}/${path}/${ref.number}`,
          "_blank",
          "noopener,noreferrer",
        );
        return;
      }
      if (isPr) {
        controller.openPr({
          kind: "pr",
          key: prDrawerKey(parent.owner, parent.repo, ref.number),
          owner: parent.owner,
          repo: parent.repo,
          prNumber: ref.number,
          branch: "main",
          title: ref.title,
          projectId,
        });
        return;
      }
      controller.openIssue({
        kind: "issue",
        key: issueDrawerKey(parent.owner, parent.repo, ref.number),
        owner: parent.owner,
        repo: parent.repo,
        issueNumber: ref.number,
        title: ref.title,
        projectId,
      });
    },
    [projectIdForItem],
  );

  const handleOpenItem = useCallback(
    (item: GithubSearchItemPayload) => {
      const projectId = projectIdForItem(item);
      const controller = drawerControllerRef.current;
      if (!controller) {
        if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
        return;
      }
      if (kind === "issues" || item.kind === "issue") {
        controller.openIssue({
          kind: "issue",
          key: issueDrawerKey(item.owner, item.repo, item.number),
          owner: item.owner,
          repo: item.repo,
          issueNumber: item.number,
          title: item.title,
          projectId,
        });
        return;
      }
      controller.openPr({
        kind: "pr",
        key: prDrawerKey(item.owner, item.repo, item.number),
        owner: item.owner,
        repo: item.repo,
        prNumber: item.number,
        branch: item.head_ref ?? item.base_ref ?? "main",
        title: item.title,
        projectId,
      });
    },
    [kind, projectIdForItem],
  );

  const resolveLinkedWorkspace = useCallback(
    (item: GithubSearchItemPayload) => {
      const isIssue = kind === "issues" || item.kind === "issue";
      return findLinkedWorkspaceForGithubItem(projects, {
        kind: isIssue ? "issue" : "pr",
        owner: item.owner,
        repo: item.repo,
        number: item.number,
        headRef: item.head_ref,
        projectId: projectIdForItem(item),
      });
    },
    [kind, projectIdForItem, projects],
  );

  const handleEnterWorkspace = useCallback(
    (workspaceId: string) => {
      router.push(`/workspace?id=${workspaceId}`);
    },
    [router],
  );

  const handleCreateWorkspace = useCallback(
    (item: GithubSearchItemPayload) => {
      // Prefer enter when already linked (table should call enter, but guard anyway).
      const linked = resolveLinkedWorkspace(item);
      if (linked) {
        handleEnterWorkspace(linked.workspace.id);
        return;
      }
      const projectId = projectIdForItem(item);
      const labelDraft = (item.labels ?? []).map((l) => ({
        name: l.name,
        color: l.color,
      }));
      if (kind === "issues" || item.kind === "issue") {
        openTaskWorkspaceCreate({
          projectId,
          setNewWorkspace,
          displayName: item.title?.trim()
            ? `[issue#${item.number}] ${item.title.trim()}`.slice(0, 120)
            : `[issue#${item.number}]`,
          // Keep composer empty — do not paste issue body into the prompt.
          initialRequirement: null,
          link: {
            kind: "issue",
            owner: item.owner,
            repo: item.repo,
            number: item.number,
            title: item.title,
            url: item.url,
            body: item.body,
            state: item.state,
            labels: labelDraft,
          },
        });
        return;
      }
      openTaskWorkspaceCreate({
        projectId,
        setNewWorkspace,
        displayName: item.title?.trim()
          ? `[PR#${item.number}] ${item.title.trim()}`.slice(0, 120)
          : `[PR#${item.number}]`,
        // Keep composer empty — do not paste PR body into the prompt.
        initialRequirement: null,
        link: {
          kind: "pr",
          owner: item.owner,
          repo: item.repo,
          number: item.number,
          title: item.title,
          url: item.url,
          head_ref: item.head_ref,
          base_ref: item.base_ref,
          body: item.body,
          state: item.state,
          is_draft: item.is_draft,
          labels: labelDraft,
        },
      });
    },
    [
      handleEnterWorkspace,
      kind,
      projectIdForItem,
      resolveLinkedWorkspace,
      setNewWorkspace,
    ],
  );

  const openCreateIssueForProject = useCallback((projectId: string) => {
    setCreateIssueProjectId(projectId);
    setCreateProjectPickerOpen(false);
    setCreateIssueOpen(true);
  }, []);

  const headerActions = (
    <div className="flex h-7 items-center gap-1.5">
      <Button
        type="button"
        size="icon-xs"
        variant="outline"
        className="size-7 sm:size-7"
        onClick={handleRefresh}
        disabled={!searchEnabled || refreshing}
        title={kind === "issues" ? t("actions.refreshIssues") : t("actions.refreshPrs")}
        aria-label={kind === "issues" ? t("actions.refreshIssues") : t("actions.refreshPrs")}
      >
        <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
      </Button>
      <Popover open={createProjectPickerOpen} onOpenChange={setCreateProjectPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            className="size-7 sm:size-7"
            disabled={repos.length === 0}
            title={t("actions.createIssue")}
            aria-label={t("actions.createIssue")}
          >
            <Plus className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0" sideOffset={6}>
          <Command>
            <CommandInput
              placeholder={t("createIssue.projectSelect.search")}
              className="h-8 text-xs"
            />
            <CommandList>
              <CommandEmpty className="py-4 text-xs">
                {repos.length === 0
                  ? t("createIssue.projectSelect.empty")
                  : t("createIssue.projectSelect.noMatch")}
              </CommandEmpty>
              <CommandGroup
                heading={t("createIssue.projectSelect.title")}
                className="max-h-64 overflow-y-auto p-1"
              >
                {repos.map((repo) => (
                  <CommandItem
                    key={repo.projectId}
                    value={`${repo.projectName} ${repo.fullName} ${repo.path}`}
                    onSelect={() => openCreateIssueForProject(repo.projectId)}
                    className="flex flex-col items-start gap-0.5 px-2 py-2 text-xs"
                  >
                    <span className="w-full truncate font-medium text-foreground">
                      {repo.projectName}
                    </span>
                    <span className="w-full truncate text-[11px] text-muted-foreground">
                      {repo.fullName}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );

  const portaledHeaderActions =
    headerTrailingHost != null ? createPortal(headerActions, headerTrailingHost) : null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
      {portaledHeaderActions}
      {/*
        Fixed shell: filters + pagination stay pinned; only the table body scrolls.
        Outer page must not scroll (overflow-hidden on this tree).
        Source Atmos/GitHub tabs live on TaskManagementView so the coss Indicator animates.
      */}
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden px-6 py-3">
        {/* Issues/PRs · search · Filter · Sort — fixed toolbar */}
        <div className="flex min-w-0 shrink-0 items-center gap-2 pb-2">
          <div className="min-w-0 shrink-0">
            <TabsSubtle
              idPrefix="task-github-kind"
              activeLabel
              selectedIndex={kind === "issues" ? 0 : 1}
              onSelect={(index) => setKind(index === 0 ? "issues" : "prs")}
            >
              <TabsSubtleItem index={0} icon={CircleDot} label={t("tabs.issues")} />
              <TabsSubtleItem index={1} icon={GitPullRequest} label={t("tabs.pullRequests")} />
            </TabsSubtle>
          </div>

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
              placeholder={t("search.placeholder")}
              aria-label={t("search.label")}
              className="h-8 border-border/70 bg-background pl-8 pr-8 font-mono text-[12px] shadow-none"
            />
            {queryDraft || queryApplied ? (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={clearQuery}
                title={t("search.clear")}
                aria-label={t("search.clear")}
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <TaskGithubFilterMenu
              repos={repos}
              filters={filters}
              onFiltersChange={handleFiltersChange}
              assigneeOptions={assigneeOptions}
              labelOptions={labelOptions}
            />
            <Select
              value={sort}
              onValueChange={(value) => {
                if (value) setSort(value as TaskGithubSortParam);
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-8 w-auto max-w-[11rem] gap-1 border-border/70 px-2 text-[11px] font-medium shadow-none"
                aria-label={t("sort.label")}
              >
                <ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end" className="min-w-[12rem]">
                {TASK_GITHUB_SORT_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value} className="text-xs">
                    {t(`sort.options.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table shell always mounts; loading / empty live inside the body. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <TaskGithubTable
              items={items}
              kind={kind}
              bodyState={
                (reposLoading && repos.length === 0) ||
                (loading && items.length === 0)
                  ? "loading"
                  : repos.length === 0
                    ? "empty"
                    : items.length === 0
                      ? "empty"
                      : "ready"
              }
              bodyMessage={
                repos.length === 0 && !reposLoading
                  ? t("empty.noRepos")
                  : kind === "issues"
                    ? t("empty.noIssues")
                    : t("empty.noPrs")
              }
              onOpenItem={handleOpenItem}
              onOpenLinkedRef={handleOpenLinkedRef}
              onCreateWorkspace={handleCreateWorkspace}
              onEnterWorkspace={handleEnterWorkspace}
              resolveLinkedWorkspace={resolveLinkedWorkspace}
            />
          </div>

          {/* Pagination fixed at bottom of the shell (outside table scroll) */}
          <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 pt-2">
            <p className="min-w-0 flex-1 text-[10px] leading-snug text-muted-foreground">
              {t("pagination.aggregatedHint", {
                repos: activeRepos.length,
                count: searchQuery.data?.total_count ?? items.length,
                sort: t(`sort.options.${sort}`),
              })}
            </p>
            {page > 1 || hasMore ? (
              <GithubListPagination
                page={page}
                hasMore={hasMore}
                onPageChange={setPage}
                previousLabel={t("pagination.previous")}
                nextLabel={t("pagination.next")}
                layout="full"
                className="mt-0 w-auto justify-end pb-0"
              />
            ) : null}
          </div>
        </div>
      </div>

      <TaskGithubDrawerHost controllerRef={drawerControllerRef} />

      <TaskGithubCreateIssueDialog
        open={createIssueOpen}
        onOpenChange={setCreateIssueOpen}
        repos={repos}
        initialProjectId={createIssueProjectId}
        onCreated={handleIssueCreated}
      />
    </div>
  );
}
