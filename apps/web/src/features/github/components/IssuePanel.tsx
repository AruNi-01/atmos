"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { useGithubIssuePage } from "@/features/github/hooks/use-github";
import {
  GithubAssigneesFilter,
  GithubLabelsFilter,
} from "@/features/github/components/GithubMetadataFilters";
import { GithubListPagination } from "@/features/github/components/GithubListPagination";
import { GithubUserAvatar } from "@/features/github/components/GithubUserHoverCard";

interface IssuePanelProps {
  owner: string;
  repo: string;
  state: "open" | "closed";
  onStateChange?: (state: "open" | "closed") => void;
  enabled?: boolean;
  onIssueClick: (issueNumber: number, title: string) => void;
  onLoadingChange?: (loading: boolean) => void;
}

export const IssuePanel = React.forwardRef<
  { refresh: () => Promise<void> },
  IssuePanelProps
>(function IssuePanel(
  { owner, repo, state, onStateChange, enabled = true, onIssueClick, onLoadingChange },
  ref,
) {
  const locale = useLocale();
  const t = useTranslations("github.issuePanel");
  const relativeTimeLocale = locale.startsWith("zh") ? zhCN : enUS;
  const [page, setPage] = React.useState(1);
  const { data: issuePage, loading, refreshing, refresh } = useGithubIssuePage({
    owner,
    repo,
    state,
    page,
    enabled,
  });
  const [selectedLabels, setSelectedLabels] = React.useState<string[]>([]);
  const [selectedAssignees, setSelectedAssignees] = React.useState<string[]>(
    [],
  );
  const issues = issuePage.items;

  React.useEffect(() => {
    onLoadingChange?.(loading || refreshing);
  }, [loading, onLoadingChange, refreshing]);

  React.useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  React.useEffect(() => {
    setPage(1);
  }, [selectedAssignees, selectedLabels, state]);

  const filteredIssues = React.useMemo(
    () =>
      issues.filter((issue) => {
        const labelNames = new Set(issue.labels.map((label) => label.name));
        const assigneeNames = new Set(
          issue.assignees.map((assignee) => assignee.login),
        );
        return (
          selectedLabels.every((label) => labelNames.has(label)) &&
          selectedAssignees.every((assignee) => assigneeNames.has(assignee))
        );
      }),
    [issues, selectedAssignees, selectedLabels],
  );
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden">
      <div className="flex h-7 shrink-0 items-center gap-0.5 overflow-hidden px-2">
        <Select
          value={state}
          onValueChange={(value) => onStateChange?.(value as "open" | "closed")}
        >
          <SelectTrigger
            size="sm"
            className="!h-6 w-auto min-w-0 gap-1 px-2 py-0 text-[11px] shadow-none [&_svg:not([class*='size-'])]:size-3"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open" className="text-[11px]">
              {t("statusOpen")}
            </SelectItem>
            <SelectItem value="closed" className="text-[11px]">
              {t("statusClosed")}
            </SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <GithubAssigneesFilter
            owner={owner}
            repo={repo}
            selected={selectedAssignees}
            onSelectedChange={setSelectedAssignees}
            labels={{
              trigger: t("assignees"),
              search: t("filterAssignees"),
              empty: t("noAssignees"),
              clear: t("clearAssignees"),
            }}
          />
          <GithubLabelsFilter
            owner={owner}
            repo={repo}
            selected={selectedLabels}
            onSelectedChange={setSelectedLabels}
            labels={{
              trigger: t("labels"),
              search: t("filterLabels"),
              empty: t("noLabels"),
              clear: t("clearLabels"),
            }}
          />
        </div>
      </div>
      {/* Inset divider under issue filters */}
      <div
        className="mx-3 h-px shrink-0 bg-sidebar-border"
        role="separator"
        aria-hidden
      />

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2 pt-0">
        {loading ? (
          <div className="flex min-h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center text-center text-xs text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          <div className="min-w-0 space-y-1">
            {filteredIssues.map((issue) => {
              return (
                <div
                  key={issue.number}
                  role="button"
                  tabIndex={0}
                  onClick={() => onIssueClick(issue.number, issue.title)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onIssueClick(issue.number, issue.title);
                    }
                  }}
                  className="group flex w-full min-w-0 cursor-pointer flex-col gap-2 rounded-md border border-sidebar-border px-3 py-2.5 text-left hover:bg-sidebar-accent/50"
                >
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <span className="min-w-0 flex-1 line-clamp-2 text-[13px] font-medium leading-snug group-hover:text-primary">
                      {issue.title}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      #{issue.number}
                    </span>
                  </div>
                  <div className="flex min-h-4 flex-wrap items-center gap-1.5">
                    {issue.labels.slice(0, 3).map((label) => (
                      <span
                        key={label.name}
                        className="max-w-24 truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: label.color
                            ? `#${label.color.replace(/^#/, "")}20`
                            : undefined,
                          color: label.color
                            ? `#${label.color.replace(/^#/, "")}`
                            : undefined,
                        }}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5">
                    {issue.author?.login ? (
                      <GithubUserAvatar
                        username={issue.author.login}
                        avatarUrl={issue.author.avatar_url}
                        className="size-4 border border-border/50"
                        fallbackClassName="text-[6px]"
                      />
                    ) : null}
                    {issue.updated_at ? (
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(issue.updated_at), {
                          addSuffix: true,
                          locale: relativeTimeLocale,
                        })}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {filteredIssues.length ? (
          <GithubListPagination
            page={page}
            hasMore={issuePage.has_more}
            onPageChange={setPage}
            previousLabel={t("previousPage")}
            nextLabel={t("nextPage")}
          />
        ) : null}
      </div>
    </div>
  );
});
