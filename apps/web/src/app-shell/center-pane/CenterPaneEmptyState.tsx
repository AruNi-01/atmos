"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  FileDiff,
  FolderTree,
  GitBranch,
  Github,
  LayoutDashboard,
  Play,
  Smartphone,
  SquareTerminal as TerminalIcon,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { CenterToolTabValue } from "@/app-shell/center-tool-tabs";

export type CenterPaneEmptyActionId =
  | "terminal"
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

/**
 * Empty center pane launcher — list of creatable tabs with optional shortcuts,
 * similar to a quiet command palette / Changes empty state.
 */
export function CenterPaneEmptyState({
  actions,
  className,
}: {
  actions: CenterPaneEmptyAction[];
  className?: string;
}) {
  const t = useTranslations("appShell.centerStageTabBar");

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col items-center justify-center bg-background px-6 py-8",
        className,
      )}
      data-center-pane-empty=""
    >
      <div className="w-full max-w-sm space-y-1">
        <p className="mb-3 px-3 text-center text-xs text-muted-foreground">
          {t("emptyPaneHint")}
        </p>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-foreground",
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            )}
            onClick={action.onSelect}
          >
            <span className="inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground">
              {action.icon}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{action.label}</span>
            {action.shortcutKeys && action.shortcutKeys.length > 0 ? (
              <ShortcutKeys keys={action.shortcutKeys} />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Build the default creatable-tab list for an empty secondary (or any) pane. */
export function buildDefaultEmptyPaneActions(input: {
  labels: {
    terminal: string;
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
  onCreateToolTab: (tab: CenterToolTabValue) => void;
  onCreateSimulator: () => void;
  onOpenOverview?: () => void;
}): CenterPaneEmptyAction[] {
  const { labels, modKey } = input;
  const actions: CenterPaneEmptyAction[] = [
    {
      id: "terminal",
      label: labels.terminal,
      icon: <TerminalIcon className="size-4" />,
      // Matches global new-terminal hotkey (⌘T / Ctrl+T).
      shortcutKeys: [modKey, "T"],
      onSelect: input.onCreateTerminal,
    },
    {
      id: "files",
      label: labels.files,
      icon: <FolderTree className="size-4" />,
      onSelect: () => input.onCreateToolTab("files"),
    },
    {
      id: "changes",
      label: labels.changes,
      icon: <GitBranch className="size-4" />,
      onSelect: () => input.onCreateToolTab("changes"),
    },
    {
      id: "review",
      label: labels.review,
      icon: <FileDiff className="size-4" />,
      onSelect: () => input.onCreateToolTab("review"),
    },
    {
      id: "run",
      label: labels.run,
      icon: <Play className="size-4" />,
      onSelect: () => input.onCreateToolTab("run"),
    },
    {
      id: "github",
      label: labels.github,
      icon: <Github className="size-4" />,
      onSelect: () => input.onCreateToolTab("github"),
    },
    {
      id: "simulator",
      label: labels.simulator,
      icon: <Smartphone className="size-4" />,
      onSelect: input.onCreateSimulator,
    },
  ];

  if (input.includeOverview && input.onOpenOverview) {
    actions.unshift({
      id: "overview",
      label: input.overviewLabel ?? "Overview",
      icon: <LayoutDashboard className="size-4" />,
      shortcutKeys: [modKey, "0"],
      onSelect: input.onOpenOverview,
    });
  }

  return actions;
}
