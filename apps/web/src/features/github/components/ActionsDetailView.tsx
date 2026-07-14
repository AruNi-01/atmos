import React from "react";
import { useTranslations } from "next-intl";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  Skeleton,
} from "@workspace/ui";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  XCircle,
  Loader2,
  CheckCircle2,
  Rocket,
  Clock,
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
import type { ActionJob } from "./actions-detail-types";

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

  // Merge: prefer the passed-in `run` object; fall back to `detail` (available after fetch on refresh)
  const effectiveRun: ActionRun | null =
    run ??
    (detail
      ? {
          databaseId: detail.databaseId ?? detail.id ?? effectiveRunId!,
          workflowName:
            detail.workflowName ?? detail.workflow_name ?? detail.name ?? "",
          displayTitle:
            detail.displayTitle ?? detail.display_title ?? detail.name ?? "",
          status: detail.status ?? "",
          conclusion: detail.conclusion ?? "",
          createdAt:
            detail.createdAt ??
            detail.created_at ??
            detail.run_started_at ??
            "",
          url: detail.url ?? detail.html_url ?? "",
          event: detail.event ?? "",
          headBranch: detail.headBranch ?? detail.head_branch ?? "",
          headSha: detail.headSha ?? detail.head_sha ?? "",
        }
      : null);

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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col gap-0 overflow-hidden px-6 pb-6">
        <div className="flex-1 overflow-y-auto min-h-0 pr-4 -mr-4 pb-16 relative no-scrollbar">
          <header className="flex flex-row items-center gap-3 pt-6 pb-4 shrink-0 relative">
            <WorkflowIcon className="size-4.5 text-muted-foreground/60" />
            <div className="flex items-center gap-2.5 min-w-0">
              <h2 className="text-base font-bold whitespace-nowrap">
                {t("title", { runId: effectiveRun.databaseId })}
              </h2>
              <span className="text-muted-foreground/30 font-light select-none">
                |
              </span>
              <p
                className="text-[11px] text-muted-foreground/60 truncate pt-0.5 font-medium"
                title={`${owner}/${repo}`}
              >
                {owner}/{repo}
              </p>
            </div>
          </header>

          <div className="flex flex-col text-sm relative">
            <div className="shrink-0 pb-4 pt-1 border-b border-border/50 sticky top-0 z-30 bg-background/98 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">
                  {effectiveRun.displayTitle}
                </h3>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1.5 bg-muted/50 px-1.5 py-0.5 rounded-md border border-border/50 shadow-sm shrink-0">
                  <Rocket className="size-3.5" />
                  <span className="font-semibold text-foreground/90">
                    {effectiveRun.workflowName}
                  </span>
                </div>
                <span>{t("metadata.triggeredVia")}</span>
                <span className="bg-primary/10 text-primary px-1.5 py-px rounded font-mono truncate shadow-sm capitalize mr-1">
                  {effectiveRun.event}
                </span>

                {detailLoading && !detail?.actor && (
                  <div className="flex items-center gap-1.5 mr-1 bg-muted/20 px-1.5 py-1 rounded-md border border-border/30">
                    <Skeleton className="size-3.5 rounded-full bg-muted-foreground/20" />
                    <Skeleton className="h-3 w-16 bg-muted-foreground/20" />
                  </div>
                )}

                {detail?.actor && (
                  <div className="flex items-center gap-1.5 mr-1 bg-muted/40 px-1.5 py-0.5 rounded-md border border-border/50 shadow-sm">
                    <Avatar className="size-3.5 border border-border/50">
                      <AvatarImage
                        src={detail.actor.avatar_url || detail.actor.avatarUrl}
                      />
                      <AvatarFallback className="text-[7px]">
                        {detail.actor.login?.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-foreground/90">
                      {detail.actor.login}
                    </span>
                  </div>
                )}

                <span>{t("metadata.targetBranch")}</span>
                <span className="bg-secondary px-1.5 py-px text-secondary-foreground rounded font-mono truncate max-w-[200px] shadow-sm">
                  {effectiveRun.headBranch || t("metadata.unknownBranch")}
                </span>
                {effectiveRun.headSha && (
                  <>
                    <span>{t("metadata.atCommit")}</span>
                    <span className="bg-sidebar-accent px-1.5 py-px text-sidebar-foreground rounded font-mono truncate max-w-[100px] shadow-sm">
                      {effectiveRun.headSha.substring(0, 7)}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="pt-6 flex flex-col gap-4">
              {/* Actions Status Section */}
              <div className="flex flex-col gap-3 py-2">
                <div
                  className={cn(
                    "flex items-start gap-4 p-4 border rounded-xl transition-all duration-180 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    isCompleted
                      ? isSuccess
                        ? "bg-emerald-500/5 border-emerald-500/20 shadow-sm"
                        : "bg-red-500/5 border-red-500/20 shadow-sm"
                      : "bg-blue-500/5 border-blue-500/20 shadow-sm",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 rounded-full p-1.5 shadow-sm",
                      isCompleted
                        ? isSuccess
                          ? "bg-emerald-500 text-white"
                          : "bg-red-500 text-white"
                        : "bg-blue-500 text-white animate-pulse",
                    )}
                  >
                    {isCompleted ? (
                      isSuccess ? (
                        <CheckCircle2 className="size-4" />
                      ) : (
                        <XCircle className="size-4" />
                      )
                    ) : (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h5 className="text-sm font-bold flex items-center justify-between capitalize">
                      {formatGithubActionState(
                        isCompleted ? effectiveRun.conclusion : effectiveRun.status,
                        t,
                      )}
                      <span className="text-[10px] text-muted-foreground font-normal normal-case flex items-center gap-1">
                        <Clock className="size-3" />
                        {createdAtTimestamp ?? t("statusCard.unknownStartTime")}
                        {createdAtTimeAgo && ` (${createdAtTimeAgo})`}
                      </span>
                    </h5>
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex flex-col gap-1">
                      {t("statusCard.currently", {
                        status: formatGithubActionState(
                          isCompleted
                            ? effectiveRun.conclusion
                            : effectiveRun.status,
                          t,
                        ),
                      })}
                    </p>
                  </div>
                </div>
              </div>

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
            </div>
          </div>
        </div>

        <ActionsActionBar
          actionLoading={actionLoading}
          isCompleted={isCompleted}
          isFailure={isFailure}
          onOpenGitHub={handleNativeOpen}
          onOpenBetterHub={() =>
            window.open(
              `https://better-hub.com/${owner}/${repo}/actions/runs/${effectiveRun.databaseId}`,
              "_blank",
            )
          }
          onRerunFailed={handleRerunFailed}
          onRerunAll={handleRerunAll}
        />
    </div>
  );
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
