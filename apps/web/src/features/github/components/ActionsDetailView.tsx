import React from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import {
  Skeleton,
  TabsSubtle,
  TabsSubtleItem,
} from "@workspace/ui";
import { GithubUserAvatar } from "@/features/github/components/GithubUserHoverCard";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  ChartNoAxesCombined,
  XCircle,
  Loader2,
  CheckCircle2,
  Rocket,
  Clock,
  FileWarning,
  Package,
  FileCode2,
  Download,
} from "lucide-react";
import { useGithubActionsDetail } from "@/features/github/hooks/use-github";
import { useInvalidateGithubActions } from "@/features/github/hooks/use-github-pr-query";
import {
  formatActionTimestamp,
  formatActionTimeAgo,
} from "@/features/github/lib/action-run-time";
import { cn } from "@/shared/lib/utils";
import { type ActionRun } from "./ActionsPanel";
import { useAgentFixContext } from "@/features/agent-fix/hooks/use-agent-fix-context";
import { ActionsActionBar } from "./ActionsActionBar";
import { ActionsJobsList } from "./ActionsJobsList";
import { useActionsContextHeader } from "./use-actions-context-header";
import { AgentFixButton } from "@/features/agent-fix/components/AgentFixButton";
import type { AgentFixPromptSource } from "@/features/agent-fix/types";
import { buildGithubActionsAnnotationsFixPrompt } from "@/features/github/lib/agent-fix-prompts";
import type {
  GithubActionsAnnotationPayload as ActionAnnotation,
  GithubActionsArtifactPayload as ActionArtifact,
  GithubActionsJobPayload as ActionJob,
  GithubActionsWorkflowFilePayload as ActionWorkflowFile,
} from "@atmos/api-types/ws/dto/github";

interface ActionsDetailViewProps {
  owner: string;
  repo: string;
  /** Full run object — available when opened from click, null on page refresh. */
  run: ActionRun | null;
  /** Unique run ID used to fetch detail. */
  runId: number;
  active: boolean;
  onRequestClose: () => void;
}

const ReadOnlyCodeMirror = dynamic(
  () =>
    import("@/features/editor/components/BaseCodeMirrorEditor").then(
      (mod) => mod.BaseCodeMirrorEditor,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-xl" />,
  },
);

const ActionsWorkflowGraph = dynamic(
  () =>
    import("./ActionsWorkflowGraph").then((mod) => mod.ActionsWorkflowGraph),
  {
    ssr: false,
    loading: () => <Skeleton className="h-80 w-full rounded-xl" />,
  },
);

export function ActionsDetailView({
  owner,
  repo,
  run,
  runId,
  active,
  onRequestClose,
}: ActionsDetailViewProps) {
  const t = useTranslations("github.actionsDetail");
  const agentFixContext = useAgentFixContext();
  const send = useWebSocketStore((s) => s.send);
  const invalidateActions = useInvalidateGithubActions();
  const [actionLoading, setActionLoading] = React.useState<boolean>(false);
  const [activeTab, setActiveTab] = React.useState<"summary" | "workflow">(
    "summary",
  );
  const {
    contextRef,
    handleScroll,
    handleWheelCapture,
    resetContext,
    scrollRef,
  } = useActionsContextHeader();

  const effectiveRunId = runId ?? run?.databaseId;
  const { data: detail, loading: detailLoading } = useGithubActionsDetail(
    owner,
    repo,
    active ? effectiveRunId : undefined,
  );
  const jobs = React.useMemo(
    () => (Array.isArray(detail?.jobs) ? (detail.jobs as ActionJob[]) : []),
    [detail],
  );
  const annotations = React.useMemo(
    () =>
      Array.isArray(detail?.annotations)
        ? (detail.annotations as ActionAnnotation[])
        : [],
    [detail],
  );
  const artifacts = React.useMemo(
    () =>
      Array.isArray(detail?.artifacts)
        ? (detail.artifacts as ActionArtifact[])
        : [],
    [detail],
  );
  const workflowFile = detail?.workflow_file as ActionWorkflowFile | undefined;

  React.useEffect(() => {
    resetContext();
  }, [effectiveRunId, resetContext]);

  // Merge list/PR stub `run` with detail payload. Opening from PR checks only has
  // runId + partial metadata; github_actions_detail fills event/branch/title.
  // Prefer non-empty detail fields so stubs do not block the fetched header.
  const effectiveRun: ActionRun | null = React.useMemo(() => {
    const pick = (...values: Array<string | null | undefined>) => {
      for (const value of values) {
        if (typeof value === "string" && value.trim().length > 0) return value;
      }
      return "";
    };

    const fromDetail = detail
      ? {
          databaseId: detail.databaseId ?? detail.id ?? effectiveRunId ?? 0,
          workflowName: pick(
            detail.workflowName,
            detail.workflow_name,
            detail.name,
          ),
          displayTitle: pick(
            detail.displayTitle,
            detail.display_title,
            detail.name,
          ),
          status: pick(detail.status),
          conclusion: detail.conclusion ?? "",
          createdAt: pick(
            detail.createdAt,
            detail.created_at,
            detail.run_started_at,
          ),
          url: pick(detail.url, detail.html_url),
          event: pick(detail.event),
          headBranch: pick(detail.headBranch, detail.head_branch),
          headSha: pick(detail.headSha, detail.head_sha),
        }
      : null;

    if (!run && !fromDetail) return null;
    if (!run) return fromDetail;
    if (!fromDetail) return run;

    return {
      databaseId: fromDetail.databaseId || run.databaseId,
      workflowName: pick(fromDetail.workflowName, run.workflowName),
      // Prefer API display title (PR subject) over stub job name from checks.
      displayTitle: pick(fromDetail.displayTitle, run.displayTitle),
      status: pick(fromDetail.status, run.status),
      conclusion: fromDetail.conclusion || run.conclusion,
      createdAt: pick(fromDetail.createdAt, run.createdAt),
      url: pick(fromDetail.url, run.url),
      event: pick(fromDetail.event, run.event),
      headBranch: pick(fromDetail.headBranch, run.headBranch),
      headSha: pick(fromDetail.headSha, run.headSha),
    };
  }, [detail, effectiveRunId, run]);

  const handleRerunAll = async () => {
    if (!effectiveRun) return;
    setActionLoading(true);
    try {
      await send("github_actions_rerun", {
        owner,
        repo,
        run_id: effectiveRun.databaseId,
        failed_only: false,
      });
      // Invalidate both detail and list (since we don't have branch here, we just pass runId which invalidates detail)
      // The list polling should catch the change, or we invalidate the whole repo actions
      invalidateActions({ owner, repo, runId: effectiveRun.databaseId });
      invalidateActions({ owner, repo, branch: effectiveRun.headBranch });
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
      onRequestClose();
    }
  };

  const handleRerunFailed = async () => {
    if (!effectiveRun) return;
    setActionLoading(true);
    try {
      await send("github_actions_rerun", {
        owner,
        repo,
        run_id: effectiveRun.databaseId,
        failed_only: true,
      });
      invalidateActions({ owner, repo, runId: effectiveRun.databaseId });
      invalidateActions({ owner, repo, branch: effectiveRun.headBranch });
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
      onRequestClose();
    }
  };

  const handleNativeOpen = () => {
    if (!effectiveRun) return;
    window.open(effectiveRun.url, "_blank");
  };

  // Still loading initial data on refresh — keep the center panel stable.
  if (!effectiveRun) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin opacity-50" />
          <span className="text-xs">{t("loading.body")}</span>
        </div>
      </div>
    );
  }

  const isSuccess = effectiveRun.conclusion === "success";
  const isFailure = effectiveRun.conclusion === "failure";
  const isCompleted = effectiveRun.status === "completed";
  const createdAtTimestamp = formatActionTimestamp(effectiveRun.createdAt);
  const createdAtTimeAgo = formatActionTimeAgo(effectiveRun.createdAt);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="mx-auto w-full max-w-2xl shrink-0 px-6">
        <header className="relative flex shrink-0 flex-row items-center gap-3 pb-4 pt-6">
          <WorkflowIcon className="size-4.5 text-muted-foreground/60" />
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="whitespace-nowrap text-base font-bold">
              {t("title", { runId: effectiveRun.databaseId })}
            </h2>
            <span className="select-none font-light text-muted-foreground/30">
              |
            </span>
            <p
              className="truncate pt-0.5 text-[11px] font-medium text-muted-foreground/60"
              title={`${owner}/${repo}`}
            >
              {owner}/{repo}
            </p>
          </div>
        </header>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 w-full overflow-y-auto no-scrollbar"
        onScroll={handleScroll}
        onWheelCapture={handleWheelCapture}
      >
        <div className="relative mx-auto w-full max-w-2xl px-6 pb-16">
          <div className="flex flex-col text-sm relative">
            <div
              ref={contextRef}
              className="sticky top-0 z-30 transform-gpu bg-background/98 pb-2 pt-1 backdrop-blur-md transition-transform duration-200 ease-out will-change-transform"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">
                  {effectiveRun.displayTitle}
                </h3>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1.5 bg-muted/50 px-1.5 py-0.5 rounded-md border border-border/50 shadow-sm shrink-0">
                  <Rocket className="size-3.5" />
                  <span className="font-semibold text-foreground/90">
                    {effectiveRun.workflowName || (detailLoading ? "…" : "—")}
                  </span>
                </div>
                <span>{t("metadata.triggeredVia")}</span>
                {detailLoading && !effectiveRun.event ? (
                  <Skeleton className="mr-1 h-5 w-20 rounded bg-muted-foreground/20" />
                ) : effectiveRun.event ? (
                  <span className="bg-primary/10 text-primary px-1.5 py-px rounded font-mono truncate shadow-sm capitalize mr-1">
                    {effectiveRun.event}
                  </span>
                ) : (
                  <span className="mr-1 text-muted-foreground/50">—</span>
                )}

                {detailLoading && !detail?.actor && (
                  <div className="flex items-center gap-1.5 mr-1 bg-muted/20 px-1.5 py-1 rounded-md border border-border/30">
                    <Skeleton className="size-3.5 rounded-full bg-muted-foreground/20" />
                    <Skeleton className="h-3 w-16 bg-muted-foreground/20" />
                  </div>
                )}

                {detail?.actor && (
                  <div className="flex items-center gap-1.5 mr-1 bg-muted/40 px-1.5 py-0.5 rounded-md border border-border/50 shadow-sm">
                    <GithubUserAvatar
                      username={detail.actor.login}
                      avatarUrl={detail.actor.avatar_url || detail.actor.avatarUrl}
                      className="size-3.5 border border-border/50"
                      fallbackClassName="text-[7px]"
                      label={detail.actor.login}
                      labelClassName="font-semibold text-foreground/90"
                    />
                  </div>
                )}

                <span>{t("metadata.targetBranch")}</span>
                {detailLoading && !effectiveRun.headBranch ? (
                  <Skeleton className="h-5 w-28 rounded bg-muted-foreground/20" />
                ) : (
                  <span className="bg-secondary px-1.5 py-px text-secondary-foreground rounded font-mono truncate max-w-[200px] shadow-sm">
                    {effectiveRun.headBranch || t("metadata.unknownBranch")}
                  </span>
                )}
                {effectiveRun.headSha && (
                  <>
                    <span>{t("metadata.atCommit")}</span>
                    <span className="bg-sidebar-accent px-1.5 py-px text-sidebar-foreground rounded font-mono truncate max-w-[100px] shadow-sm">
                      {effectiveRun.headSha.substring(0, 7)}
                    </span>
                  </>
                )}
              </div>
              <div className="mt-3 border-t border-border/40 pt-2">
                <TabsSubtle
                  activeLabel
                  idPrefix={`actions-run-${effectiveRun.databaseId}`}
                  selectedIndex={activeTab === "summary" ? 0 : 1}
                  onSelect={(index) => {
                    setActiveTab(index === 1 ? "workflow" : "summary");
                    resetContext();
                  }}
                >
                  <TabsSubtleItem
                    icon={ChartNoAxesCombined}
                    index={0}
                    label={t("tabs.summary")}
                  />
                  <TabsSubtleItem
                    icon={FileCode2}
                    index={1}
                    label={t("tabs.workflow")}
                  />
                </TabsSubtle>
              </div>
            </div>

            <div className="flex flex-col gap-4 pt-4">
              {activeTab === "summary" ? (
                <>
                  <ActionRunStatusCard
                    completed={isCompleted}
                    createdAtTimeAgo={createdAtTimeAgo}
                    createdAtTimestamp={createdAtTimestamp}
                    success={isSuccess}
                    t={t}
                    value={
                      isCompleted
                        ? effectiveRun.conclusion
                        : effectiveRun.status
                    }
                  />
                  <ActionsWorkflowGraph
                    jobs={jobs}
                    workflowFile={workflowFile}
                  />
                  <ActionsJobsList
                    agentFixContext={agentFixContext}
                    detailLoading={detailLoading}
                    isOpen={active}
                    jobs={jobs}
                    owner={owner}
                    repo={repo}
                    run={effectiveRun}
                    runId={effectiveRunId}
                  />
                  <ActionsAnnotations
                    agentFixContext={agentFixContext}
                    annotations={annotations}
                    owner={owner}
                    repo={repo}
                    run={effectiveRun}
                  />
                  <ActionsArtifacts
                    artifacts={artifacts}
                    owner={owner}
                    repo={repo}
                    runId={effectiveRunId}
                  />
                </>
              ) : (
                <ActionsWorkflowFile
                  detailLoading={detailLoading}
                  workflowFile={workflowFile}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <ActionsActionBar
        actionLoading={actionLoading}
        isCompleted={isCompleted}
        isFailure={isFailure}
        onOpenGitHub={handleNativeOpen}
        onRerunFailed={handleRerunFailed}
        onRerunAll={handleRerunAll}
      />
    </div>
  );
}

function ActionRunStatusCard({
  completed,
  createdAtTimeAgo,
  createdAtTimestamp,
  success,
  t,
  value,
}: {
  completed: boolean;
  createdAtTimeAgo: string | null;
  createdAtTimestamp: string | null;
  success: boolean;
  t: ReturnType<typeof useTranslations>;
  value: string;
}) {
  const status = formatGithubActionState(value, t);

  return (
    <div className="flex flex-col gap-3 py-2">
      <div
        className={cn(
          "flex items-start gap-4 rounded-xl border p-4 transition-all duration-180 ease-[cubic-bezier(0.22,1,0.36,1)]",
          completed
            ? success
              ? "border-emerald-500/20 bg-emerald-500/5 shadow-sm"
              : "border-red-500/20 bg-red-500/5 shadow-sm"
            : "border-blue-500/20 bg-blue-500/5 shadow-sm",
        )}
      >
        <div
          className={cn(
            "mt-0.5 rounded-full p-1.5 shadow-sm",
            completed
              ? success
                ? "bg-emerald-500 text-white"
                : "bg-red-500 text-white"
              : "animate-pulse bg-blue-500 text-white",
          )}
        >
          {completed ? (
            success ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <XCircle className="size-4" />
            )
          ) : (
            <Loader2 className="size-4 animate-spin" />
          )}
        </div>
        <div className="flex-1">
          <h5 className="flex items-center justify-between text-sm font-bold">
            {status}
            <span className="flex items-center gap-1 text-[10px] font-normal text-muted-foreground">
              <Clock className="size-3" />
              {createdAtTimestamp ?? t("statusCard.unknownStartTime")}
              {createdAtTimeAgo && ` (${createdAtTimeAgo})`}
            </span>
          </h5>
          <p className="mt-0.5 flex flex-col gap-1 text-[11px] text-muted-foreground">
            {t("statusCard.currently", { status })}
          </p>
        </div>
      </div>
    </div>
  );
}

function ActionsWorkflowFile({
  detailLoading,
  workflowFile,
}: {
  detailLoading: boolean;
  workflowFile: ActionWorkflowFile | undefined;
}) {
  const t = useTranslations("github.actionsDetail");

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <FileCode2 className="size-3.5" />
        <span>{workflowFile?.path ?? t("sections.workflowFile")}</span>
      </div>
      <div className="h-[min(60vh,720px)] min-h-[320px] overflow-hidden rounded-xl border">
        {workflowFile ? (
          <ReadOnlyCodeMirror
            className="h-full"
            isReadOnly
            language="yaml"
            value={workflowFile.content}
          />
        ) : detailLoading ? (
          <Skeleton className="h-full w-full rounded-none" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {t("workflowFile.unavailable")}
          </div>
        )}
      </div>
    </section>
  );
}

function ActionsAnnotations({
  agentFixContext,
  annotations,
  owner,
  repo,
  run,
}: {
  agentFixContext: ReturnType<typeof useAgentFixContext>;
  annotations: ActionAnnotation[];
  owner: string;
  repo: string;
  run: ActionRun;
}) {
  const t = useTranslations("github.actionsDetail");
  const agentFixSource = React.useMemo<AgentFixPromptSource>(
    () => ({
      id: `ci-annotations:${owner}/${repo}:${run.databaseId}`,
      family: "ci_job",
      context: agentFixContext,
      label: t("annotations.agentFixLabel"),
      disabledReason: agentFixContext
        ? null
        : t("annotations.agentFixDisabled"),
      getPrompt: () => ({
        prompt: buildGithubActionsAnnotationsFixPrompt({
          annotations,
          owner,
          repo,
          run,
        }),
        terminalTabTitle: t("annotations.agentFixTerminalTab"),
        terminalPaneLabel: t("annotations.agentFixTerminalPane"),
      }),
    }),
    [agentFixContext, annotations, owner, repo, run, t],
  );

  if (annotations.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <FileWarning className="size-3.5" />{" "}
          {t("sections.annotations", { count: annotations.length })}
        </h4>
        <AgentFixButton
          source={agentFixSource}
          mode="label"
          appearance="subtle"
        />
      </div>
      <div className="overflow-hidden rounded-xl border bg-background">
        <div className="flex flex-col divide-y divide-border">
          {annotations.map((annotation, index) => {
            const level =
              annotation.annotation_level ??
              annotation.annotationLevel ??
              "notice";
            const line = annotation.start_line ?? annotation.startLine;

            return (
              <div
                key={`${annotation.job_id ?? annotation.jobId ?? "job"}-${annotation.path ?? "annotation"}-${line ?? index}`}
                className="flex gap-3 px-4 py-3"
              >
                <AnnotationIcon level={level} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    {annotation.title && (
                      <span className="font-medium">{annotation.title}</span>
                    )}
                    {(annotation.job_name ?? annotation.jobName) && (
                      <span className="text-muted-foreground">
                        {annotation.job_name ?? annotation.jobName}
                      </span>
                    )}
                    {annotation.path && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {annotation.path}
                        {line ? `:${line}` : ""}
                      </span>
                    )}
                  </div>
                  {annotation.message && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {annotation.message}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ActionsArtifacts({
  artifacts,
  owner,
  repo,
  runId,
}: {
  artifacts: ActionArtifact[];
  owner: string;
  repo: string;
  runId: number;
}) {
  const t = useTranslations("github.actionsDetail");

  if (artifacts.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h4 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Package className="size-3.5" />{" "}
        {t("sections.artifacts", { count: artifacts.length })}
      </h4>
      <div className="overflow-hidden rounded-xl border bg-background">
        <div className="flex flex-col divide-y divide-border">
          {artifacts.map((artifact, index) => {
            const size = artifact.size_in_bytes ?? artifact.sizeInBytes ?? 0;
            const expiresAt = artifact.expires_at ?? artifact.expiresAt;
            const downloadUrl =
              artifact.id != null
                ? `https://github.com/${owner}/${repo}/actions/runs/${runId}/artifacts/${artifact.id}`
                : (artifact.archive_download_url ?? artifact.archiveDownloadUrl);

            return (
              <div
                key={artifact.id ?? `${artifact.name}-${index}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <Package className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {artifact.name ?? t("artifacts.unnamed")}
                  </p>
                  {artifact.digest && (
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {artifact.digest}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                  <p>{formatBytes(size)}</p>
                  {artifact.expired ? (
                    <p className="mt-0.5 text-red-500">{t("artifacts.expired")}</p>
                  ) : (
                    expiresAt && (
                      <p className="mt-0.5">{t("artifacts.expires", { time: formatActionTimeAgo(expiresAt) ?? "-" })}</p>
                    )
                  )}
                </div>
                {downloadUrl && !artifact.expired && (
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t("artifacts.download")}
                    aria-label={t("artifacts.download")}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Download className="size-3.5" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AnnotationIcon({ level }: { level: string }) {
  if (level === "failure") {
    return <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />;
  }
  if (level === "warning") {
    return <FileWarning className="mt-0.5 size-4 shrink-0 text-amber-500" />;
  }
  return <FileWarning className="mt-0.5 size-4 shrink-0 text-blue-500" />;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function WorkflowIcon(props: React.ComponentProps<typeof Rocket>) {
  return <Rocket {...props} />;
}

function formatGithubActionState(
  value: string | null | undefined,
  t: ReturnType<typeof useTranslations>,
) {
  switch (value) {
    case "queued":
      return t("states.queued");
    case "in_progress":
      return t("states.inProgress");
    case "completed":
      return t("states.completed");
    case "success":
      return t("states.success");
    case "failure":
      return t("states.failure");
    case "skipped":
      return t("states.skipped");
    case "cancelled":
      return t("states.cancelled");
    case "neutral":
      return t("states.neutral");
    case "pending":
      return t("states.pending");
    case "requested":
      return t("states.requested");
    case "stale":
      return t("states.stale");
    case "timed_out":
      return t("states.timedOut");
    case "action_required":
      return t("states.actionRequired");
    case "startup_failure":
      return t("states.startupFailure");
    case "unknown":
    case "":
    case null:
    case undefined:
      return t("states.unknown");
    default:
      return value.replace(/_/g, " ");
  }
}
