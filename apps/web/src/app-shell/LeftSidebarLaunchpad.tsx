"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import {
  ArrowRight,
  Bot,
  ChartColumnBig,
  Command,
  FolderKanban,
  HardDrive,
  Plus,
  Rocket,
  Presentation,
  Puzzle,
  SquareKanban,
  SquareTerminal,
  Timer,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type {
  LaunchpadItemId,
  LaunchpadItems,
  LaunchpadPlacement,
} from "@/features/settings/store/experiment-settings-store";
import { selectLaunchpadItemsByPlacement } from "@/features/settings/store/experiment-settings-store";

type LaunchpadItemDef = {
  id: LaunchpadItemId;
  labelKey: string;
  icon: typeof FolderKanban;
  path?: string;
  kind?: "new-workspace" | "canvas";
};

const ITEM_DEF_BY_ID: Record<LaunchpadItemId, LaunchpadItemDef> = {
  workspaces: { id: "workspaces", labelKey: "launchpad.items.workspaces", icon: FolderKanban, path: "/workspaces" },
  skills: { id: "skills", labelKey: "launchpad.items.skills", icon: Puzzle, path: "/skills" },
  terminals: { id: "terminals", labelKey: "launchpad.items.terminals", icon: SquareTerminal, path: "/terminals" },
  agents: { id: "agents", labelKey: "launchpad.items.agents", icon: Bot, path: "/agents" },
  automations: { id: "automations", labelKey: "launchpad.items.automations", icon: Timer, path: "/automations" },
  "disk-analyzer": { id: "disk-analyzer", labelKey: "launchpad.items.diskAnalyzer", icon: HardDrive, path: "/disk-analyzer" },
  "token-usage": { id: "token-usage", labelKey: "launchpad.items.tokenUsage", icon: ChartColumnBig, path: "/token-usage" },
  canvas: { id: "canvas", labelKey: "launchpad.items.canvas", icon: Presentation, kind: "canvas" },
  kanban: { id: "kanban", labelKey: "launchpad.items.kanban", icon: SquareKanban, path: "/kanban" },
  "new-workspace": { id: "new-workspace", labelKey: "launchpad.items.newWorkspace", icon: Plus, kind: "new-workspace" },
};

type LaunchpadSharedProps = {
  currentView: string;
  canvasOpen: boolean;
  /** New-workspace welcome overlay is open (query param / floating surface). */
  newWorkspaceOpen: boolean;
  onNavigate: (path: string) => void;
  onOpenCanvas: () => void;
  onOpenNewWorkspace: () => void;
};

function isLaunchpadItemActive(
  item: LaunchpadItemDef,
  shared: Pick<LaunchpadSharedProps, "currentView" | "canvasOpen" | "newWorkspaceOpen">,
): boolean {
  // Overlay surfaces (new-workspace / canvas) sit on top of the current route.
  // While one is open, only that item should highlight — route-backed items
  // (kanban, skills, …) resume their active state after the overlay collapses.
  if (shared.newWorkspaceOpen) {
    return item.kind === "new-workspace";
  }
  if (shared.canvasOpen) {
    return item.kind === "canvas";
  }
  if (item.kind === "canvas" || item.kind === "new-workspace") {
    return false;
  }
  return shared.currentView === item.id;
}

interface LeftSidebarLaunchpadProps extends LaunchpadSharedProps {
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  launchpadItems: LaunchpadItems;
}

export function LeftSidebarLaunchpadOutside({
  launchpadItems,
  ...shared
}: LaunchpadSharedProps & {
  launchpadItems: LaunchpadItems;
}) {
  const t = useTranslations("AppShell.chrome");
  const items = useMemo(
    () => resolveItemsForPlacement(launchpadItems, "outside"),
    [launchpadItems],
  );

  if (items.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-col">
      <nav
        // Match Launchpad header icon column (header px-5 = 20px):
        // nav px-2 + row px-3 → icon at 20px.
        className="flex flex-col gap-0.5 px-2 py-1.5"
        aria-label={t("launchpad.title")}
      >
        {items.map((item) => (
          <OutsideNavRow
            key={item.id}
            item={item}
            isActive={isLaunchpadItemActive(item, shared)}
            {...shared}
          />
        ))}
      </nav>
      {/* Full-width divider between outside items and the workspace list below */}
      <div className="border-b border-sidebar-border" role="separator" />
    </div>
  );
}

export function LeftSidebarLaunchpad({
  isExpanded,
  onExpandedChange,
  launchpadItems,
  ...shared
}: LeftSidebarLaunchpadProps) {
  const t = useTranslations("AppShell.chrome");
  const items = useMemo(
    () => resolveItemsForPlacement(launchpadItems, "inside"),
    [launchpadItems],
  );

  // Hide the entire Launchpad block when no inside items are enabled.
  if (items.length === 0) return null;

  return (
    <>
      <div
        className="h-10 flex items-center justify-between px-5 text-sm font-medium border-b border-sidebar-border cursor-pointer hover:bg-sidebar-accent/50 transition-colors select-none"
        onClick={() => onExpandedChange(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Rocket className="size-4 shrink-0" />
          <span>{t("launchpad.title")}</span>
        </div>
        <div className={cn("text-muted-foreground transition-transform duration-200", isExpanded ? "rotate-90" : "")}>
          <ArrowRight className="size-3.5" />
        </div>
      </div>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          isExpanded ? "grid-rows-[1fr] border-b border-sidebar-border" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-1 @[200px]:grid-cols-2">
            {items.map((item, index) => (
              <LaunchpadCard
                key={item.id}
                item={item}
                index={index}
                totalItems={items.length}
                isActive={isLaunchpadItemActive(item, shared)}
                {...shared}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function resolveItemsForPlacement(
  configs: LaunchpadItems,
  placement: LaunchpadPlacement,
): LaunchpadItemDef[] {
  return selectLaunchpadItemsByPlacement(configs, placement).map(
    (id) => ITEM_DEF_BY_ID[id],
  );
}

/** Simple icon + name row for items pinned outside the Launchpad collapsible. */
function OutsideNavRow({
  item,
  isActive,
  onNavigate,
  onOpenCanvas,
  onOpenNewWorkspace,
}: LaunchpadSharedProps & {
  item: LaunchpadItemDef;
  isActive: boolean;
}) {
  const t = useTranslations("AppShell.chrome");
  const Icon = item.icon;
  const label = t(item.labelKey);

  const className = cn(
    // px-3 pairs with nav px-2 so icons line up with the Launchpad header rocket (px-5).
    "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors outline-none",
    "focus-visible:ring-1 focus-visible:ring-ring",
    isActive
      ? "bg-sidebar-accent text-sidebar-foreground"
      : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
  );

  const content = (
    <>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{label}</span>
    </>
  );

  if (item.kind === "canvas") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={onOpenCanvas} className={className} aria-current={isActive ? "page" : undefined}>
            {content}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <div className="flex items-center gap-2">
            <span>{label}</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
              <Command className="size-3" />
              <span className="text-xs">⇧</span>
              <span className="text-xs">H</span>
            </kbd>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (item.kind === "new-workspace") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpenNewWorkspace}
            className={className}
            aria-current={isActive ? "page" : undefined}
          >
            {content}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <div className="flex items-center gap-2">
            <span>{label}</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
              <Command className="size-3" />
              <span className="text-xs">N</span>
            </kbd>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button
      type="button"
      onClick={() => item.path && onNavigate(item.path)}
      className={className}
      aria-current={isActive ? "page" : undefined}
    >
      {content}
    </button>
  );
}

function LaunchpadCard({
  item,
  index = 0,
  totalItems = 1,
  isActive,
  onNavigate,
  onOpenCanvas,
  onOpenNewWorkspace,
}: LaunchpadSharedProps & {
  item: LaunchpadItemDef;
  index?: number;
  totalItems?: number;
  isActive: boolean;
}) {
  const t = useTranslations("AppShell.chrome");
  const Icon = item.icon;
  const isOddCount = totalItems % 2 === 1;
  const isLeftColumnOnTwoCol = index % 2 === 0;
  const isLastItemAlone = isOddCount && index === totalItems - 1;
  const cardClassName = cn(
    "group relative h-12 cursor-pointer overflow-hidden transition-all duration-300 outline-none",
    "border-b border-b-sidebar-border/30 transition-colors",
    isLastItemAlone
      ? "@[200px]:col-span-2"
      : isLeftColumnOnTwoCol && "@[200px]:border-r @[200px]:border-sidebar-border/30",
    isActive ? "text-sidebar-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
  );
  const cardInner = (
    <>
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ scaleX: 0, opacity: 0 }}
            transition={{
              default: { ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: 0.5 },
              scaleX: {
                duration: isActive ? 0.6 : 1.0,
                type: "tween",
              },
            }}
            className="absolute bottom-0 left-0 right-0 h-px bg-sidebar-foreground z-10 origin-center"
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col h-[200%] w-full transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) group-hover:-translate-y-1/2">
        <div className="flex items-center justify-center h-1/2 w-full transition-all duration-300 group-hover:opacity-0 group-hover:scale-90">
          <Icon className="size-4.5" />
        </div>
        <div className="flex items-center justify-center h-1/2 w-full px-1">
          <span className="text-[10px] font-bold uppercase tracking-tight text-center leading-none">
            {t(item.labelKey)}
          </span>
        </div>
      </div>
    </>
  );

  if (item.kind === "canvas") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div onClick={onOpenCanvas} className={cardClassName}>
            {cardInner}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="flex items-center gap-2">
            <span>{t("launchpad.items.canvas")}</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
              <Command className="size-3" />
              <span className="text-xs">⇧</span>
              <span className="text-xs">H</span>
            </kbd>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (item.kind === "new-workspace") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div onClick={onOpenNewWorkspace} className={cardClassName}>
            {cardInner}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="flex items-center gap-2">
            <span>{t("launchpad.items.newWorkspace")}</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
              <Command className="size-3" />
              <span className="text-xs">N</span>
            </kbd>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      onClick={() => item.path && onNavigate(item.path)}
      className={cardClassName}
    >
      {cardInner}
    </div>
  );
}
