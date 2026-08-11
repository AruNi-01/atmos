"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  Button,
  Drawer,
  DrawerContentBare,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  cn,
} from "@workspace/ui";
import { ArrowRight, Rocket, X } from "lucide-react";
import { useQueryState } from "nuqs";
import { TaskGithubDrawerNavProvider } from "@/features/task/components/task-github-drawer/task-github-drawer-nav-context";
import type { TaskGithubDrawerEntry } from "@/features/task/components/task-github-drawer/types";
import {
  actionDrawerKey,
  commitDrawerKey,
  issueDrawerKey,
  prDrawerKey,
} from "@/features/task/components/task-github-drawer/types";
import { useTaskDrawerInsets } from "@/features/task/components/task-github-drawer/use-task-drawer-insets";
import { openTaskWorkspaceCreate } from "@/features/task/lib/open-task-workspace-create";
import { findLinkedWorkspaceForGithubItem } from "@/features/task/lib/find-linked-workspace";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import type { ActionRun } from "@/features/github/components/ActionsPanel";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { centerStageParams } from "@/shared/lib/nuqs/searchParams";

const PRDetailView = dynamic(
  () =>
    import("@/features/github/components/PRDetailView").then((m) => m.PRDetailView),
  { ssr: false },
);
const IssueDetailView = dynamic(
  () =>
    import("@/features/github/components/IssueDetailView").then((m) => m.IssueDetailView),
  { ssr: false },
);
const CommitDetailView = dynamic(
  () =>
    import("@/features/github/components/CommitDetailView").then((m) => m.CommitDetailView),
  { ssr: false },
);
const ActionsDetailView = dynamic(
  () =>
    import("@/features/github/components/ActionsDetailView").then((m) => m.ActionsDetailView),
  { ssr: false },
);

export type TaskGithubDrawerController = {
  openIssue: (entry: Extract<TaskGithubDrawerEntry, { kind: "issue" }>) => void;
  openPr: (entry: Extract<TaskGithubDrawerEntry, { kind: "pr" }>) => void;
  push: (entry: TaskGithubDrawerEntry) => void;
  close: () => void;
  isOpen: boolean;
};

type TaskGithubDrawerHostProps = {
  controllerRef?: React.MutableRefObject<TaskGithubDrawerController | null>;
  onOpenChange?: (open: boolean) => void;
};

function pushUnique(
  stack: TaskGithubDrawerEntry[],
  entry: TaskGithubDrawerEntry,
): TaskGithubDrawerEntry[] {
  const last = stack[stack.length - 1];
  if (last?.key === entry.key) return stack;
  // Re-opening an earlier entry in the stack: trim to it.
  const existingIndex = stack.findIndex((item) => item.key === entry.key);
  if (existingIndex >= 0) return stack.slice(0, existingIndex + 1);
  return [...stack, entry];
}

function WorkspaceHeaderAction({
  onClick,
  label,
  shortLabel,
  mode,
}: {
  onClick: () => void;
  /** Full label for title / a11y. */
  label: string;
  /** Compact button text (Enter / Create). */
  shortLabel: string;
  mode: "create" | "enter";
}) {
  const Icon = mode === "enter" ? ArrowRight : Rocket;
  return (
    <Button
      type="button"
      size="sm"
      variant={mode === "enter" ? "ghost" : "outline"}
      className={cn(
        "h-7 gap-1.5 px-2 text-xs font-medium text-muted-foreground shadow-none",
        mode === "enter" && "hover:bg-muted hover:text-foreground",
        mode === "create" && "border-border/70 hover:bg-muted hover:text-foreground",
      )}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <Icon className="size-3.5" />
      <span>{shortLabel}</span>
    </Button>
  );
}

/**
 * Nested right drawers — stack chrome via layout (not transform).
 *
 * Why not vaul NestedRoot / transform?
 * - Vaul NestedRoot only shifts ~16px and is built for bottom sheets.
 * - NestedRoot’s internal onOpenChange is overwritten when callers pass
 *   their own onOpenChange (…rest wins), so parent scale often never runs;
 *   on close, residual inline transform can leave the sheet stuck small.
 * - Scaling a right sheet from the right edge shrinks it *under* the child,
 *   so hierarchy is invisible.
 *
 * Approach (aligned with coss / Base UI “peek stack” idea, adapted for right):
 * when a layer is buried, increase `right` + top/bottom so it peeks to the
 * left of the front sheet. Pure CSS layout — no fight with vaul’s transform.
 *
 * Width stays narrower than the center stage so the peek strip never spills
 * past the left edge of the center panel.
 *
 * Exit: `exitingFrom` trims the *visual* stack immediately so parents restore
 * in parallel with the nested sheet’s slide-out (stack unmount waits for
 * onAnimationEnd).
 */
/** Horizontal peek (px) of each buried layer, visible to the left of the front. */
const NEST_PEEK_X = 28;
/** Vertical tuck (px) per buried layer. */
const NEST_EDGE_INSET = 14;
/**
 * How many nest peeks we reserve room for inside the center stage.
 * Sheet width = center − this, so parent+child stack stays within the panel.
 */
const MAX_NEST_PEEKS = 2;
/** Extra left breathing room inside center (beyond nest peeks). */
const LEFT_BREATHING_PX = 20;
const STACK_RESERVE_X = NEST_PEEK_X * MAX_NEST_PEEKS + LEFT_BREATHING_PX;
const NEST_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const NEST_MS = 450;

function DrawerLayer({
  stack,
  index,
  insets,
  /** Visual stack length for peek/restore (excludes layers already exiting). */
  visualLen,
  onExitStart,
  onDismissFrom,
  onWorkspaceAction,
  resolveWorkspaceAction,
}: {
  stack: TaskGithubDrawerEntry[];
  index: number;
  insets: { left: number; top: number; right: number; bottom: number };
  visualLen: number;
  onExitStart: (index: number) => void;
  onDismissFrom: (index: number) => void;
  onWorkspaceAction: (entry: TaskGithubDrawerEntry) => void;
  resolveWorkspaceAction: (
    entry: TaskGithubDrawerEntry,
  ) => { mode: "create" | "enter"; label: string; shortLabel: string } | null;
}) {
  const entry = stack[index];
  // Local open state so we can run Vaul's exit animation before unmounting the layer.
  const [open, setOpen] = React.useState(true);
  // Guard against double-dismiss / stale animation-end after stack already replaced.
  const dismissedRef = React.useRef(false);
  const entryKey = entry?.key ?? "";

  // Layers above this index that are still "visually open" (not exiting).
  // When a nested sheet starts closing, visualLen shrinks immediately so this
  // parent restores in parallel with the exit animation.
  const levelsBehind = Math.max(0, visualLen - 1 - index);

  // When this layer is reused for a new stack entry (same React instance), force open.
  React.useEffect(() => {
    dismissedRef.current = false;
    setOpen(true);
  }, [entryKey]);

  const beginClose = React.useCallback(() => {
    if (dismissedRef.current) return;
    setOpen(false);
    // Parent peeks restore immediately; unmount waits for animation end.
    onExitStart(index);
  }, [index, onExitStart]);

  if (!entry) return null;

  const isRoot = index === 0;
  const hasChildInStack = index < stack.length - 1;
  // Front = still open and no non-exiting layer above us.
  const isFront = open && index === visualLen - 1;

  const { top, right, bottom, left } = insets;
  const peekX = levelsBehind * NEST_PEEK_X;
  const vInset = levelsBehind * NEST_EDGE_INSET;
  // Narrower than full center so nest peeks stay inside the panel.
  const sheetWidth = `calc(100vw - ${left}px - ${right}px - ${STACK_RESERVE_X}px)`;
  const contentStyle = {
    top: top + vInset,
    // Larger `right` slides the buried sheet left so a strip peeks past the front.
    right: right + peekX,
    bottom: bottom + vInset,
    width: sheetWidth,
    maxWidth: "none",
    height: "auto",
    // Stay at z-50 (same as DropdownMenu / Popover / Select). Nested layers must
    // NOT bump above 50 — otherwise portaled menus open under the sheet and
    // look like "click does nothing". Stack order comes from portal DOM order.
    zIndex: 50,
    transition: [
      `right ${NEST_MS}ms ${NEST_EASE}`,
      `top ${NEST_MS}ms ${NEST_EASE}`,
      `bottom ${NEST_MS}ms ${NEST_EASE}`,
    ].join(", "),
    // Official side drawer: style={{ '--initial-transform': 'calc(100% + 8px)' }}
    ["--initial-transform" as string]: `calc(100% + ${right + peekX}px)`,
  } as React.CSSProperties;

  return (
    // Independent Root per layer (not NestedRoot). NestedRoot writes scale/translate
    // on the parent for bottom sheets; on right sheets it is nearly invisible and
    // can leave residual transform when the nested layer closes.
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) beginClose();
      }}
      onAnimationEnd={(isOpen) => {
        // After slide-out finishes, drop this layer from the stack.
        if (!isOpen && !dismissedRef.current) {
          dismissedRef.current = true;
          onDismissFrom(index);
        }
      }}
      direction="right"
      // Nested layers skip body position restore so closing them does not unlock
      // scroll while the root layer is still open.
      nested={!isRoot}
      // Complex scrollable detail views — only dismiss via overlay / Esc / close.
      handleOnly
      shouldScaleBackground={isRoot}
      dismissible
      // Keep modal always so Content does not remount when nest depth changes
      // (modal true↔false swaps DialogContentModal / NonModal and loses scroll).
      // Stack interactivity is handled via pointer-events on buried layers +
      // non-front overlays, not by toggling modal.
      modal
    >
      <DrawerPortal>
        {/*
          All layers share z-50 with DropdownMenu / Popover / Select so portaled
          menus paint above the sheet (DOM order). Bumping nested z-index used
          to bury those menus under the front drawer.
          Non-front overlays must not capture clicks.
        */}
        <DrawerOverlay
          className={cn(
            isFront ? "bg-black/40" : "pointer-events-none bg-transparent",
          )}
          style={{ zIndex: 50 }}
        />
        <DrawerContentBare
          data-task-drawer-layer={index}
          data-levels-behind={levelsBehind}
          data-nested-drawer-open={levelsBehind > 0 ? "" : undefined}
          className={cn(
            // `fixed` + outline-none mirror the official side drawer Content class.
            "fixed z-50 flex overflow-hidden rounded-xl border border-border/70 bg-background outline-none shadow-2xl",
            levelsBehind > 0 && "pointer-events-none",
          )}
          style={contentStyle}
        >
          <DrawerTitle className="sr-only">
            {entry.kind === "issue"
              ? `Issue #${entry.issueNumber}`
              : entry.kind === "pr"
                ? `Pull request #${entry.prNumber}`
                : entry.kind === "commit"
                  ? `Commit ${entry.sha.slice(0, 7)}`
                  : `Action run ${entry.runId}`}
          </DrawerTitle>

          <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
            <button
              type="button"
              className="absolute right-3 top-3 z-30 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={beginClose}
              aria-label="Close"
            >
              <X className="size-3.5" />
            </button>

            <div className="min-h-0 flex-1 overflow-hidden">
              {entry.kind === "issue" || entry.kind === "pr" ? (
                (() => {
                  const action = resolveWorkspaceAction(entry);
                  const headerTrailing = action ? (
                    <WorkspaceHeaderAction
                      mode={action.mode}
                      label={action.label}
                      shortLabel={action.shortLabel}
                      onClick={() => onWorkspaceAction(entry)}
                    />
                  ) : null;
                  return entry.kind === "issue" ? (
                    <IssueDetailView
                      owner={entry.owner}
                      repo={entry.repo}
                      issueNumber={entry.issueNumber}
                      active={isFront}
                      headerTrailing={headerTrailing}
                    />
                  ) : (
                    <PRDetailView
                      owner={entry.owner}
                      repo={entry.repo}
                      branch={entry.branch}
                      prNumber={entry.prNumber}
                      active={isFront}
                      onRequestClose={beginClose}
                      headerTrailing={headerTrailing}
                    />
                  );
                })()
              ) : entry.kind === "commit" ? (
                <CommitDetailView
                  owner={entry.owner}
                  repo={entry.repo}
                  sha={entry.sha}
                  subject={entry.subject}
                  authorName={entry.authorName}
                  active={isFront}
                  onRequestClose={beginClose}
                />
              ) : (
                <ActionsDetailView
                  owner={entry.owner}
                  repo={entry.repo}
                  runId={entry.runId}
                  run={entry.run as unknown as ActionRun}
                  active={isFront}
                  onRequestClose={beginClose}
                />
              )}
            </div>
          </div>

          {hasChildInStack ? (
            <DrawerLayer
              stack={stack}
              index={index + 1}
              insets={insets}
              visualLen={visualLen}
              onExitStart={onExitStart}
              onDismissFrom={onDismissFrom}
              onWorkspaceAction={onWorkspaceAction}
              resolveWorkspaceAction={resolveWorkspaceAction}
            />
          ) : null}
        </DrawerContentBare>
      </DrawerPortal>
    </Drawer>
  );
}

export function TaskGithubDrawerHost({
  controllerRef,
  onOpenChange,
}: TaskGithubDrawerHostProps) {
  const t = useTranslations("appShell.task.github");
  const router = useAppRouter();
  const projects = useProjects();
  const insets = useTaskDrawerInsets();
  const [stack, setStack] = React.useState<TaskGithubDrawerEntry[]>([]);
  /**
   * Index of the layer that has started its exit animation.
   * Visual peeks use this immediately so parents restore in parallel with the
   * nested slide-out; the real stack still holds the exiting layer until
   * onAnimationEnd trims it.
   */
  const [exitingFrom, setExitingFrom] = React.useState<number | null>(null);
  /**
   * Bumps on every list-level open so DrawerLayer remounts with open=true.
   * Without this, closing sets local open=false; re-clicking the same item hits
   * pushUnique no-op (same key) and the sheet never reopens.
   */
  const [rootEpoch, setRootEpoch] = React.useState(0);
  const [, setNewWorkspace] = useQueryState("newWorkspace", centerStageParams.newWorkspace);

  const isOpen = stack.length > 0;
  // Treat exiting layers as already gone for peek/restore geometry.
  const visualLen =
    exitingFrom != null ? Math.min(exitingFrom, stack.length) : stack.length;

  React.useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  const exitStart = React.useCallback((index: number) => {
    setExitingFrom((prev) => (prev == null ? index : Math.min(prev, index)));
  }, []);

  const dismissFrom = React.useCallback((index: number) => {
    setStack((prev) => (index <= 0 ? [] : prev.slice(0, index)));
    setExitingFrom(null);
  }, []);

  const push = React.useCallback((entry: TaskGithubDrawerEntry) => {
    setExitingFrom(null);
    setStack((prev) => pushUnique(prev, entry));
  }, []);

  /** List / controller open: always reset to a single root layer (fresh mount). */
  const openRoot = React.useCallback((entry: TaskGithubDrawerEntry) => {
    setRootEpoch((n) => n + 1);
    setExitingFrom(null);
    setStack([entry]);
  }, []);

  const openIssue = React.useCallback(
    (entry: Extract<TaskGithubDrawerEntry, { kind: "issue" }>) => {
      openRoot({
        ...entry,
        key: entry.key || issueDrawerKey(entry.owner, entry.repo, entry.issueNumber),
      });
    },
    [openRoot],
  );

  const openPr = React.useCallback(
    (entry: Extract<TaskGithubDrawerEntry, { kind: "pr" }>) => {
      openRoot({
        ...entry,
        key: entry.key || prDrawerKey(entry.owner, entry.repo, entry.prNumber),
      });
    },
    [openRoot],
  );

  const close = React.useCallback(() => {
    setExitingFrom(null);
    setStack([]);
  }, []);

  React.useEffect(() => {
    if (!controllerRef) return;
    controllerRef.current = {
      openIssue,
      openPr,
      push,
      close,
      isOpen,
    };
    return () => {
      controllerRef.current = null;
    };
  }, [close, controllerRef, isOpen, openIssue, openPr, push]);

  const nav = React.useMemo(
    () => ({
      active: isOpen,
      openIssue: (params: {
        owner: string;
        repo: string;
        issueNumber: number;
        title?: string | null;
        contextId?: string | null;
      }) => {
        if (!isOpen) return false;
        push({
          kind: "issue",
          key: issueDrawerKey(params.owner, params.repo, params.issueNumber),
          owner: params.owner,
          repo: params.repo,
          issueNumber: params.issueNumber,
          title: params.title,
          projectId: params.contextId,
        });
        return true;
      },
      openPullRequest: (params: {
        owner: string;
        repo: string;
        prNumber: number;
        branch: string;
        title?: string | null;
        contextId?: string | null;
      }) => {
        if (!isOpen) return false;
        push({
          kind: "pr",
          key: prDrawerKey(params.owner, params.repo, params.prNumber),
          owner: params.owner,
          repo: params.repo,
          prNumber: params.prNumber,
          branch: params.branch?.trim() || "main",
          title: params.title,
          projectId: params.contextId,
        });
        return true;
      },
      openCommit: (params: {
        owner: string;
        repo: string;
        sha: string;
        subject: string;
        authorName: string;
        contextId?: string | null;
      }) => {
        if (!isOpen) return false;
        push({
          kind: "commit",
          key: commitDrawerKey(params.owner, params.repo, params.sha),
          owner: params.owner,
          repo: params.repo,
          sha: params.sha,
          subject: params.subject,
          authorName: params.authorName,
          projectId: params.contextId,
        });
        return true;
      },
      openActionRun: (params: {
        owner: string;
        repo: string;
        run: ActionRun;
        runId?: number;
        contextId?: string | null;
      }) => {
        if (!isOpen) return false;
        const runId = params.runId ?? params.run.databaseId;
        push({
          kind: "action",
          key: actionDrawerKey(params.owner, params.repo, runId),
          owner: params.owner,
          repo: params.repo,
          runId,
          run: params.run as unknown as Record<string, unknown>,
          projectId: params.contextId,
        });
        return true;
      },
    }),
    [isOpen, push],
  );

  const resolveWorkspaceAction = React.useCallback(
    (
      entry: TaskGithubDrawerEntry,
    ): { mode: "create" | "enter"; label: string; shortLabel: string } | null => {
      if (entry.kind !== "issue" && entry.kind !== "pr") return null;
      const linked = findLinkedWorkspaceForGithubItem(projects, {
        kind: entry.kind === "issue" ? "issue" : "pr",
        owner: entry.owner,
        repo: entry.repo,
        number: entry.kind === "issue" ? entry.issueNumber : entry.prNumber,
        headRef: entry.kind === "pr" ? entry.branch : null,
        projectId: entry.projectId,
      });
      if (linked) {
        return {
          mode: "enter",
          label: t("enterWorkspace"),
          shortLabel: t("enter"),
        };
      }
      return {
        mode: "create",
        label: t("createWorkspace"),
        shortLabel: t("create"),
      };
    },
    [projects, t],
  );

  const handleWorkspaceAction = React.useCallback(
    (entry: TaskGithubDrawerEntry) => {
      if (entry.kind !== "issue" && entry.kind !== "pr") return;

      const linked = findLinkedWorkspaceForGithubItem(projects, {
        kind: entry.kind === "issue" ? "issue" : "pr",
        owner: entry.owner,
        repo: entry.repo,
        number: entry.kind === "issue" ? entry.issueNumber : entry.prNumber,
        headRef: entry.kind === "pr" ? entry.branch : null,
        projectId: entry.projectId,
      });
      if (linked) {
        router.push(`/workspace?id=${linked.workspace.id}`);
        return;
      }

      if (entry.kind === "issue") {
        const title = entry.title?.trim() || "";
        openTaskWorkspaceCreate({
          projectId: entry.projectId,
          setNewWorkspace,
          displayName: title
            ? `[issue#${entry.issueNumber}] ${title}`.slice(0, 120)
            : `[issue#${entry.issueNumber}]`,
          link: {
            kind: "issue",
            owner: entry.owner,
            repo: entry.repo,
            number: entry.issueNumber,
            title: entry.title,
            url: `https://github.com/${entry.owner}/${entry.repo}/issues/${entry.issueNumber}`,
          },
        });
        return;
      }

      const prTitle = entry.title?.trim() || "";
      openTaskWorkspaceCreate({
        projectId: entry.projectId,
        setNewWorkspace,
        displayName: prTitle
          ? `[PR#${entry.prNumber}] ${prTitle}`.slice(0, 120)
          : `[PR#${entry.prNumber}]`,
        link: {
          kind: "pr",
          owner: entry.owner,
          repo: entry.repo,
          number: entry.prNumber,
          title: entry.title,
          url: `https://github.com/${entry.owner}/${entry.repo}/pull/${entry.prNumber}`,
          head_ref: entry.branch,
        },
      });
    },
    [projects, router, setNewWorkspace],
  );

  if (!isOpen) return null;

  const rootKey = stack[0]?.key ?? "root";

  return (
    <TaskGithubDrawerNavProvider value={nav}>
      <DrawerLayer
        key={`task-gh-drawer-${rootEpoch}-${rootKey}`}
        stack={stack}
        index={0}
        insets={insets}
        visualLen={visualLen}
        onExitStart={exitStart}
        onDismissFrom={dismissFrom}
        onWorkspaceAction={handleWorkspaceAction}
        resolveWorkspaceAction={resolveWorkspaceAction}
      />
    </TaskGithubDrawerNavProvider>
  );
}
