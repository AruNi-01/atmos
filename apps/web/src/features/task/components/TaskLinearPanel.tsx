"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { Button, cn, Skeleton } from "@workspace/ui";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Link2,
  RefreshCw,
  Rocket,
} from "lucide-react";
import type { LinearIssuePayload } from "@atmos/api-types/ws/dto/linear";
import { wsLinearApi } from "@/api/ws/linear-api";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { queryKeys } from "@/api/query/query-keys";
import {
  ensureLinearLocalKeysHydrated,
  getActiveLinearLocalKey,
  getLinearAuthSelection,
  resolveLinearCredentialSource,
} from "@/features/settings/lib/linear-local-keys";
import {
  hubConfigured,
  hubLinearStatus,
  hubMe,
} from "@/api/hub-client";
import type { Project } from "@/shared/types/domain";
import { useDialogStore } from "@/app-shell/state/use-dialog-store";
import {
  openTaskWorkspaceCreate,
} from "@/features/task/lib/open-task-workspace-create";
import { useProjectStore } from "@/features/project/store/use-project-store";
import { centerStageParams } from "@/shared/lib/nuqs/searchParams";

type Preset = "active" | "backlog" | "all";

function formatShortDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PriorityMark({ priority }: { priority: number }) {
  if (!priority || priority <= 0) {
    return <span className="w-4 text-center text-muted-foreground">---</span>;
  }
  const tone =
    priority === 1
      ? "text-orange-500"
      : priority === 2
        ? "text-amber-500"
        : "text-muted-foreground";
  return <span className={cn("w-4 text-center text-xs font-semibold", tone)}>!</span>;
}

function StatusIcon({ stateType }: { stateType?: string | null }) {
  if (stateType === "completed" || stateType === "canceled") {
    return <CheckCircle2 className="size-3.5 text-emerald-500" />;
  }
  return <Circle className="size-3.5 text-muted-foreground" />;
}

function AssigneeAvatar({
  name,
  avatarUrl,
}: {
  name?: string | null;
  avatarUrl?: string | null;
}) {
  if (!name && !avatarUrl) {
    return <span className="size-5 shrink-0 rounded-full bg-muted" aria-hidden />;
  }
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name ?? ""}
        title={name ?? undefined}
        className="size-5 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      title={name ?? undefined}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
    >
      {(name ?? "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

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

function firstGithubIssuePayload(issue: LinearIssuePayload) {
  const ref = (issue.github_refs ?? []).find((r) => r.kind === "issue" || r.kind === "pull");
  if (!ref) return null;
  return {
    owner: ref.owner,
    repo: ref.repo,
    number: ref.number,
    title: issue.title,
    body: issue.description ?? null,
    url: ref.url,
    state: "open",
    comments_count: 0,
    labels: (issue.labels ?? []).map((l) => ({
      name: l.name,
      color: l.color ?? null,
      description: null,
    })),
    assignees: [],
  };
}

type TaskLinearPanelProps = {
  projects: Project[];
  headerTrailingHost?: HTMLDivElement | null;
};

export function TaskLinearPanel({ projects, headerTrailingHost: _host }: TaskLinearPanelProps) {
  const t = useTranslations("appShell.task");
  const scope = useComputerQueryScope();
  const selectedProjectId = useDialogStore((s) => s.selectedProjectId);
  // Match TaskGithubPanel: open Welcome/create overlay via center-stage query param.
  const [, setNewWorkspace] = useQueryState(
    "newWorkspace",
    centerStageParams.newWorkspace,
  );
  const addWorkspace = useProjectStore((s) => s.addWorkspace);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const [preset, setPreset] = useState<Preset>("all");
  const [teamId, setTeamId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const defaultAtmosProjectId = useMemo(() => {
    if (selectedProjectId && projects.some((p) => p.id === selectedProjectId)) {
      return selectedProjectId;
    }
    return projects[0]?.id ?? "";
  }, [projects, selectedProjectId]);

  const [atmosProjectId, setAtmosProjectId] = useState(defaultAtmosProjectId);
  React.useEffect(() => {
    if (!atmosProjectId && defaultAtmosProjectId) {
      setAtmosProjectId(defaultAtmosProjectId);
    }
  }, [atmosProjectId, defaultAtmosProjectId]);

  const [keysEpoch, setKeysEpoch] = useState(0);
  React.useEffect(() => {
    void ensureLinearLocalKeysHydrated().then(() => setKeysEpoch((n) => n + 1));
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
      if (selection.mode === "local" && activeLocal?.api_key) {
        return wsLinearApi.status({ linearApiKey: activeLocal.api_key });
      }
      // OAuth / default: Hub status when possible.
      if (hubReady && selection.mode !== "local") {
        try {
          const me = await hubMe();
          if (!me) {
            return { connected: false, needs_hub_login: true };
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
    staleTime: 30_000,
  });

  const oauthConnected =
    selection.mode !== "local" && Boolean(statusQuery.data?.connected);
  const source = resolveLinearCredentialSource({
    selection,
    oauthConnected: Boolean(
      selection.mode === "oauth"
        ? statusQuery.data?.connected
        : selection.mode !== "local" && statusQuery.data?.connected,
    ),
    hasLocalKey: Boolean(activeLocal),
  });
  const connected = source === "oauth" || source === "local";

  const filterOptionsQuery = useQuery({
    queryKey: [...queryKeys.computer.root(scope), "linear", "filters"] as const,
    queryFn: () => wsLinearApi.filterOptions(),
    enabled: connected,
    staleTime: 60_000,
  });

  const listQuery = useQuery({
    queryKey: [
      ...queryKeys.computer.root(scope),
      "linear",
      "issues",
      preset,
      teamId,
      projectId,
      query,
    ] as const,
    queryFn: () =>
      wsLinearApi.issueList({
        preset,
        team_id: teamId || undefined,
        project_id: projectId || undefined,
        query: query.trim() || undefined,
        first: 50,
      }),
    enabled: connected,
    staleTime: 15_000,
  });

  const issues: LinearIssuePayload[] = listQuery.data?.issues ?? [];

  const refresh = useCallback(() => {
    void statusQuery.refetch();
    void listQuery.refetch();
    void filterOptionsQuery.refetch();
  }, [statusQuery, listQuery, filterOptionsQuery]);

  /** Create Atmos workspace from Linear issue, then store association (M9/M10). */
  const createWorkspaceFromIssue = useCallback(
    async (issue: LinearIssuePayload) => {
      const projectGuid = atmosProjectId || defaultAtmosProjectId;
      if (!projectGuid) {
        setActionError(t("linear.needProject"));
        return;
      }
      setBusyId(issue.id);
      setActionError(null);
      try {
        const displayName = `${issue.identifier} ${issue.title}`.trim().slice(0, 120);
        const githubIssue = firstGithubIssuePayload(issue);
        const workspaceId = await addWorkspace({
          projectId: projectGuid,
          name: "",
          displayName,
          branch: "",
          initialRequirement: issue.description ?? null,
          githubIssue,
          autoExtractTodos: Boolean(issue.description || githubIssue),
        });
        await wsLinearApi.linkIssue(workspaceId, issueToWire(issue));
        await fetchProjects();
        refresh();
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : t("linear.createFailed"),
        );
      } finally {
        setBusyId(null);
      }
    },
    [
      addWorkspace,
      atmosProjectId,
      defaultAtmosProjectId,
      fetchProjects,
      refresh,
      t,
    ],
  );

  /** Link issue to an existing workspace via create dialog prefill (GitHub-style open). */
  const openCreateDialog = useCallback(
    (issue: LinearIssuePayload) => {
      const projectGuid = atmosProjectId || defaultAtmosProjectId;
      const gh = (issue.github_refs ?? [])[0];
      if (gh) {
        openTaskWorkspaceCreate({
          projectId: projectGuid,
          link: {
            kind: gh.kind === "pull" ? "pr" : "issue",
            owner: gh.owner,
            repo: gh.repo,
            number: gh.number,
            title: issue.title,
            url: gh.url,
          },
          setNewWorkspace: (v) => {
            // After dialog create, link Linear issue (pending in sessionStorage).
            if (v) {
              try {
                sessionStorage.setItem(
                  "atmos.pendingLinearLink",
                  JSON.stringify(issueToWire(issue)),
                );
              } catch {
                /* ignore */
              }
            }
            void setNewWorkspace(v);
          },
        });
        return;
      }
      // No GitHub twin — create workspace directly and link Linear.
      void createWorkspaceFromIssue(issue);
    },
    [
      atmosProjectId,
      createWorkspaceFromIssue,
      defaultAtmosProjectId,
      setNewWorkspace,
    ],
  );

  /** Explicit link to currently selected project’s latest workspace is out of scope;
   * multi-link via create path stores association. Also expose link to open dialog. */
  const linkOnlyViaCreate = openCreateDialog;

  if (statusQuery.isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const needsHubLogin =
    Boolean(statusQuery.data?.needs_hub_login) && selection.mode !== "local";

  if (needsHubLogin || !connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {needsHubLogin ? t("linear.signInRequired") : t("linear.notConnected")}
        </p>
        <p className="text-xs text-muted-foreground">
          {needsHubLogin ? t("linear.signInHint") : t("linear.connectHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
        <span className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-foreground">
          {source === "local"
            ? t("linear.chip.localApiKey")
            : t("linear.chip.oauthAccount")}
        </span>
        {(["active", "backlog", "all"] as const).map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={preset === p ? "secondary" : "ghost"}
            className="h-7"
            onClick={() => setPreset(p)}
          >
            {t(`linear.presets.${p}`)}
          </Button>
        ))}
        <select
          className="h-7 rounded-md border bg-background px-2 text-xs"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          <option value="">{t("linear.filters.allTeams")}</option>
          {(filterOptionsQuery.data?.teams ?? []).map((team) => (
            <option key={team.id} value={team.id}>
              {team.key} · {team.name}
            </option>
          ))}
        </select>
        <select
          className="h-7 rounded-md border bg-background px-2 text-xs"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">{t("linear.filters.allProjects")}</option>
          {(filterOptionsQuery.data?.projects ?? []).map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <select
          className="h-7 max-w-[10rem] rounded-md border bg-background px-2 text-xs"
          value={atmosProjectId || defaultAtmosProjectId}
          onChange={(e) => setAtmosProjectId(e.target.value)}
          title={t("linear.filters.atmosProject")}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          className="h-7 min-w-[10rem] flex-1 rounded-md border bg-background px-2 text-xs"
          placeholder={t("linear.filters.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          onClick={refresh}
          disabled={listQuery.isFetching}
        >
          <RefreshCw className={cn("size-3.5", listQuery.isFetching && "animate-spin")} />
          {t("linear.refresh")}
        </Button>
      </div>

      {actionError ? (
        <p className="border-b px-4 py-2 text-xs text-destructive">{actionError}</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {listQuery.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : listQuery.isError ? (
          <p className="p-4 text-sm text-destructive">{t("linear.loadError")}</p>
        ) : issues.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{t("linear.empty")}</p>
        ) : (
          <ul className="divide-y">
            {issues.map((issue) => (
              <li
                key={issue.id}
                className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/40"
              >
                <PriorityMark priority={issue.priority} />
                <span className="w-16 shrink-0 tabular-nums text-xs text-muted-foreground">
                  {issue.identifier}
                </span>
                <StatusIcon stateType={issue.state_type} />
                <span className="min-w-0 flex-1 truncate font-medium">{issue.title}</span>
                <div className="hidden max-w-[28%] shrink-0 flex-wrap items-center justify-end gap-1 md:flex">
                  {issue.labels?.slice(0, 3).map((label) => (
                    <span
                      key={label.name}
                      className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {label.name}
                    </span>
                  ))}
                  {issue.project_name ? (
                    <span className="rounded-full border px-1.5 py-0.5 text-[10px]">
                      {issue.project_name}
                    </span>
                  ) : null}
                  {issue.github_refs?.slice(0, 2).map((ref) => (
                    <a
                      key={ref.url}
                      href={ref.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      #{ref.number}
                    </a>
                  ))}
                </div>
                <AssigneeAvatar
                  name={issue.assignee?.name}
                  avatarUrl={issue.assignee?.avatar_url}
                />
                <span className="hidden w-14 shrink-0 text-right text-[11px] text-muted-foreground sm:block">
                  {formatShortDate(issue.created_at)}
                </span>
                <span className="hidden w-14 shrink-0 text-right text-[11px] text-muted-foreground sm:block">
                  {formatShortDate(issue.updated_at)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2 text-[11px]"
                  disabled={busyId === issue.id}
                  onClick={() => void createWorkspaceFromIssue(issue)}
                  title={t("linear.createWorkspace")}
                >
                  <Rocket className="size-3.5" />
                  <span className="hidden sm:inline">{t("linear.create")}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-1.5"
                  disabled={busyId === issue.id}
                  onClick={() => linkOnlyViaCreate(issue)}
                  title={t("linear.linkOrCreate")}
                >
                  <Link2 className="size-3.5" />
                </Button>
                <a
                  href={issue.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  title={t("linear.openInLinear")}
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
