"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, cn } from "@workspace/ui";
import {
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  Github,
  Loader2,
  Rocket,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import type { LinearIssuePayload } from "@atmos/api-types/ws/dto/linear";

export type TaskLinearTableBodyState =
  | "ready"
  | "loading"
  | "empty"
  | "error";

/**
 * Priority cell: Linear 0 = no priority.
 * Fixed min-width + nowrap so "---" never wraps to "--" / "-".
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

/**
 * Linear workflow state type → icon (status lives as the icon before the title,
 * not as a text badge under the row — matches Linear list UI).
 *
 * Types: backlog | unstarted | started | completed | canceled
 */
function LinearStatusIcon({
  stateType,
  stateName,
}: {
  stateType?: string | null;
  stateName?: string | null;
}) {
  const type = (stateType ?? "").toLowerCase();
  const name = (stateName ?? "").toLowerCase();
  const title = stateName?.trim() || stateType?.trim() || "Status";
  const base = "size-3.5 shrink-0";

  const icon = (() => {
    if (type === "completed" || name === "done") {
      return <CheckCircle2 className={cn(base, "text-indigo-400")} aria-hidden />;
    }
    if (
      type === "canceled" ||
      name.includes("cancel") ||
      name.includes("duplicate")
    ) {
      return (
        <XCircle
          className={cn(base, "text-muted-foreground/70")}
          aria-hidden
        />
      );
    }
    if (type === "started") {
      // In Review is still type=started in Linear; use green ring like Linear.
      if (name.includes("review")) {
        return (
          <CircleDot className={cn(base, "text-emerald-500")} aria-hidden />
        );
      }
      // In Progress — yellow partial circle (Linear-like).
      return (
        <span className="relative inline-flex size-3.5 shrink-0 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-[1.5px] border-yellow-500/90" />
          <span
            className="absolute inset-0 overflow-hidden rounded-full"
            style={{ clipPath: "inset(0 50% 0 0)" }}
          >
            <span className="absolute inset-0 rounded-full bg-yellow-500/90" />
          </span>
        </span>
      );
    }
    if (type === "backlog") {
      return (
        <CircleDashed className={cn(base, "text-muted-foreground")} aria-hidden />
      );
    }
    // unstarted / Todo / default
    return <Circle className={cn(base, "text-muted-foreground")} aria-hidden />;
  })();

  return (
    <span className="inline-flex shrink-0" title={title} aria-label={title}>
      {icon}
    </span>
  );
}

function LabelChip({
  name,
  color,
}: {
  name: string;
  color?: string | null;
}) {
  const raw = color?.trim() ?? "";
  const hex = raw
    ? raw.startsWith("#")
      ? raw
      : `#${raw}`
    : null;
  return (
    <span
      className={cn(
        "inline-flex max-w-[5.5rem] shrink-0 truncate rounded-full px-1.5 py-px text-[10px] font-medium",
        !hex && "border border-border/60 bg-muted/40 text-muted-foreground",
      )}
      style={
        hex
          ? {
              backgroundColor: `${hex}26`,
              color: hex,
              boxShadow: `inset 0 0 0 1px ${hex}40`,
            }
          : undefined
      }
      title={name}
    >
      {name}
    </span>
  );
}

function AssigneeAvatar({
  name,
  avatarUrl,
}: {
  name?: string | null;
  avatarUrl?: string | null;
}) {
  if (!name && !avatarUrl) {
    return (
      <span
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-border/60 text-[10px] text-muted-foreground/50"
        aria-hidden
      />
    );
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
  onCreateWorkspace: (issue: LinearIssuePayload) => void;
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
  onCreateWorkspace,
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
      <ul className="m-0 min-h-0 min-w-0 flex-1 list-none overflow-y-auto overscroll-contain p-0">
        {issues.map((issue) => {
          const createdLabel = formatShortDate(issue.created_at, locale);
          const updatedLabel = formatShortDate(issue.updated_at, locale);
          const labels = issue.labels ?? [];
          const githubRefs = issue.github_refs ?? [];

          return (
            <li key={issue.id}>
              <div className="group flex min-w-0 items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/40">
                <div className={cn(priorityColClass, "flex justify-center")}>
                  <PriorityMark priority={issue.priority} />
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
                        <LabelChip
                          key={label.name}
                          name={label.name}
                          color={label.color}
                        />
                      ))}
                      {labels.length > 3 ? (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          +{labels.length - 3}
                        </span>
                      ) : null}
                      {githubRefs.slice(0, 2).map((ref) => (
                        <a
                          key={ref.url}
                          href={ref.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex shrink-0 items-center gap-0.5 rounded px-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                          title={`${ref.owner}/${ref.repo}#${ref.number}`}
                        >
                          <Github className="size-3 opacity-70" aria-hidden />
                          <span>#{ref.number}</span>
                        </a>
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
                  <AssigneeAvatar
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
                >
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
