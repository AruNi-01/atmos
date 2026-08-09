"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, cn } from "@workspace/ui";
import {
  ArrowRight,
  CircleDot,
  GitMerge,
  GitPullRequest,
  MessageSquare,
  Rocket,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import type {
  GithubLinkedRefPayload,
  GithubSearchItemPayload,
} from "@/api/ws/github-api";
import { ChecksStatusRing } from "@/features/github/components/ChecksStatusRing";
import type { StatusCheck } from "@/features/github/lib/pr-detail-parts";
import { GithubUserAvatar } from "@/features/github/components/GithubUserHoverCard";
import type { LinkedWorkspaceMatch } from "@/features/task/lib/find-linked-workspace";

function authorAvatarUrl(author?: { login?: string; avatar_url?: string | null } | null) {
  if (author?.avatar_url?.trim()) return author.avatar_url.trim();
  const login = author?.login?.trim().replace(/^@/, "");
  if (!login) return null;
  return `https://github.com/${encodeURIComponent(login)}.png?size=40`;
}

function StatusIcon({ item }: { item: GithubSearchItemPayload }) {
  const isPr = item.kind === "pr" || Boolean(item.head_ref);
  const state = item.state.toLowerCase();
  if (isPr) {
    if (state === "merged") {
      return <GitMerge className="size-4 shrink-0 text-purple-500" aria-hidden />;
    }
    if (state === "closed") {
      return <GitPullRequest className="size-4 shrink-0 text-red-500/80" aria-hidden />;
    }
    return (
      <GitPullRequest
        className={cn(
          "size-4 shrink-0",
          item.is_draft ? "text-muted-foreground" : "text-emerald-500",
        )}
        aria-hidden
      />
    );
  }
  if (state === "closed") {
    return <XCircle className="size-4 shrink-0 text-purple-500" aria-hidden />;
  }
  return <CircleDot className="size-4 shrink-0 text-emerald-500" aria-hidden />;
}

function toStatusChecks(item: GithubSearchItemPayload): StatusCheck[] {
  return (item.status_checks ?? []).map((check) => ({
    state: check.state ?? undefined,
    conclusion: check.conclusion ?? undefined,
    status: check.status ?? undefined,
    name: check.name ?? undefined,
    context: check.context ?? undefined,
    detailsUrl: check.details_url ?? undefined,
    targetUrl: check.target_url ?? undefined,
    workflowName: check.workflow_name ?? undefined,
  }));
}

type AssigneeLike = { login?: string; avatar_url?: string | null };

/** Max stacked avatars before “+N” overflow chip. */
const MAX_STACKED_ASSIGNEES = 4;

/** Max linked chips shown before “+N”. */
const MAX_LINKED_REFS = 3;

function LinkedRefsCell({
  refs,
  onOpen,
}: {
  refs: GithubLinkedRefPayload[];
  onOpen?: (ref: GithubLinkedRefPayload) => void;
}) {
  if (refs.length === 0) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }

  const visible = refs.slice(0, MAX_LINKED_REFS);
  const overflow = refs.length - visible.length;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-0.5">
      {visible.map((ref) => {
        const isPr = ref.kind === "pr";
        const state = (ref.state ?? "").toLowerCase();
        const iconClass = cn(
          "size-3 shrink-0",
          isPr
            ? state === "merged"
              ? "text-purple-500"
              : state === "closed"
                ? "text-red-500/80"
                : "text-emerald-500"
            : state === "closed"
              ? "text-purple-500"
              : "text-emerald-500",
        );
        const Icon = isPr
          ? state === "merged"
            ? GitMerge
            : GitPullRequest
          : state === "closed"
            ? XCircle
            : CircleDot;
        const label = `#${ref.number}`;
        const title = ref.title ? `${label} ${ref.title}` : label;
        return (
          <button
            key={`${ref.kind}:${ref.number}`}
            type="button"
            title={title}
            aria-label={title}
            className="inline-flex items-center gap-0.5 rounded px-0.5 py-px text-[11px] font-mono tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onOpen?.(ref);
            }}
          >
            <Icon className={iconClass} aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
      {overflow > 0 ? (
        <span
          className="text-[10px] tabular-nums text-muted-foreground"
          title={refs
            .slice(MAX_LINKED_REFS)
            .map((r) => `#${r.number}`)
            .join(", ")}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Assignees column cell:
 * - 0 → "—"
 * - 1 → avatar + login
 * - 2+ → overlapping avatars only (later ones cover half of earlier)
 */
function AssigneesCell({ assignees }: { assignees: AssigneeLike[] }) {
  if (assignees.length === 0) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }

  if (assignees.length === 1) {
    const a = assignees[0]!;
    const login = a.login!.trim();
    return (
      <GithubUserAvatar
        username={login}
        avatarUrl={authorAvatarUrl(a)}
        label={login}
        labelClassName="max-w-[4.5rem] truncate text-[11px] text-muted-foreground"
        className="size-5 shrink-0 border border-border/50"
        fallbackClassName="text-[7px]"
        triggerClassName="inline-flex min-w-0 max-w-full items-center gap-1.5"
      />
    );
  }

  const visible = assignees.slice(0, MAX_STACKED_ASSIGNEES);
  const overflow = assignees.length - visible.length;
  const names = assignees.map((a) => a.login).filter(Boolean).join(", ");

  return (
    <div
      className="flex items-center"
      title={names}
      aria-label={names}
    >
      {visible.map((a, index) => {
        const login = a.login!.trim();
        return (
          <div
            key={login}
            className={cn("relative shrink-0", index > 0 && "-ml-2")}
            style={{ zIndex: index + 1 }}
          >
            <GithubUserAvatar
              username={login}
              avatarUrl={authorAvatarUrl(a)}
              className="size-5 border-2 border-background"
              fallbackClassName="text-[7px]"
              triggerClassName="inline-flex"
            />
          </div>
        );
      })}
      {overflow > 0 ? (
        <span
          className="-ml-1.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-medium tabular-nums text-muted-foreground"
          style={{ zIndex: visible.length + 1 }}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

type TaskGithubTableProps = {
  items: GithubSearchItemPayload[];
  kind: "issues" | "prs";
  onOpenItem: (item: GithubSearchItemPayload) => void;
  /** Open a linked issue/PR from the Linked column (same owner/repo as the row). */
  onOpenLinkedRef?: (
    parent: GithubSearchItemPayload,
    ref: GithubLinkedRefPayload,
  ) => void;
  onCreateWorkspace: (item: GithubSearchItemPayload) => void;
  onEnterWorkspace: (workspaceId: string) => void;
  /** Resolve existing workspace for a row (explicit GitHub link or PR branch). */
  resolveLinkedWorkspace: (item: GithubSearchItemPayload) => LinkedWorkspaceMatch | null;
};

/**
 * Task GitHub list — flex layout (not shadcn Table) so the row never grows past
 * the panel width (Table wraps `overflow-auto` and caused horizontal scroll).
 * Fills parent height; header stays put, only the row list scrolls.
 * No per-row dividers; only the outer card border.
 */
export function TaskGithubTable({
  items,
  kind,
  onOpenItem,
  onOpenLinkedRef,
  onCreateWorkspace,
  onEnterWorkspace,
  resolveLinkedWorkspace,
}: TaskGithubTableProps) {
  const t = useTranslations("appShell.task.github");
  const locale = useLocale();
  const relativeTimeLocale = locale.startsWith("zh") ? zhCN : enUS;
  const showCi = kind === "prs";

  // Fixed right columns: leave title flex room; compact action CTAs.
  const checksColClass = "w-14 shrink-0 text-center";
  // Wide enough for single assignee (avatar + login) or a short stack.
  const assigneesColClass = "w-[7rem] shrink-0";
  // Icon + #number chips (may wrap a few links).
  const linkedColClass = "w-[5.5rem] shrink-0";
  const commentsColClass = "w-12 shrink-0";
  const updatedColClass = "w-[7.5rem] shrink-0";
  const actionColClass = "w-[5.5rem] shrink-0";

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border/70">
      {/* Header — fixed within the table card */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground">
        <div className="w-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          {kind === "issues" ? t("tabs.issues") : t("tabs.pullRequests")}
        </div>
        {showCi ? (
          <div className={checksColClass}>{t("table.checks")}</div>
        ) : null}
        <div className={cn(assigneesColClass, "truncate")}>{t("table.assignees")}</div>
        <div className={cn(linkedColClass, "truncate")}>{t("table.linked")}</div>
        <div
          className={cn(commentsColClass, "flex items-center justify-center")}
          title={t("table.comments")}
        >
          <MessageSquare className="size-3.5" aria-label={t("table.comments")} />
        </div>
        <div className={cn(updatedColClass, "text-right")}>{t("table.updatedAt")}</div>
        <div className={cn(actionColClass, "text-right")}>{t("table.action")}</div>
      </div>

      {/* Rows — scroll inside the card so outer filters/pagination stay fixed */}
      <ul className="m-0 min-h-0 min-w-0 flex-1 list-none overflow-y-auto overscroll-contain p-0">
        {items.map((item) => {
          const fullName = `${item.owner}/${item.repo}`;
          const login = item.author?.login ?? null;
          const avatarUrl = authorAvatarUrl(item.author);
          const assignees = (item.assignees ?? []).filter((a) => a.login?.trim());
          const comments = item.comments_count ?? 0;
          const linked = resolveLinkedWorkspace(item);
          const checks = showCi ? toStatusChecks(item) : [];
          const timeLabel = item.updated_at
            ? formatDistanceToNow(new Date(item.updated_at), {
                addSuffix: true,
                locale: relativeTimeLocale,
              })
            : null;

          return (
            <li key={`${item.kind}:${fullName}#${item.number}`}>
              <div
                role="button"
                tabIndex={0}
                className="group flex min-w-0 cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => onOpenItem(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenItem(item);
                  }
                }}
              >
                <div className="flex w-5 shrink-0 justify-center">
                  <StatusIcon item={item} />
                </div>

                <div className="min-w-0 flex-1 overflow-hidden">
                  {/* Title row: #number + title + Draft badge */}
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 font-mono text-[13px] tabular-nums text-muted-foreground">
                      #{item.number}
                    </span>
                    <span className="min-w-0 truncate text-[13px] font-medium text-foreground group-hover:text-primary">
                      {item.title}
                    </span>
                    {item.is_draft ? (
                      <span className="shrink-0 rounded border border-border px-1 py-px text-[10px] leading-none text-muted-foreground">
                        {t("draft")}
                      </span>
                    ) : null}
                  </div>

                  {/* Meta: repo · labels · avatar user */}
                  <div className="mt-0.5 flex min-w-0 items-center gap-x-1.5 overflow-hidden text-[11px] text-muted-foreground">
                    <span className="min-w-0 truncate font-medium text-foreground/70">
                      {fullName}
                    </span>
                    {(item.labels ?? []).slice(0, 2).map((label) => (
                      <span
                        key={label.name}
                        className="hidden max-w-[4.5rem] shrink-0 truncate rounded-full px-1.5 py-px text-[10px] font-medium md:inline-block"
                        style={{
                          backgroundColor: label.color
                            ? `#${label.color.replace(/^#/, "")}20`
                            : "var(--muted)",
                          color: label.color
                            ? `#${label.color.replace(/^#/, "")}`
                            : "var(--muted-foreground)",
                        }}
                      >
                        {label.name}
                      </span>
                    ))}
                    {login ? (
                      <span className="inline-flex min-w-0 shrink-0 items-center gap-1">
                        <span className="shrink-0 text-border">·</span>
                        {/* label shares the same hover hit area as the avatar */}
                        <GithubUserAvatar
                          username={login}
                          avatarUrl={avatarUrl}
                          label={login}
                          labelClassName="hidden max-w-[6rem] sm:inline"
                          className="size-3.5 shrink-0 border border-border/50"
                          fallbackClassName="text-[6px]"
                          triggerClassName="inline-flex min-w-0 shrink-0 items-center gap-1"
                        />
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* CI ring (PRs only) — left of assignees, matching GitHub list */}
                {showCi ? (
                  <div
                    className={cn(checksColClass, "flex items-center justify-center")}
                    title={t("table.checks")}
                  >
                    {checks.length > 0 ? (
                      <ChecksStatusRing checks={checks} size={16} strokeWidth={2.25} />
                    ) : (
                      <span className="size-4" aria-hidden />
                    )}
                  </div>
                ) : null}

                {/* Assignees — before linked / comments */}
                <div
                  className={cn(assigneesColClass, "flex min-w-0 items-center")}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <AssigneesCell assignees={assignees} />
                </div>

                {/* Linked issues (on PR) / linked PRs (on issue) */}
                <div
                  className={cn(linkedColClass, "flex min-w-0 items-center")}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <LinkedRefsCell
                    refs={item.linked_refs ?? []}
                    onOpen={(ref) => onOpenLinkedRef?.(item, ref)}
                  />
                </div>

                <div
                  className={cn(
                    commentsColClass,
                    "flex items-center justify-center gap-0.5 text-[11px] tabular-nums text-muted-foreground",
                  )}
                >
                  <MessageSquare className="size-3.5 shrink-0 opacity-70" />
                  {comments}
                </div>

                <div
                  className={cn(
                    updatedColClass,
                    "truncate text-right text-[11px] tabular-nums text-muted-foreground",
                  )}
                  title={
                    item.updated_at
                      ? new Date(item.updated_at).toLocaleString(locale)
                      : undefined
                  }
                >
                  {timeLabel ?? "—"}
                </div>

                <div
                  className={cn(actionColClass, "flex justify-end")}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {linked ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 whitespace-nowrap gap-1.5 px-2 text-[11px] font-medium text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
                      onClick={() => onEnterWorkspace(linked.workspace.id)}
                      title={t("enterWorkspace")}
                      aria-label={t("enterWorkspace")}
                    >
                      <ArrowRight className="size-3.5 shrink-0" />
                      <span>{t("enter")}</span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 whitespace-nowrap gap-1.5 border-border/70 px-2 text-[11px] font-medium text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
                      onClick={() => onCreateWorkspace(item)}
                      title={t("createWorkspace")}
                      aria-label={t("createWorkspace")}
                    >
                      <Rocket className="size-3.5 shrink-0" />
                      <span>{t("create")}</span>
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
