"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  FileDiff,
  FolderTree,
  GitBranch,
  LayoutDashboard,
  Play,
  Smartphone,
  SquareTerminal as TerminalIcon,
  MessagesSquare,
  X,
} from "lucide-react";
import { Github } from "@workspace/ui/components/icons/lucide-brand-icons";
import { cn } from "@/shared/lib/utils";
import { CENTER_STAGE_RADIUS_CLASS } from "@/app-shell/sidebar-layout-constants";
import type { CenterToolTabValue } from "@/app-shell/center-tool-tabs";
import {
  EMPTY_PANE_LIST_MAX_WIDTH_PX,
  UNMEASURED_EMPTY_PANE_LAUNCHER_PLAN,
  emptyPaneGridItemCount,
  emptyPaneLastItemSpansFullRow,
  emptyPaneLauncherPlansEqual,
  planEmptyPaneLauncher,
  type EmptyPaneLauncherPlan,
} from "@/app-shell/center-pane/center-pane-empty-layout";

export type CenterPaneEmptyActionId =
  | "terminal"
  | "agent-chat"
  | "files"
  | "changes"
  | "review"
  | "run"
  | "github"
  | "simulator"
  | "overview";

export type CenterPaneEmptyAction = {
  id: CenterPaneEmptyActionId;
  label: string;
  icon: React.ReactNode;
  /** Display keys on the right, e.g. ["⌘", "1"]. Omit when no shortcut. */
  shortcutKeys?: string[];
  onSelect: () => void;
};

function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-0.5">
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/60 bg-muted/50 px-1 font-mono text-[10px] font-medium text-muted-foreground"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

const ACTION_FOCUS_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const EMPTY_PANE_COMPACT_TILE_CLASS =
  "flex flex-col items-center justify-center border border-border text-center hover:bg-accent hover:text-accent-foreground";

function EmptyPaneTypeButton({
  action,
  plan,
}: {
  action: CenterPaneEmptyAction;
  plan: EmptyPaneLauncherPlan;
}) {
  const compact = plan.mode === "grid";
  return (
    <button
      type="button"
      data-center-pane-empty-action={action.id}
      className={cn(
        CENTER_STAGE_RADIUS_CLASS,
        ACTION_FOCUS_CLASS,
        compact
          ? EMPTY_PANE_COMPACT_TILE_CLASS
          : "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground",
      )}
      style={
        compact
          ? {
              minHeight: plan.cardMinHeight,
              gap: Math.max(4, Math.round(plan.iconSize * 0.2)),
              paddingLeft: 12,
              paddingRight: 12,
              paddingTop: plan.cardPaddingY,
              paddingBottom: plan.cardPaddingY,
            }
          : undefined
      }
      onClick={action.onSelect}
    >
      <span
        className="inline-flex shrink-0 items-center justify-center text-muted-foreground [&_svg]:h-full [&_svg]:w-full"
        style={{ width: plan.iconSize, height: plan.iconSize }}
      >
        {action.icon}
      </span>
      <span
        className={cn(
          "min-w-0 font-medium",
          compact ? "w-full truncate text-sm leading-tight" : "flex-1 truncate",
        )}
      >
        {action.label}
      </span>
      {!compact && action.shortcutKeys && action.shortcutKeys.length > 0 ? (
        <ShortcutKeys keys={action.shortcutKeys} />
      ) : null}
    </button>
  );
}

/**
 * Empty center pane launcher. At most two tiles per row. Compact tiles use a
 * rounded border and hover fill. The last tile spans the full row when the
 * count is odd so the grid stays balanced. Extra rows wrap and scroll when
 * the pane is short.
 */
export function CenterPaneEmptyState({
  actions,
  className,
  onClose,
}: {
  actions: CenterPaneEmptyAction[];
  className?: string;
  onClose?: () => void;
}) {
  const t = useTranslations("appShell.centerStageTabBar");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const hasClose = Boolean(onClose);
  const [plan, setPlan] = React.useState<EmptyPaneLauncherPlan>(
    UNMEASURED_EMPTY_PANE_LAUNCHER_PLAN,
  );

  React.useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const update = () => {
      const next = planEmptyPaneLauncher({
        width: el.clientWidth,
        height: el.clientHeight,
        actionCount: actions.length,
        hasClose,
      });
      setPlan((prev) => (emptyPaneLauncherPlansEqual(prev, next) ? prev : next));
    };

    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [actions.length, hasClose]);

  const compact = plan.mode === "grid";
  const itemCount = emptyPaneGridItemCount(actions.length, hasClose);
  const lastSpansFullRow =
    compact && emptyPaneLastItemSpansFullRow(itemCount, plan.columns);

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto bg-background",
        className,
      )}
      data-center-pane-empty=""
      data-center-pane-empty-layout={plan.mode}
      data-center-pane-empty-columns={plan.columns}
    >
      <div
        className={cn(
          "flex w-full justify-center",
          plan.scroll ? "items-start" : "min-h-full items-center",
        )}
        style={{
          paddingLeft: plan.paddingX,
          paddingRight: plan.paddingX,
          paddingTop: plan.paddingY,
          paddingBottom: plan.paddingY,
        }}
      >
        <div
          className={cn(
            "mx-auto grid w-full min-w-0",
            lastSpansFullRow && "[&>*:last-child]:col-span-full",
          )}
          style={
            compact
              ? {
                  gridTemplateColumns: `repeat(${plan.columns}, minmax(0, 1fr))`,
                  columnGap: plan.columns > 1 ? plan.gap : 0,
                  rowGap: plan.gap,
                  maxWidth: plan.gridMaxWidth,
                }
              : {
                  gridTemplateColumns: "minmax(0, 1fr)",
                  gap: plan.gap,
                  maxWidth: EMPTY_PANE_LIST_MAX_WIDTH_PX,
                }
          }
        >
          {actions.map((action) => (
            <EmptyPaneTypeButton
              key={action.id}
              action={action}
              plan={plan}
            />
          ))}
          {onClose ? (
            <button
              type="button"
              data-center-pane-empty-close=""
              className={cn(
                CENTER_STAGE_RADIUS_CLASS,
                ACTION_FOCUS_CLASS,
                compact
                  ? cn(EMPTY_PANE_COMPACT_TILE_CLASS, "text-muted-foreground")
                  : "mt-2 flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              style={
                compact
                  ? {
                      minHeight: plan.cardMinHeight,
                      gap: Math.max(4, Math.round(plan.iconSize * 0.2)),
                      paddingLeft: 12,
                      paddingRight: 12,
                      paddingTop: plan.cardPaddingY,
                      paddingBottom: plan.cardPaddingY,
                    }
                  : undefined
              }
              onClick={onClose}
            >
              <span
                className={cn(
                  "inline-flex shrink-0 items-center justify-center text-muted-foreground",
                  compact ? "[&_svg]:h-full [&_svg]:w-full" : "size-5",
                )}
                style={
                  compact
                    ? { width: plan.iconSize, height: plan.iconSize }
                    : undefined
                }
              >
                <X className={compact ? undefined : "size-4"} />
              </span>
              <span
                className={cn(
                  "min-w-0 font-medium",
                  compact
                    ? "w-full truncate text-sm leading-tight"
                    : "truncate",
                )}
              >
                {t("closePane")}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Build the default creatable-tab list for an empty secondary (or any) pane. */
export function buildDefaultEmptyPaneActions(input: {
  labels: {
    terminal: string;
    agentChat?: string;
    files: string;
    changes: string;
    review: string;
    run: string;
    github: string;
    simulator: string;
  };
  /** Platform mod key glyph, e.g. ⌘ or Ctrl */
  modKey: string;
  includeOverview?: boolean;
  overviewLabel?: string;
  onCreateTerminal: () => void;
  onCreateAgentChat?: () => void;
  onCreateToolTab: (tab: CenterToolTabValue) => void;
  onCreateSimulator: () => void;
  onOpenOverview?: () => void;
  hideGitChrome?: boolean;
}): CenterPaneEmptyAction[] {
  const { labels, modKey } = input;
  const actions: CenterPaneEmptyAction[] = [];
  if (input.includeOverview !== false && input.onOpenOverview) {
    actions.push({
      id: "overview",
      label: input.overviewLabel ?? "Overview",
      icon: <LayoutDashboard />,
      shortcutKeys: [modKey, "0"],
      onSelect: input.onOpenOverview,
    });
  }
  actions.push(
    {
      id: "terminal",
      label: labels.terminal,
      icon: <TerminalIcon />,
      // Matches global new-terminal hotkey (⌘T / Ctrl+T).
      shortcutKeys: [modKey, "T"],
      onSelect: input.onCreateTerminal,
    },
    ...(input.onCreateAgentChat
      ? [
          {
            id: "agent-chat" as const,
            label: labels.agentChat ?? "Chat",
            icon: <MessagesSquare />,
            onSelect: input.onCreateAgentChat,
          },
        ]
      : []),
    {
      id: "files",
      label: labels.files,
      icon: <FolderTree />,
      onSelect: () => input.onCreateToolTab("files"),
    },
    ...(input.hideGitChrome
      ? []
      : [
          {
            id: "changes" as const,
            label: labels.changes,
            icon: <GitBranch />,
            onSelect: () => input.onCreateToolTab("changes"),
          },
          {
            id: "review" as const,
            label: labels.review,
            icon: <FileDiff />,
            onSelect: () => input.onCreateToolTab("review"),
          },
        ]),
    {
      id: "run",
      label: labels.run,
      icon: <Play />,
      onSelect: () => input.onCreateToolTab("run"),
    },
    ...(input.hideGitChrome
      ? []
      : [
          {
            id: "github" as const,
            label: labels.github,
            icon: <Github />,
            onSelect: () => input.onCreateToolTab("github"),
          },
        ]),
    {
      id: "simulator",
      label: labels.simulator,
      icon: <Smartphone />,
      onSelect: input.onCreateSimulator,
    },
  );

  return actions;
}
