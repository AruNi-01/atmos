"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  FileCode2,
  Loader2,
  SquareArrowOutUpRight,
  XCircle,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  getFileIconProps,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import { AgentFixButton } from "@/features/agent-fix/components/AgentFixButton";
import { useAgentFixContext } from "@/features/agent-fix/hooks/use-agent-fix-context";
import type { AgentFixPromptSource } from "@/features/agent-fix/types";
import {
  parseGithubActionsRunId,
  type StatusCheck,
} from "@/features/github/lib/pr-detail-parts";
import {
  buildGithubActionsCheckFixPrompt,
  buildPrMergeConflictsFixPrompt,
} from "@/features/github/lib/agent-fix-prompts";
import {
  PRMergeControls,
  type PRMergeStrategy,
} from "@/features/github/lib/pr-detail-actions";
import { useOpenGithubCenterTab } from "@/features/github/hooks/use-open-github-center-tab";
import type { ActionRun } from "@/features/github/components/ActionsPanel";
import { ChecksStatusRing } from "@/features/github/components/ChecksStatusRing";
import { useGitStore } from "@/features/git/store/use-git-store";
import { useGitChangedFilesQuery } from "@/features/git/hooks/use-git-changed-files-query";
import {
  buildConflictResolveEditorPath,
  useEditorStore,
} from "@/features/editor/store/use-editor-store";
import { useContextParams } from "@/shared/hooks/use-context-params";

type CheckBucket = "failing" | "pending" | "skipped" | "successful";

function isFailing(check: StatusCheck): boolean {
  return (
    check.state === "FAILURE" ||
    check.state === "ERROR" ||
    check.conclusion === "FAILURE" ||
    check.conclusion === "ERROR" ||
    check.conclusion === "ACTION_REQUIRED" ||
    check.conclusion === "TIMED_OUT" ||
    check.conclusion === "STARTUP_FAILURE"
  );
}

function isPending(check: StatusCheck): boolean {
  if (isFailing(check) || isSkipped(check) || isSuccessful(check)) return false;
  return (
    check.state === "PENDING" ||
    check.state === "IN_PROGRESS" ||
    check.state === "EXPECTED" ||
    check.state === "QUEUED" ||
    (typeof check.status === "string" &&
      check.status !== "COMPLETED" &&
      check.status !== "completed")
  );
}

function isSkipped(check: StatusCheck): boolean {
  return (
    check.conclusion === "SKIPPED" ||
    check.conclusion === "NEUTRAL" ||
    check.conclusion === "CANCELLED" ||
    check.conclusion === "STALE"
  );
}

function isSuccessful(check: StatusCheck): boolean {
  return check.state === "SUCCESS" || check.conclusion === "SUCCESS";
}

function bucketFor(check: StatusCheck): CheckBucket {
  if (isFailing(check)) return "failing";
  if (isPending(check)) return "pending";
  if (isSkipped(check)) return "skipped";
  if (isSuccessful(check)) return "successful";
  return "pending";
}

function checkLabel(check: StatusCheck): string {
  const job = check.name || check.context || "check";
  return check.workflowName ? `${check.workflowName} / ${job}` : job;
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

function checkDurationLabel(
  check: StatusCheck,
  t: ReturnType<typeof useTranslations>,
): string {
  const start = check.startedAt ? Date.parse(check.startedAt) : NaN;
  const end = check.completedAt ? Date.parse(check.completedAt) : NaN;
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    const dur = formatDurationMs(end - start);
    if (isFailing(check)) return t("row.failingAfter", { duration: dur });
    if (isSuccessful(check)) return t("row.successfulIn", { duration: dur });
    if (isSkipped(check)) return t("row.skipped");
    return dur;
  }
  if (isPending(check)) return t("row.inProgress");
  if (isSkipped(check)) return t("row.skipped");
  if (isFailing(check)) return t("row.failed");
  if (isSuccessful(check)) return t("row.passed");
  return "";
}

function buildStubRun(
  check: StatusCheck,
  runId: number,
  owner: string,
  repo: string,
): ActionRun {
  return {
    databaseId: runId,
    workflowName: check.workflowName || check.name || check.context || "Actions",
    displayTitle: check.name || check.context || check.workflowName || "Run",
    status: isPending(check) ? "in_progress" : "completed",
    conclusion: isFailing(check)
      ? "failure"
      : isSuccessful(check)
        ? "success"
        : isSkipped(check)
          ? "skipped"
          : "",
    createdAt: check.startedAt || check.completedAt || "",
    url: `https://github.com/${owner}/${repo}/actions/runs/${runId}`,
    event: "",
    headBranch: "",
    headSha: "",
  };
}

export interface PRChecksTabProps {
  owner: string;
  repo: string;
  prNumber: number;
  prTitle?: string | null;
  prUrl?: string | null;
  headRefName?: string | null;
  baseRefName?: string | null;
  checks: StatusCheck[];
  mergeable?: string;
  mergeStateStatus?: string;
  isDraft?: boolean;
  prState?: string;
  commitsCount?: number;
  actionLoading: "merge" | "close" | "reopen" | "comment" | null;
  mergeStrategy: PRMergeStrategy;
  onMergeStrategyChange: (strategy: PRMergeStrategy) => void;
  onMerge: () => void;
  onConvertToDraft?: () => void;
}

export function PRChecksTab({
  owner,
  repo,
  prNumber,
  prTitle,
  prUrl,
  headRefName,
  baseRefName,
  checks,
  mergeable,
  mergeStateStatus,
  isDraft,
  prState,
  commitsCount = 0,
  actionLoading,
  mergeStrategy,
  onMergeStrategyChange,
  onMerge,
  onConvertToDraft,
}: PRChecksTabProps) {
  const t = useTranslations("github.prDetail.checksTab");
  const tStatus = useTranslations("github.prDetail.status");
  const agentFixContext = useAgentFixContext();
  const { openActionRunTab } = useOpenGithubCenterTab();
  const { effectiveContextId } = useContextParams();
  const openEditorFile = useEditorStore((s) => s.openFile);
  const currentRepoPath = useGitStore((s) => s.currentRepoPath);
  const worktreeQuery = useGitChangedFilesQuery(currentRepoPath);
  const [openAgentFixId, setOpenAgentFixId] = React.useState<string | null>(
    null,
  );

  const buckets = React.useMemo(() => {
    const result: Record<CheckBucket, StatusCheck[]> = {
      failing: [],
      pending: [],
      skipped: [],
      successful: [],
    };
    for (const check of checks) {
      result[bucketFor(check)].push(check);
    }
    return result;
  }, [checks]);

  const hasConflicts =
    mergeable === "CONFLICTING" || mergeStateStatus === "DIRTY";
  const isMergeable = mergeable === "MERGEABLE";
  const isCheckingMerge =
    !hasConflicts &&
    (mergeable === "UNKNOWN" ||
      mergeable === undefined ||
      mergeStateStatus === "UNKNOWN");

  const conflictFilePaths = React.useMemo(() => {
    const CONFLICT_STATUSES = new Set([
      "DD",
      "AU",
      "UD",
      "UA",
      "DU",
      "AA",
      "UU",
      "U",
    ]);
    const staged = worktreeQuery.data?.staged_files ?? [];
    const unstaged = worktreeQuery.data?.unstaged_files ?? [];
    const paths = new Set<string>();
    for (const file of [...staged, ...unstaged]) {
      if (CONFLICT_STATUSES.has(file.status)) {
        paths.add(file.path);
      }
    }
    return Array.from(paths).sort((a, b) => a.localeCompare(b));
  }, [worktreeQuery.data?.staged_files, worktreeQuery.data?.unstaged_files]);

  const openConflictFile = React.useCallback(
    async (relativePath?: string) => {
      const source = relativePath?.trim() || "merge-conflicts";
      await openEditorFile(
        buildConflictResolveEditorPath(source, { readOnly: true }),
        effectiveContextId || undefined,
        { preview: false },
      );
    },
    [effectiveContextId, openEditorFile],
  );

  const conflictAgentFixSource = React.useMemo((): AgentFixPromptSource | null => {
    if (!hasConflicts) return null;
    return {
      id: `pr-conflicts:${owner}/${repo}#${prNumber}`,
      family: "pr_review",
      context: agentFixContext,
      label: t("conflicts.agentFixLabel"),
      disabledReason: agentFixContext ? null : t("agentFix.disabledReason"),
      getPrompt: () => ({
        prompt: buildPrMergeConflictsFixPrompt({
          owner,
          repo,
          pr: {
            number: prNumber,
            title: prTitle,
            headRefName,
            baseRefName,
            url: prUrl,
          },
          conflictFiles: conflictFilePaths,
        }),
        terminalTabTitle: t("conflicts.agentFixTerminalTab", { prNumber }),
        terminalPaneLabel: t("conflicts.agentFixTerminalPane"),
      }),
    };
  }, [
    agentFixContext,
    baseRefName,
    conflictFilePaths,
    hasConflicts,
    headRefName,
    owner,
    prNumber,
    prTitle,
    prUrl,
    repo,
    t,
  ]);

  const summary = React.useMemo(() => {
    const failing = buckets.failing.length;
    const pending = buckets.pending.length;
    const skipped = buckets.skipped.length;
    const successful = buckets.successful.length;

    if (hasConflicts) {
      return {
        tone: "warning" as const,
        title: t("summary.awaitingConflicts"),
        description: t("summary.counts", {
          failing,
          pending,
          skipped,
          successful,
        }),
      };
    }
    if (failing > 0) {
      return {
        tone: "danger" as const,
        title: t("summary.someFailed"),
        description: t("summary.counts", {
          failing,
          pending,
          skipped,
          successful,
        }),
      };
    }
    if (pending > 0) {
      return {
        tone: "pending" as const,
        title: t("summary.inProgress"),
        description: t("summary.counts", {
          failing,
          pending,
          skipped,
          successful,
        }),
      };
    }
    if (checks.length === 0) {
      return {
        tone: "neutral" as const,
        title: t("summary.none"),
        description: t("summary.noneDescription"),
      };
    }
    return {
      tone: "success" as const,
      title: t("summary.allPassed"),
      description: t("summary.counts", {
        failing,
        pending,
        skipped,
        successful,
      }),
    };
  }, [buckets, checks.length, hasConflicts, t]);

  const openCheck = React.useCallback(
    (check: StatusCheck) => {
      const runId = parseGithubActionsRunId(check.detailsUrl);
      if (runId != null) {
        openActionRunTab({
          owner,
          repo,
          run: buildStubRun(check, runId, owner, repo),
          runId,
        });
        return;
      }
      const external = check.detailsUrl || check.targetUrl;
      if (external) {
        window.open(external, "_blank", "noopener,noreferrer");
      }
    },
    [openActionRunTab, owner, repo],
  );

  const buildCheckAgentFixSource = React.useCallback(
    (check: StatusCheck): AgentFixPromptSource | undefined => {
      if (!isFailing(check)) return undefined;
      const name = check.name || check.context || "check";
      const runId = parseGithubActionsRunId(check.detailsUrl);
      return {
        id: `pr-check:${owner}/${repo}#${prNumber}:${check.workflowName || "wf"}:${name}:${runId ?? check.detailsUrl ?? "x"}`,
        family: "ci_job",
        context: agentFixContext,
        label: t("agentFix.label", { name }),
        disabledReason: agentFixContext ? null : t("agentFix.disabledReason"),
        getPrompt: () => ({
          prompt: buildGithubActionsCheckFixPrompt({
            owner,
            repo,
            check: {
              name,
              workflowName: check.workflowName,
              conclusion: check.conclusion,
              status: check.status || check.state,
              detailsUrl: check.detailsUrl || check.targetUrl,
            },
            runId,
            pr: {
              number: prNumber,
              title: prTitle,
              headRefName,
              baseRefName,
              url: prUrl,
            },
          }),
          terminalTabTitle: t("agentFix.terminalTabTitle", { prNumber }),
          terminalPaneLabel: t("agentFix.terminalPaneLabel", { name }),
        }),
      };
    },
    [
      agentFixContext,
      baseRefName,
      headRefName,
      owner,
      prNumber,
      prTitle,
      prUrl,
      repo,
      t,
    ],
  );

  const sections: Array<{
    key: CheckBucket;
    title: string;
    items: StatusCheck[];
  }> = (
    [
      {
        key: "failing" as const,
        title: t("groups.failing", { count: buckets.failing.length }),
        items: buckets.failing,
      },
      {
        key: "pending" as const,
        title: t("groups.pending", { count: buckets.pending.length }),
        items: buckets.pending,
      },
      {
        key: "skipped" as const,
        title: t("groups.skipped", { count: buckets.skipped.length }),
        items: buckets.skipped,
      },
      {
        key: "successful" as const,
        title: t("groups.successful", { count: buckets.successful.length }),
        items: buckets.successful,
      },
    ] satisfies Array<{ key: CheckBucket; title: string; items: StatusCheck[] }>
  ).filter((section) => section.items.length > 0);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex flex-col gap-4 pt-4">
        {/* Summary — GitHub-style multi-segment status ring */}
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3 shadow-sm",
            summary.tone === "success" && "border-emerald-500/20 bg-emerald-500/5",
            summary.tone === "danger" && "border-red-500/20 bg-red-500/5",
            summary.tone === "pending" && "border-amber-500/20 bg-amber-500/5",
            summary.tone === "warning" && "border-amber-500/25 bg-amber-500/5",
            summary.tone === "neutral" && "border-border bg-muted/30",
          )}
        >
          <ChecksStatusRing
            checks={checks}
            hasConflicts={hasConflicts}
            size={32}
            strokeWidth={3.5}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-foreground">
              {summary.title}
            </h4>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {summary.description}
            </p>
          </div>
        </div>

        {/* Check lists (not collapsible — dedicated tab) */}
        {sections.length > 0 ? (
          <div className="flex flex-col gap-4">
            {sections.map((section) => (
              <div key={section.key} className="flex flex-col gap-2">
                <div className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                  {section.title}
                </div>
                <div className="overflow-hidden rounded-xl border border-border/60 bg-background divide-y divide-border/50">
                  {section.items.map((check, index) => {
                    const label = checkLabel(check);
                    const runId = parseGithubActionsRunId(check.detailsUrl);
                    const canOpen =
                      runId != null || !!(check.detailsUrl || check.targetUrl);
                    const agentFixSource = buildCheckAgentFixSource(check);
                    const duration = checkDurationLabel(check, t);
                    const rowKey = `${section.key}-${label}-${runId ?? index}`;

                    return (
                      <div
                        key={rowKey}
                        className="group flex items-center gap-3 px-3 py-2.5 hover:bg-muted/35 transition-colors"
                      >
                        <div className="shrink-0">
                          {section.key === "failing" ? (
                            <XCircle className="size-3.5 text-red-500" />
                          ) : section.key === "pending" ? (
                            <Loader2 className="size-3.5 animate-spin text-amber-500" />
                          ) : section.key === "skipped" ? (
                            <CircleDashed className="size-3.5 text-muted-foreground/60" />
                          ) : (
                            <CheckCircle2 className="size-3.5 text-emerald-500" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div
                            className={cn(
                              "truncate text-[13px] font-medium",
                              section.key === "failing"
                                ? "text-red-500"
                                : "text-foreground/90",
                            )}
                            title={label}
                          >
                            {label}
                          </div>
                          {duration ? (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {duration}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          {/* Open (hover) sits left of Agent Fix on failing rows */}
                          {canOpen ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => openCheck(check)}
                                  className={cn(
                                    "flex size-7 items-center justify-center rounded-md text-muted-foreground",
                                    "hover:bg-muted hover:text-foreground",
                                    "opacity-0 pointer-events-none transition-opacity",
                                    "group-hover:opacity-100 group-hover:pointer-events-auto",
                                    "group-focus-within:opacity-100 group-focus-within:pointer-events-auto",
                                  )}
                                  aria-label={
                                    runId != null
                                      ? t("openAction", { name: label })
                                      : t("openExternal", { name: label })
                                  }
                                >
                                  <SquareArrowOutUpRight className="size-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs">
                                {runId != null
                                  ? t("openAction", { name: label })
                                  : t("openExternal", { name: label })}
                              </TooltipContent>
                            </Tooltip>
                          ) : null}

                          {agentFixSource ? (
                            <span
                              className="shrink-0"
                              data-agent-fix-action-host="true"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <AgentFixButton
                                source={agentFixSource}
                                mode="label"
                                appearance="subtle"
                                onSettingsOpenChange={(open) => {
                                  setOpenAgentFixId((current) => {
                                    if (open) return agentFixSource.id;
                                    return current === agentFixSource.id
                                      ? null
                                      : current;
                                  });
                                }}
                              />
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-[12px] text-muted-foreground">
            {t("empty")}
          </div>
        )}

        {/* Conflicts — file list opens Atmos read-only conflict tab; Agent Fix replaces GitHub jump */}
        {prState === "OPEN" && hasConflicts && (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <h5 className="text-sm font-semibold text-foreground">
                  {t("conflicts.title")}
                </h5>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {t("conflicts.description")}
                </p>
              </div>
              {conflictAgentFixSource ? (
                <span
                  className="shrink-0"
                  data-agent-fix-action-host="true"
                  onClick={(e) => e.stopPropagation()}
                >
                  <AgentFixButton
                    source={conflictAgentFixSource}
                    mode="label"
                    appearance="subtle"
                    onSettingsOpenChange={(open) => {
                      setOpenAgentFixId((current) => {
                        if (open) return conflictAgentFixSource.id;
                        return current === conflictAgentFixSource.id
                          ? null
                          : current;
                      });
                    }}
                  />
                </span>
              ) : null}
            </div>

            {conflictFilePaths.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border/50 bg-background/60 divide-y divide-border/40">
                {conflictFilePaths.map((path) => {
                  const name = path.split("/").pop() || path;
                  const iconProps = getFileIconProps({
                    name,
                    isDir: false,
                    className: "size-3.5 shrink-0",
                  });
                  return (
                    <button
                      key={path}
                      type="button"
                      onClick={() => void openConflictFile(path)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-muted/40 transition-colors"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={iconProps.src}
                        alt={iconProps.alt || ""}
                        className="size-3.5 shrink-0"
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-foreground/90">
                        {path}
                      </span>
                      <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => void openConflictFile()}
                  className="flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
                >
                  {t("conflicts.openAll")}
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {t("conflicts.noLocalFiles")}
              </p>
            )}
          </div>
        )}

        {/* Mergeability + merge controls */}
        {prState === "OPEN" && (
          <div
            className={cn(
              "flex flex-col gap-3 rounded-xl border p-4 shadow-sm",
              isMergeable
                ? "border-emerald-500/20 bg-emerald-500/5"
                : hasConflicts
                  ? "border-border/60 bg-muted/20"
                  : "border-border/60 bg-muted/30",
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 rounded-full p-1.5",
                  isMergeable
                    ? "bg-emerald-500 text-white"
                    : "bg-muted-foreground/20 text-muted-foreground",
                )}
              >
                {isMergeable ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <AlertCircle className="size-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h5 className="text-sm font-semibold">
                  {hasConflicts
                    ? t("conflicts.title")
                    : isMergeable
                      ? tStatus("mergeableTitle")
                      : isCheckingMerge
                        ? tStatus("checkingTitle")
                        : tStatus("checkingTitle")}
                </h5>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {hasConflicts
                    ? t("conflicts.description")
                    : isMergeable
                      ? tStatus("mergeableDescription")
                      : tStatus("checkingDescription")}
                </p>
                {!isDraft && onConvertToDraft ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {tStatus("stillInProgress")}{" "}
                    <button
                      type="button"
                      onClick={onConvertToDraft}
                      disabled={!!actionLoading}
                      className="underline decoration-dotted underline-offset-4 hover:text-foreground"
                    >
                      {tStatus("convertToDraft")}
                    </button>
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border/40 pt-3">
              <PRMergeControls
                pr={{
                  state: prState,
                  isDraft,
                  mergeable,
                  commits: Array.from({ length: commitsCount }),
                }}
                actionLoading={actionLoading}
                mergeStrategy={mergeStrategy}
                onMergeStrategyChange={onMergeStrategyChange}
                onMerge={onMerge}
              />
              <span className="text-[11px] text-muted-foreground">
                {t("merge.hint")}
              </span>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
