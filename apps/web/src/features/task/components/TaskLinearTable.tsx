"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, cn } from "@workspace/ui";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Link2,
  Rocket,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import type { LinearIssuePayload } from "@atmos/api-types/ws/dto/linear";

/**
 * Priority cell: Linear 0 = no priority.
 * Use a fixed min-width + nowrap so "---" never wraps to "--" / "-".
 */
function PriorityMark({ priority }: { priority: number }) {
  const t = useTranslations("appShell.task.linear");
  if (!priority || priority <= 0) {
    return (
      <span
        className="inline-block min-w-[1.75rem] shrink-0 whitespace-nowrap text-center text-[11px] leading-none tracking-tight text-muted-foreground"
        title={t("table.noPriority")}
      >
        ---
      </span>
    );
  }
  // Linear: 1 urgent · 2 high · 3 medium · 4 low
  const tone =
    priority === 1
      ? "text-orange-500"
      : priority === 2
        ? "text-amber-500"
        : priority === 3
          ? "text-yellow-600 dark:text-yellow-500"
          : "text-muted-foreground";
  const label =
    priority === 1
      ? t("priority.urgent")
      : priority === 2
        ? t("priority.high")
        : priority === 3
          ? t("priority.medium")
          : t("priority.low");
  return (
    <span
      className={cn(
        "inline-block min-w-[1.75rem] shrink-0 whitespace-nowrap text-center text-xs font-semibold leading-none",
        tone,
      )}
      title={label}
    >
      {priority === 1 ? "!!" : "!"}
    </span>
  );
}

function StatusIcon({ stateType }: { stateType?: string | null }) {
  if (stateType === "completed" || stateType === "canceled") {
    return <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" aria-hidden />;
  }
  return <Circle className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />;
}

function AssigneeAvatar({
  name,
  avatarUrl,
}: {
  name?: string | null;
  avatarUrl?: string | null;
}) {
  if (!name && !avatarUrl) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name ?? ""}
        title={name ?? undefined}
        className="size-5 shrink-0 rounded-full border border-border/50 object-cover"
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

type TaskLinearTableProps = {
  issues: LinearIssuePayload[];
  busyId: string | null;
  onCreateWorkspace: (issue: LinearIssuePayload) => void;
  onLinkOrCreate: (issue: LinearIssuePayload) => void;
};

/**
 * Linear issue list — flex layout (same pattern as TaskGithubTable).
 * Fixed header; only the row list scrolls. No per-row dividers; outer card border.
 */
export function TaskLinearTable({
  issues,
  busyId,
  onCreateWorkspace,
  onLinkOrCreate,
}: TaskLinearTableProps) {
  const t = useTranslations("appShell.task.linear");
  const locale = useLocale();
  const relativeTimeLocale = locale.startsWith("zh") ? zhCN : enUS;

  const priorityColClass = "w-8 shrink-0";
  const assigneesColClass = "w-10 shrink-0";
  const updatedColClass = "w-[7.5rem] shrink-0";
  const actionColClass = "w-[6.5rem] shrink-0";

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border/70">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground">
        <div
          className={cn(priorityColClass, "text-center")}
          title={t("table.priority")}
          aria-label={t("table.priority")}
        />
        <div className="min-w-0 flex-1">{t("table.issue")}</div>
        <div
          className={cn(assigneesColClass, "text-center")}
          title={t("table.assignee")}
          aria-label={t("table.assignee")}
        />
        <div className={cn(updatedColClass, "hidden text-right sm:block")}>
          {t("table.updatedAt")}
        </div>
        <div className={cn(actionColClass, "text-right")}>{t("table.action")}</div>
      </div>

      {/* Rows */}
      <ul className="m-0 min-h-0 min-w-0 flex-1 list-none overflow-y-auto overscroll-contain p-0">
        {issues.map((issue) => {
          const timeLabel = issue.updated_at
            ? formatDistanceToNow(new Date(issue.updated_at), {
                addSuffix: true,
                locale: relativeTimeLocale,
              })
            : null;

          return (
            <li key={issue.id}>
              <div className="group flex min-w-0 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50">
                <div className={cn(priorityColClass, "flex justify-center")}>
                  <PriorityMark priority={issue.priority} />
                </div>

                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <StatusIcon stateType={issue.state_type} />
                    <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                      {issue.identifier}
                    </span>
                    <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
                      {issue.title}
                    </span>
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-x-1.5 overflow-hidden text-[11px] text-muted-foreground">
                    {issue.state_name ? (
                      <span className="shrink-0 truncate">{issue.state_name}</span>
                    ) : null}
                    {issue.project_name ? (
                      <>
                        <span className="shrink-0 text-border">·</span>
                        <span className="min-w-0 truncate">{issue.project_name}</span>
                      </>
                    ) : null}
                    {(issue.labels ?? []).slice(0, 2).map((label) => (
                      <span
                        key={label.name}
                        className="hidden max-w-[4.5rem] shrink-0 truncate rounded-full border border-border/60 px-1.5 py-px text-[10px] font-medium md:inline-block"
                      >
                        {label.name}
                      </span>
                    ))}
                    {issue.github_refs?.slice(0, 1).map((ref) => (
                      <a
                        key={ref.url}
                        href={ref.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hidden shrink-0 rounded px-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground md:inline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        #{ref.number}
                      </a>
                    ))}
                  </div>
                </div>

                <div className={cn(assigneesColClass, "flex items-center justify-center")}>
                  <AssigneeAvatar
                    name={issue.assignee?.name}
                    avatarUrl={issue.assignee?.avatar_url}
                  />
                </div>

                <div
                  className={cn(
                    updatedColClass,
                    "hidden truncate text-right text-[11px] tabular-nums text-muted-foreground sm:block",
                  )}
                  title={
                    issue.updated_at
                      ? new Date(issue.updated_at).toLocaleString(locale)
                      : undefined
                  }
                >
                  {timeLabel ?? "—"}
                </div>

                <div className={cn(actionColClass, "flex items-center justify-end gap-0.5")}>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-[11px] font-medium text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
                    disabled={busyId === issue.id}
                    onClick={() => onCreateWorkspace(issue)}
                    title={t("createWorkspace")}
                    aria-label={t("createWorkspace")}
                  >
                    <Rocket className="size-3.5" />
                    <span className="hidden sm:inline">{t("create")}</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-1.5 text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
                    disabled={busyId === issue.id}
                    onClick={() => onLinkOrCreate(issue)}
                    title={t("linkOrCreate")}
                    aria-label={t("linkOrCreate")}
                  >
                    <Link2 className="size-3.5" />
                  </Button>
                  <a
                    href={issue.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t("openInLinear")}
                    aria-label={t("openInLinear")}
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
