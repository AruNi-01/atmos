"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TextShimmer,
  cn,
} from "@workspace/ui";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useProjectStore } from "@/features/project/store/use-project-store";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { WorkspaceSetupProgressView } from "@/features/workspace/components/WorkspaceSetupProgress";
import {
  useWorkspaceCreationStore,
  type WorkspaceCreateJob,
} from "@/features/workspace/store/workspace-creation-store";
import {
  getWorkspaceSetupPopoverWidth,
  getWorkspaceSetupProgressValue,
  getWorkspaceSetupSteps,
  isWorkspaceSetupBlocking,
} from "@/features/workspace/lib/workspace-setup";
import { WorkspaceStatusPopover } from "./WorkspaceStatusPopover";
import {
  HEADER_CHIP_HOVER_CLASS,
  HEADER_CHIP_SURFACE_CLASS,
} from "./header-parts";
import {
  collectHeaderWorkspaceSetupItems,
  isHeaderWorkspaceSetupReadyToOpen,
  selectHeaderWorkspaceSetupChipItem,
  visibleHeaderWorkspaceSetupItems,
  WORKSPACE_AUTO_ENTER_HOVER_LEAVE_MS,
  type HeaderWorkspaceSetupItem,
} from "./header-workspace-jobs";
import { useWorkspaceCreateAutoOpen } from "./use-workspace-create-auto-open";

const AUTO_ENTER_CHIP_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

function jobTitle(
  job: WorkspaceCreateJob,
  workspaceName: string | null,
  creatingFallback: string,
): string {
  return job.label || workspaceName || creatingFallback;
}

function itemTitle(
  item: HeaderWorkspaceSetupItem,
  workspaceNameById: Map<string, string>,
  creatingFallback: string,
): string {
  if (item.job) {
    return jobTitle(
      item.job,
      item.workspaceId ? workspaceNameById.get(item.workspaceId) ?? null : null,
      creatingFallback,
    );
  }
  if (item.workspaceId) {
    return workspaceNameById.get(item.workspaceId) || item.progress?.stepTitle || creatingFallback;
  }
  return item.progress?.stepTitle || creatingFallback;
}

function chipLabel(item: HeaderWorkspaceSetupItem, title: string): string {
  return item.progress?.stepTitle || title;
}

function AutoEnterChip({
  remainingSeconds,
  hovered,
  grouped,
  onStay,
  onEnter,
}: {
  remainingSeconds: number;
  hovered: boolean;
  grouped: boolean;
  onStay: () => void;
  onEnter: () => void;
}) {
  const t = useTranslations("header.workspaceJobs");
  const reduceMotion = useReducedMotion();
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  const transition = reduceMotion ? { duration: 0 } : AUTO_ENTER_CHIP_TRANSITION;

  React.useLayoutEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const update = () => setWidth(node.scrollWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [grouped, hovered, remainingSeconds]);

  return (
    <motion.div
      initial={reduceMotion ? { width, opacity: 1 } : { width: 0, opacity: 0 }}
      animate={{ width, opacity: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
      transition={transition}
      className="h-7 shrink-0 overflow-hidden"
    >
      <div
        ref={innerRef}
        className={cn(
          "flex h-7 w-max items-center rounded-md",
          HEADER_CHIP_SURFACE_CLASS,
          hovered ? "gap-1 px-1" : "px-2",
        )}
        role="status"
        aria-label={
          hovered
            ? grouped
              ? t("autoEnterStayAllAria")
              : t("autoEnterPausedAria")
            : t("autoEnterCountdownAria", { seconds: remainingSeconds })
        }
      >
        {hovered ? (
          <>
            <button
              type="button"
              onClick={onStay}
              className="inline-flex h-6 items-center rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {grouped ? t("autoEnterStayAll") : t("autoEnterStay")}
            </button>
            {grouped ? null : (
              <button
                type="button"
                onClick={onEnter}
                className="inline-flex h-6 items-center rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t("autoEnterNow")}
              </button>
            )}
          </>
        ) : (
          <span className="whitespace-nowrap text-[12px] font-medium tabular-nums">
            {t("autoEnterCountdown", { seconds: remainingSeconds })}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function SetupDetailPanel({
  item,
  title,
  isCurrent,
  nestedOpen,
  viewportWidth,
  onOpenWorkspace,
  onFinish,
  showHeader,
  autoEnterWorkspaceId,
  remainingSeconds,
}: {
  item: HeaderWorkspaceSetupItem;
  title: string;
  isCurrent: boolean;
  nestedOpen: boolean;
  viewportWidth: number;
  onOpenWorkspace?: (workspaceId: string, dismissSetup?: boolean) => void;
  onFinish: (workspaceId: string) => void;
  showHeader: boolean;
  autoEnterWorkspaceId?: string | null;
  remainingSeconds?: number;
}) {
  const t = useTranslations("header.workspaceJobs");
  const workspaceId = item.workspaceId;
  const enterable =
    !!workspaceId && !isWorkspaceSetupBlocking(item.progress ?? undefined) && !isCurrent;
  const detailWidth = item.progress
    ? getWorkspaceSetupPopoverWidth(getWorkspaceSetupSteps(item.progress).length, viewportWidth)
    : 360;

  return (
    <div
      style={{ width: Math.min(detailWidth, Math.max(280, viewportWidth - 24)) }}
      className="min-w-0 max-h-[min(72vh,var(--radix-popover-content-available-height))] overflow-y-auto"
    >
      {showHeader ? (
        <div className="flex items-center gap-1 px-3 pt-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{title}</span>
          {enterable && workspaceId && onOpenWorkspace ? (
            <Button type="button" size="xs" onClick={() => onOpenWorkspace(workspaceId)}>
              {t("autoEnterNow")}
            </Button>
          ) : workspaceId && workspaceId === autoEnterWorkspaceId ? (
            <span className="pr-1 text-[11px] tabular-nums text-muted-foreground">
              {t("autoEnterCountdown", { seconds: remainingSeconds ?? 0 })}
            </span>
          ) : null}
        </div>
      ) : null}
      {item.progress ? (
        <WorkspaceSetupProgressView
          progress={item.progress}
          onFinish={() => {
            if (item.workspaceId) onFinish(item.workspaceId);
          }}
          compact
          pauseAutoFinishEnabled={nestedOpen}
        />
      ) : (
        <div className="flex items-start gap-3 px-4 py-5">
          <Loader2 className="mt-0.5 size-4 animate-spin text-primary" />
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("creatingHint")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkspaceSetupListRow({
  item,
  title,
  isCurrent,
  viewportWidth,
  onOpenWorkspace,
  onFinish,
  autoEnterWorkspaceId,
  remainingSeconds,
}: {
  item: HeaderWorkspaceSetupItem;
  title: string;
  isCurrent: boolean;
  viewportWidth: number;
  onOpenWorkspace: (workspaceId: string, dismissSetup?: boolean) => void;
  onFinish: (workspaceId: string) => void;
  autoEnterWorkspaceId: string | null;
  remainingSeconds: number;
}) {
  const t = useTranslations("header.workspaceJobs");
  const [open, setOpen] = React.useState(false);
  const workspaceId = item.workspaceId;
  const ready = isHeaderWorkspaceSetupReadyToOpen(item);
  const enterable =
    !!workspaceId && !isWorkspaceSetupBlocking(item.progress ?? undefined) && !isCurrent;
  const percent =
    !ready && item.progress ? Math.round(getWorkspaceSetupProgressValue(item.progress)) : null;
  const stepLabel = ready
    ? t("ready")
    : item.progress?.stepTitle ?? (workspaceId ? t("preparing") : t("creating"));
  const showCountdown = workspaceId != null && workspaceId === autoEnterWorkspaceId;

  const rowButton = (rowOpen: boolean) => (
    <button
      type="button"
      className={cn(
        "flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left",
        rowOpen ? "bg-muted" : "hover:bg-muted/70",
      )}
      onClick={ready && workspaceId ? () => onOpenWorkspace(workspaceId, true) : undefined}
    >
      {ready ? (
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
      ) : (
        <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {percent != null ? (
            <span className="tabular-nums text-[11px] text-muted-foreground">{percent}%</span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {stepLabel}
          {showCountdown ? ` · ${t("autoEnterCountdown", { seconds: remainingSeconds })}` : ""}
        </span>
      </span>
    </button>
  );

  const enterNowButton =
    enterable && workspaceId ? (
      <button
        type="button"
        className="mt-1.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
        onClick={() => onOpenWorkspace(workspaceId, ready)}
      >
        {t("autoEnterNow")}
      </button>
    ) : null;

  if (ready) {
    return (
      <div className="flex min-w-0 items-start gap-1">
        <div className="min-w-0 flex-1">{rowButton(false)}</div>
        {enterNowButton}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-start gap-1">
      <div className="min-w-0 flex-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{rowButton(open)}</PopoverTrigger>
          <PopoverContent
            align="start"
            side="right"
            sideOffset={8}
            collisionPadding={12}
            data-header-setup-nested=""
            className="w-auto max-w-[calc(100vw-24px)] overflow-x-hidden border border-border/70 bg-popover/96 p-0 data-[state=closed]:hidden"
          >
            <SetupDetailPanel
              item={item}
              title={title}
              isCurrent={isCurrent}
              nestedOpen={open}
              viewportWidth={viewportWidth}
              onOpenWorkspace={onOpenWorkspace}
              onFinish={onFinish}
              showHeader
              autoEnterWorkspaceId={autoEnterWorkspaceId}
              remainingSeconds={remainingSeconds}
            />
          </PopoverContent>
        </Popover>
      </div>
      {enterNowButton}
    </div>
  );
}

function ReadyWorkspaceChip({
  title,
  onOpen,
}: {
  title: string;
  onOpen: () => void;
}) {
  const t = useTranslations("header.workspaceJobs");

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "grid h-7 max-w-[280px] grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 text-left",
        HEADER_CHIP_SURFACE_CLASS,
        HEADER_CHIP_HOVER_CLASS,
      )}
      aria-label={t("ready")}
    >
      <CheckCircle2 className="size-3.5 text-emerald-500" />
      <span className="block min-w-0 truncate text-[12px] font-medium">{title}</span>
      <span aria-hidden="true" className="w-0" />
    </button>
  );
}

function CreatingJobPopover({
  item,
  title,
  viewportWidth,
  onFinish,
  onContentMouseEnter,
  onContentMouseLeave,
}: {
  item: HeaderWorkspaceSetupItem;
  title: string;
  viewportWidth: number;
  onFinish: (workspaceId: string) => void;
  onContentMouseEnter?: () => void;
  onContentMouseLeave?: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "grid h-7 max-w-[280px] grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 text-left",
            HEADER_CHIP_SURFACE_CLASS,
            HEADER_CHIP_HOVER_CLASS,
          )}
          aria-label={title}
        >
          <Loader2 className="size-3.5 animate-spin text-primary" />
          <TextShimmer as="span" duration={1.6} className="block min-w-0 truncate text-[12px] font-medium">
            {title}
          </TextShimmer>
          <span aria-hidden="true" className="w-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-auto max-w-[calc(100vw-24px)] overflow-visible border-0 bg-transparent p-0 shadow-none"
        onMouseEnter={onContentMouseEnter}
        onMouseLeave={onContentMouseLeave}
      >
        <div className="min-w-0 overflow-hidden rounded-md border border-border/70 bg-popover/96 shadow-md">
          <SetupDetailPanel
            item={item}
            title={title}
            isCurrent={false}
            nestedOpen={open}
            viewportWidth={viewportWidth}
            onFinish={onFinish}
            showHeader={false}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function HeaderWorkspaceJobs() {
  const t = useTranslations("header.workspaceJobs");
  const router = useAppRouter();
  const { workspaceId: currentWorkspaceId } = useContextParams();
  const projects = useProjects();
  const jobs = useWorkspaceCreationStore((state) => state.jobs);
  const markOpened = useWorkspaceCreationStore((state) => state.markOpened);
  const cancelAutoOpen = useWorkspaceCreationStore((state) => state.cancelAutoOpen);
  const setupProgress = useProjectStore((state) => state.setupProgress);
  const clearSetupProgress = useProjectStore((state) => state.clearSetupProgress);
  const [open, setOpen] = React.useState(false);
  const [headerHovering, setHeaderHovering] = React.useState(false);
  const hoverLeaveTimerRef = React.useRef<number | null>(null);
  const [viewportWidth, setViewportWidth] = React.useState(() =>
    typeof window === "undefined" ? 1200 : window.innerWidth,
  );

  React.useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  React.useEffect(() => {
    return () => {
      if (hoverLeaveTimerRef.current != null) {
        window.clearTimeout(hoverLeaveTimerRef.current);
      }
    };
  }, []);

  const markHeaderHovering = React.useCallback((next: boolean) => {
    if (hoverLeaveTimerRef.current != null) {
      window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    if (next) {
      setHeaderHovering(true);
      return;
    }
    hoverLeaveTimerRef.current = window.setTimeout(() => {
      setHeaderHovering(false);
      hoverLeaveTimerRef.current = null;
    }, WORKSPACE_AUTO_ENTER_HOVER_LEAVE_MS);
  }, []);

  const workspaceNameById = React.useMemo(() => {
    const names = new Map<string, string>();
    for (const project of projects) {
      for (const workspace of project.workspaces) {
        names.set(workspace.id, workspace.displayName || workspace.name);
      }
    }
    return names;
  }, [projects]);

  const items = React.useMemo(() => {
    const collected = collectHeaderWorkspaceSetupItems({
      jobs,
      setupProgress,
      currentWorkspaceId,
    });
    return visibleHeaderWorkspaceSetupItems(collected, currentWorkspaceId);
  }, [currentWorkspaceId, jobs, setupProgress]);
  const chipItem = selectHeaderWorkspaceSetupChipItem(items, currentWorkspaceId);
  const titleForItem = React.useCallback(
    (item: HeaderWorkspaceSetupItem) => itemTitle(item, workspaceNameById, t("creating")),
    [t, workspaceNameById],
  );

  const openWorkspace = React.useCallback(
    (workspaceId: string, dismissSetup = false) => {
      markOpened(workspaceId);
      if (dismissSetup) clearSetupProgress(workspaceId);
      setOpen(false);
      if (workspaceId !== currentWorkspaceId) {
        router.push(`/workspace?id=${workspaceId}`);
      }
    },
    [clearSetupProgress, currentWorkspaceId, markOpened, router],
  );

  const finishSetup = (workspaceId: string) => {
    clearSetupProgress(workspaceId);
  };

  const grouped = items.length > 1;
  const autoEnter = useWorkspaceCreateAutoOpen({
    grouped,
    hovering: headerHovering,
    onAutoEnter: openWorkspace,
  });
  const single = items.length === 1 ? items[0] : null;
  const allReady = grouped && items.every((item) => isHeaderWorkspaceSetupReadyToOpen(item));
  const groupedTitle = allReady
    ? t("ready")
    : chipItem
      ? chipLabel(chipItem, titleForItem(chipItem))
      : t("creating");

  React.useEffect(() => {
    if (!grouped && open) setOpen(false);
  }, [grouped, open]);

  return (
    <div
      className="desktop-no-drag flex min-w-0 items-center gap-1"
      onMouseEnter={() => markHeaderHovering(true)}
      onMouseLeave={() => markHeaderHovering(false)}
    >
      {single?.progress ? (
        <WorkspaceStatusPopover
          progress={single.progress}
          onFinish={() => {
            if (single.workspaceId) finishSetup(single.workspaceId);
          }}
          onContentMouseEnter={() => markHeaderHovering(true)}
          onContentMouseLeave={() => markHeaderHovering(false)}
        />
      ) : null}

      {single &&
      !single.progress &&
      isHeaderWorkspaceSetupReadyToOpen(single) &&
      single.workspaceId &&
      single.workspaceId !== autoEnter.workspaceId ? (
        <ReadyWorkspaceChip
          title={titleForItem(single)}
          onOpen={() => {
            if (single.workspaceId) openWorkspace(single.workspaceId, true);
          }}
        />
      ) : null}

      {single && !single.progress && !isHeaderWorkspaceSetupReadyToOpen(single) ? (
        <CreatingJobPopover
          item={single}
          title={titleForItem(single)}
          viewportWidth={viewportWidth}
          onFinish={finishSetup}
          onContentMouseEnter={() => markHeaderHovering(true)}
          onContentMouseLeave={() => markHeaderHovering(false)}
        />
      ) : null}

      {grouped && chipItem ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "grid h-7 max-w-[280px] grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 text-left",
                HEADER_CHIP_SURFACE_CLASS,
                HEADER_CHIP_HOVER_CLASS,
              )}
              aria-label={
                allReady
                  ? t("countAriaReady", { count: items.length })
                  : t("countAria", { count: items.length })
              }
            >
              {allReady ? (
                <CheckCircle2 className="size-3.5 text-emerald-500" />
              ) : (
                <Loader2 className="size-3.5 animate-spin text-primary" />
              )}
              {allReady ? (
                <span className="block min-w-0 truncate text-[12px] font-medium">{groupedTitle}</span>
              ) : (
                <TextShimmer
                  as="span"
                  duration={1.6}
                  className="block min-w-0 truncate text-[12px] font-medium"
                >
                  {groupedTitle}
                </TextShimmer>
              )}
              <span className="rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                {items.length}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="w-[280px] max-w-[calc(100vw-24px)] overflow-visible p-0"
            onInteractOutside={(event) => {
              const target = event.target;
              if (target instanceof HTMLElement && target.closest("[data-header-setup-nested]")) {
                event.preventDefault();
              }
            }}
          >
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
              {allReady
                ? t("listTitleReady", { count: items.length })
                : t("listTitle", { count: items.length })}
            </div>
            <div className="flex flex-col gap-1 p-2 pt-0">
              {items.map((item) => (
                <WorkspaceSetupListRow
                  key={item.id}
                  item={item}
                  title={titleForItem(item)}
                  isCurrent={item.workspaceId === currentWorkspaceId}
                  viewportWidth={viewportWidth}
                  onOpenWorkspace={openWorkspace}
                  onFinish={finishSetup}
                  autoEnterWorkspaceId={autoEnter.workspaceId}
                  remainingSeconds={autoEnter.remainingSeconds}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      <AnimatePresence initial={false}>
        {autoEnter.workspaceId ? (
          <AutoEnterChip
            key={autoEnter.workspaceId}
            remainingSeconds={autoEnter.remainingSeconds}
            hovered={headerHovering}
            grouped={grouped}
            onStay={() => cancelAutoOpen(autoEnter.workspaceId!)}
            onEnter={() => openWorkspace(autoEnter.workspaceId!)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
