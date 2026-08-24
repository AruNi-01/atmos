"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  Drawer,
  DrawerCloseButton,
  DrawerCloseReserveProvider,
  DrawerContentBare,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  cn,
  drawerCloseReserveClass,
} from "@workspace/ui";
import {
  ArrowRight,
  CalendarPlus,
  CalendarClock,
  ExternalLink,
  FolderKanban,
  Github,
  Rocket,
  Signal,
  Tag,
  UserRound,
} from "lucide-react";
import { LinearIcon } from "@workspace/ui/components/icons/linear-icon";
import type {
  LinearGithubRefPayload,
  LinearIssuePayload,
} from "@atmos/api-types/ws/dto/linear";
import { useTaskDrawerInsets } from "@/features/task/components/task-github-drawer/use-task-drawer-insets";
import {
  LinearAssigneeAvatar,
  LinearLabelChip,
  LinearPriorityMark,
  LinearStatusIcon,
  linearPriorityLabelKey,
} from "@/features/task/components/task-linear-visuals";
import { format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";

export type TaskLinearDrawerController = {
  openIssue: (issue: LinearIssuePayload) => void;
  close: () => void;
  isOpen: boolean;
};

type TaskLinearDrawerProps = {
  controllerRef?: React.MutableRefObject<TaskLinearDrawerController | null>;
  onCreateWorkspace: (issue: LinearIssuePayload) => void;
  onEnterWorkspace: (workspaceId: string) => void;
  resolveLinkedWorkspaceId: (issue: LinearIssuePayload) => string | null;
  /** Open linked GitHub issue/PR in Atmos Task drawer (not external browser). */
  onOpenGithubRef?: (ref: LinearGithubRefPayload) => void;
};

function MetaRow({
  icon,
  label,
  children,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center justify-between gap-3",
        className,
      )}
    >
      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/80 [&>svg]:size-3.5">
          {icon}
        </span>
        <span>{label}</span>
      </span>
      <div className="flex min-w-0 items-center justify-end gap-1.5 text-right font-medium text-foreground">
        {children}
      </div>
    </div>
  );
}

/**
 * Right drawer for a Linear issue from the Task list.
 * Surfaces the same fields as the list row (priority, status, labels, project, …) with icons.
 */
export function TaskLinearDrawer({
  controllerRef,
  onCreateWorkspace,
  onEnterWorkspace,
  resolveLinkedWorkspaceId,
  onOpenGithubRef,
}: TaskLinearDrawerProps) {
  const t = useTranslations("appShell.task.linear");
  const locale = useLocale();
  const insets = useTaskDrawerInsets();
  const [issue, setIssue] = React.useState<LinearIssuePayload | null>(null);
  const [open, setOpen] = React.useState(false);

  const close = React.useCallback(() => {
    setOpen(false);
  }, []);

  React.useEffect(() => {
    if (!controllerRef) return;
    const controller: TaskLinearDrawerController = {
      openIssue: (next) => {
        setIssue(next);
        setOpen(true);
      },
      close,
      get isOpen() {
        return open;
      },
    };
    controllerRef.current = controller;
    return () => {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [close, controllerRef, open]);

  const linkedWorkspaceId = issue ? resolveLinkedWorkspaceId(issue) : null;
  const dateLocale = locale.startsWith("zh") ? zhCN : enUS;

  const formatWhen = (iso?: string | null) => {
    if (!iso) return null;
    try {
      return format(new Date(iso), "PPp", { locale: dateLocale });
    } catch {
      return iso;
    }
  };

  const sheetWidth = `calc(100vw - ${insets.left}px - ${insets.right}px - 48px)`;
  const contentStyle = {
    top: insets.top,
    right: insets.right,
    bottom: insets.bottom,
    width: sheetWidth,
    maxWidth: "min(720px, 100%)",
    height: "auto",
    zIndex: 50,
    ["--initial-transform" as string]: `calc(100% + ${insets.right}px)`,
  } as React.CSSProperties;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpen(false);
        }
      }}
      onAnimationEnd={(isOpen) => {
        if (!isOpen) setIssue(null);
      }}
      direction="right"
      handleOnly
      shouldScaleBackground
      dismissible
      modal
    >
      <DrawerPortal>
        <DrawerOverlay className="bg-black/40" style={{ zIndex: 50 }} />
        <DrawerContentBare
          className="fixed z-50 flex overflow-hidden rounded-xl border border-border/70 bg-background outline-none shadow-2xl"
          style={contentStyle}
        >
          <DrawerTitle className="sr-only">
            {issue
              ? `${issue.identifier} ${issue.title}`
              : t("drawer.titleFallback")}
          </DrawerTitle>

          <DrawerCloseReserveProvider>
            <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
              <DrawerCloseButton onClick={close} aria-label={t("drawer.close")} />

            {issue ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-5">
                  <div className={cn("mb-5 flex items-start gap-3", drawerCloseReserveClass)}>
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground">
                      <LinearIcon className="size-5" size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* Identifier + linked GitHub only (status/priority live in meta below) */}
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <a
                          href={issue.url}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {issue.identifier}
                        </a>
                        {(issue.github_refs?.length ?? 0) > 0
                          ? issue.github_refs.map((ref) => (
                              <button
                                key={ref.url}
                                type="button"
                                className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-muted/25 px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted/50"
                                title={`${ref.owner}/${ref.repo}#${ref.number}`}
                                onClick={() => {
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
                              >
                                <Github className="size-3 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 truncate font-mono">
                                  {ref.owner}/{ref.repo}#{ref.number}
                                </span>
                              </button>
                            ))
                          : null}
                      </div>
                      <h2 className="mt-1.5 text-lg font-semibold leading-snug text-foreground">
                        {issue.title}
                      </h2>
                    </div>
                  </div>

                  <div className="mb-6 space-y-2.5 rounded-lg border border-border/60 bg-muted/15 px-3 py-3 text-xs">
                    {/* Status + Assignee */}
                    <div className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4">
                      <MetaRow
                        icon={
                          <LinearStatusIcon
                            stateType={issue.state_type}
                            stateName={issue.state_name}
                          />
                        }
                        label={t("drawer.status")}
                      >
                        <span className="truncate">
                          {issue.state_name?.trim() ||
                            issue.state_type?.trim() ||
                            "—"}
                        </span>
                      </MetaRow>
                      <MetaRow
                        icon={<UserRound className="size-3.5" aria-hidden />}
                        label={t("table.assignee")}
                      >
                        <LinearAssigneeAvatar
                          name={issue.assignee?.name}
                          avatarUrl={issue.assignee?.avatar_url}
                        />
                        <span className="min-w-0 truncate">
                          {issue.assignee?.name?.trim() ||
                            t("drawer.unassigned")}
                        </span>
                      </MetaRow>
                    </div>

                    {/* Priority + Project */}
                    <div className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4">
                      <MetaRow
                        icon={<Signal className="size-3.5" aria-hidden />}
                        label={t("table.priority")}
                      >
                        <LinearPriorityMark priority={issue.priority} />
                        <span className="truncate">
                          {t(linearPriorityLabelKey(issue.priority))}
                        </span>
                      </MetaRow>
                      <MetaRow
                        icon={<FolderKanban className="size-3.5" aria-hidden />}
                        label={t("drawer.project")}
                      >
                        <span className="truncate">
                          {issue.project_name?.trim() || t("drawer.noProject")}
                        </span>
                      </MetaRow>
                    </div>

                    {/* Created + Updated */}
                    <div className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4">
                      <MetaRow
                        icon={<CalendarPlus className="size-3.5" aria-hidden />}
                        label={t("table.createdAt")}
                      >
                        <span className="truncate">
                          {formatWhen(issue.created_at) ?? "—"}
                        </span>
                      </MetaRow>
                      <MetaRow
                        icon={
                          <CalendarClock className="size-3.5" aria-hidden />
                        }
                        label={t("table.updatedAt")}
                      >
                        <span className="truncate">
                          {formatWhen(issue.updated_at) ?? "—"}
                        </span>
                      </MetaRow>
                    </div>

                    {/* Labels last */}
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-muted-foreground">
                        <Tag className="size-3.5 shrink-0 text-muted-foreground/80" />
                        <span>{t("drawer.labels")}</span>
                      </span>
                      {(issue.labels?.length ?? 0) > 0 ? (
                        <div className="flex min-w-0 flex-wrap justify-end gap-1">
                          {issue.labels.map((label) => (
                            <LinearLabelChip
                              key={label.name}
                              name={label.name}
                              color={label.color}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="font-medium text-muted-foreground">
                          {t("drawer.noLabels")}
                        </span>
                      )}
                    </div>
                  </div>

                  <section className="mb-2">
                    <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                      {t("drawer.description")}
                    </h3>
                    {issue.description?.trim() ? (
                      <div className="rounded-lg border border-border/60 bg-background px-3 py-3">
                        <MarkdownRenderer className="prose prose-sm max-w-none text-[13px] leading-relaxed dark:prose-invert prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2">
                          {issue.description.trim()}
                        </MarkdownRenderer>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("drawer.noDescription")}
                      </p>
                    )}
                  </section>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-2 bg-background px-5 pb-4 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      window.open(issue.url, "_blank", "noopener,noreferrer")
                    }
                  >
                    <ExternalLink className="size-3.5" />
                    {t("openInLinear")}
                  </Button>
                  {linkedWorkspaceId ? (
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        onEnterWorkspace(linkedWorkspaceId);
                        close();
                      }}
                    >
                      <ArrowRight className="size-3.5" />
                      {t("drawer.enterWorkspace")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        onCreateWorkspace(issue);
                        close();
                      }}
                    >
                      <Rocket className="size-3.5" />
                      {t("create")}
                    </Button>
                  )}
                </div>
              </>
            ) : null}
            </div>
          </DrawerCloseReserveProvider>
        </DrawerContentBare>
      </DrawerPortal>
    </Drawer>
  );
}
