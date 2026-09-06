"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, cn } from "@workspace/ui";
import { ArrowRight, Loader2, Rocket } from "lucide-react";
import { Github } from "@workspace/ui/components/icons/lucide-brand-icons";
import { format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import type {
  LinearGithubRefPayload,
  LinearIssuePayload,
} from "@atmos/api-types/ws/dto/linear";
import {
  LinearAssigneeAvatar,
  LinearLabelChip,
  LinearPriorityMark,
  LinearStatusIcon,
} from "@/features/task/components/task-linear-visuals";

export type TaskLinearTableBodyState =
  | "ready"
  | "loading"
  | "empty"
  | "error";

function formatShortDate(
  iso: string | null | undefined,
  locale: string,
): string | null {
  if (!iso) return null;
  try {
    return format(new Date(iso), locale.startsWith("zh") ? "M月d日" : "MMM d", {
      locale: locale.startsWith("zh") ? zhCN : enUS,
    });
  } catch {
    return null;
  }
}

type TaskLinearTableProps = {
  issues: LinearIssuePayload[];
  busyId: string | null;
  /** Keep the table chrome mounted; only the body region changes. */
  bodyState?: TaskLinearTableBodyState;
  bodyMessage?: string;
  onOpenIssue?: (issue: LinearIssuePayload) => void;
  onCreateWorkspace: (issue: LinearIssuePayload) => void;
  onEnterWorkspace?: (workspaceId: string) => void;
  resolveLinkedWorkspaceId?: (issue: LinearIssuePayload) => string | null;
  onOpenGithubRef?: (ref: LinearGithubRefPayload) => void;
};

/**
 * Linear issue list — flex table shell (same as GitHub task table),
 * but row chrome matches Linear: priority · id · status icon · title · labels · meta.
 */
export function TaskLinearTable({
  issues,
  busyId,
  bodyState = "ready",
  bodyMessage,
  onOpenIssue,
  onCreateWorkspace,
  onEnterWorkspace,
  resolveLinkedWorkspaceId,
  onOpenGithubRef,
}: TaskLinearTableProps) {
  const t = useTranslations("appShell.task.linear");
  const locale = useLocale();

  const priorityColClass = "w-8 shrink-0";
  const assigneesColClass = "w-14 shrink-0";
  const dateColClass = "w-[4.5rem] shrink-0";
  const actionColClass = "w-[5.5rem] shrink-0";

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border/70">
      {/*
        Header mirrors row columns. Status stays inline with the issue title
        (icon before title) — no dedicated Status column so the row stays dense.
      */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground">
        <div
          className={cn(priorityColClass, "text-center")}
          title={t("table.priority")}
        >
          {t("table.priorityShort")}
        </div>
        <div className="min-w-0 flex-1" title={t("table.issueHint")}>
          {t("table.issue")}
        </div>
        <div
          className={cn(assigneesColClass, "truncate text-center")}
          title={t("table.assignee")}
        >
          {t("table.assignee")}
        </div>
        <div className={cn(dateColClass, "hidden text-right md:block")}>
          {t("table.createdAt")}
        </div>
        <div className={cn(dateColClass, "hidden text-right sm:block")}>
          {t("table.updatedAt")}
        </div>
        <div className={cn(actionColClass, "text-right")}>{t("table.action")}</div>
      </div>

      {/* Body — loading / empty / error / rows stay inside the card */}
      {bodyState === "loading" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-xs">{t("table.loading")}</span>
        </div>
      ) : bodyState === "error" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-10 text-center text-sm text-destructive">
          {bodyMessage ?? t("loadError")}
        </div>
      ) : bodyState === "empty" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">
          {bodyMessage ?? t("empty")}
        </div>
      ) : (
      <ul className="m-0 min-h-0 min-w-0 flex-1 list-none overflow-y-auto overscroll-contain px-1 py-1">
        {issues.map((issue) => {
          const createdLabel = formatShortDate(issue.created_at, locale);
          const updatedLabel = formatShortDate(issue.updated_at, locale);
          const labels = issue.labels ?? [];
          const githubRefs = issue.github_refs ?? [];
          const linkedWorkspaceId = resolveLinkedWorkspaceId?.(issue) ?? null;

          return (
            <li key={issue.id}>
              <div
                role={onOpenIssue ? "button" : undefined}
                tabIndex={onOpenIssue ? 0 : undefined}
                className={cn(
                  "group flex min-w-0 items-center gap-2.5 rounded-md px-2 py-2 hover:bg-muted/40",
                  onOpenIssue && "cursor-pointer",
                )}
                onClick={() => onOpenIssue?.(issue)}
                onKeyDown={(event) => {
                  if (!onOpenIssue) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenIssue(issue);
                  }
                }}
              >
                <div className={cn(priorityColClass, "flex justify-center")}>
                  <LinearPriorityMark priority={issue.priority} />
                </div>

                {/*
                  Linear-aligned main cell:
                  [id · status · title (truncates)] [labels · github (never shrink away)]
                */}
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground hover:text-foreground hover:underline"
                      title={t("openInLinear")}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {issue.identifier}
                    </a>
                    <LinearStatusIcon
                      stateType={issue.state_type}
                      stateName={issue.state_name}
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground"
                      title={issue.title}
                    >
                      {issue.title}
                    </span>
                  </div>

                  {(labels.length > 0 || githubRefs.length > 0) && (
                    <div className="flex shrink-0 items-center gap-1">
                      {labels.slice(0, 3).map((label) => (
                        <LinearLabelChip
                          key={label.name}
                          name={label.name}
                          color={label.color}
                          className="max-w-[5.5rem] px-1.5 py-px text-[10px]"
                        />
                      ))}
                      {labels.length > 3 ? (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          +{labels.length - 3}
                        </span>
                      ) : null}
                      {githubRefs.slice(0, 2).map((ref) => (
                        <button
                          key={ref.url}
                          type="button"
                          className="inline-flex shrink-0 items-center gap-0.5 rounded px-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenGithubRef) {
                              onOpenGithubRef(ref);
                              return;
                            }
                            if (ref.url) {
                              window.open(
                                ref.url,
                                "_blank",
                                "noopener,noreferrer",
                              );
                            }
                          }}
                          title={`${ref.owner}/${ref.repo}#${ref.number}`}
                        >
                          <Github className="size-3 opacity-70" aria-hidden />
                          <span>#{ref.number}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  className={cn(
                    assigneesColClass,
                    "flex items-center justify-center",
                  )}
                >
                  <LinearAssigneeAvatar
                    name={issue.assignee?.name}
                    avatarUrl={issue.assignee?.avatar_url}
                  />
                </div>

                <div
                  className={cn(
                    dateColClass,
                    "hidden truncate text-right text-[11px] tabular-nums text-muted-foreground md:block",
                  )}
                  title={
                    issue.created_at
                      ? new Date(issue.created_at).toLocaleString(locale)
                      : undefined
                  }
                >
                  {createdLabel ?? "—"}
                </div>

                <div
                  className={cn(
                    dateColClass,
                    "hidden truncate text-right text-[11px] tabular-nums text-muted-foreground sm:block",
                  )}
                  title={
                    issue.updated_at
                      ? new Date(issue.updated_at).toLocaleString(locale)
                      : undefined
                  }
                >
                  {updatedLabel ?? "—"}
                </div>

                <div
                  className={cn(
                    actionColClass,
                    "flex items-center justify-end",
                  )}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {linkedWorkspaceId && onEnterWorkspace ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-7 gap-1 px-2 text-[11px] font-medium"
                      onClick={() => onEnterWorkspace(linkedWorkspaceId)}
                      title={t("enterWorkspace")}
                      aria-label={t("enterWorkspace")}
                    >
                      <ArrowRight className="size-3.5" />
                      <span className="hidden sm:inline">{t("enter")}</span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-7 gap-1 px-2 text-[11px] font-medium"
                      disabled={busyId === issue.id}
                      onClick={() => onCreateWorkspace(issue)}
                      title={t("createWorkspace")}
                      aria-label={t("createWorkspace")}
                    >
                      <Rocket className="size-3.5" />
                      <span className="hidden sm:inline">{t("create")}</span>
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}
