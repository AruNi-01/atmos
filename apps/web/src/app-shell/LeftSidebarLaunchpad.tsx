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
  PencilRuler,
  Plus,
  Presentation,
  Puzzle,
  ListTodo,
  SquareTerminal,
  Timer,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { BotIcon } from "@workspace/ui/components/icons/bot-icon";
import CanvasIcon from "@workspace/ui/components/icons/canvas-icon";
import { ChartColumnBigIcon } from "@workspace/ui/components/icons/chart-column-big-icon";
import { FolderKanbanIcon } from "@workspace/ui/components/icons/folder-kanban-icon";
import { HardDriveIcon } from "@workspace/ui/components/icons/hard-drive-icon";
import { ListTodoIcon } from "@workspace/ui/components/icons/list-todo-icon";
import { PencilRulerIcon } from "@workspace/ui/components/icons/pencil-ruler-icon";
import { PlusIcon } from "@workspace/ui/components/icons/plus-icon";
import { PuzzleIcon } from "@workspace/ui/components/icons/puzzle-icon";
import { RocketIcon } from "@workspace/ui/components/icons/rocket-icon";
import TerminalIcon from "@workspace/ui/components/icons/terminal-icon";
import { TimerIcon } from "@workspace/ui/components/icons/timer-icon";
import type { AnimatedIconHandle } from "@workspace/ui/components/icons/types";

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
  kind?: "new-workspace" | "canvas" | "pt-design";
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
  "pt-design": { id: "pt-design", labelKey: "launchpad.items.ptDesign", icon: PencilRuler, kind: "pt-design" },
  tasks: { id: "tasks", labelKey: "launchpad.items.tasks", icon: ListTodo, path: "/tasks" },
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
  onOpenPtDesign: () => void;
  ptDesignOpen: boolean;
};

function isLaunchpadItemActive(
  item: LaunchpadItemDef,
  shared: Pick<LaunchpadSharedProps, "currentView" | "canvasOpen" | "newWorkspaceOpen" | "ptDesignOpen">,
): boolean {
  // Overlay surfaces (new-workspace / canvas) sit on top of the current route.
  // While one is open, only that item should highlight — route-backed items
  // (tasks, skills, …) resume their active state after the overlay collapses.
  if (shared.newWorkspaceOpen) {
    return item.kind === "new-workspace";
  }
  if (shared.canvasOpen) {
    return item.kind === "canvas";
  }
  if (item.kind === "pt-design") {
    return shared.ptDesignOpen && !shared.canvasOpen && !shared.newWorkspaceOpen;
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
  const rocketRef = React.useRef<AnimatedIconHandle | null>(null);
  const items = useMemo(
    () => resolveItemsForPlacement(launchpadItems, "inside"),
    [launchpadItems],
  );

  // Hide the entire Launchpad block when no inside items are enabled.
  if (items.length === 0) return null;

  return (
    <>
      <div
        className="flex h-10 cursor-pointer select-none items-center justify-between px-5 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={() => onExpandedChange(!isExpanded)}
        onMouseEnter={() => rocketRef.current?.startAnimation?.()}
        onMouseLeave={() => rocketRef.current?.stopAnimation?.()}
      >
        <div className="flex items-center gap-2">
          <RocketIcon ref={rocketRef} className="inline-flex shrink-0" size={16} />
          <span>{t("launchpad.title")}</span>
        </div>
        <div className={cn("text-muted-foreground transition-transform duration-200", isExpanded ? "rotate-90" : "")}>
          <ArrowRight className="size-3.5" />
        </div>
      </div>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
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

function LaunchpadOutsideIcon({
  itemId,
  iconRef,
}: {
  itemId: LaunchpadItemId;
  iconRef: React.RefObject<AnimatedIconHandle | null>;
}) {
  const className = "inline-flex shrink-0";
  const size = 16;
  if (itemId === "workspaces") return <FolderKanbanIcon ref={iconRef} className={className} size={size} />;
  if (itemId === "skills") return <PuzzleIcon ref={iconRef} className={className} size={size} />;
  if (itemId === "terminals") return <TerminalIcon ref={iconRef} className={className} size={size} />;
  if (itemId === "agents") return <BotIcon ref={iconRef} className={className} size={size} />;
  if (itemId === "automations") return <TimerIcon ref={iconRef} className={className} size={size} />;
  if (itemId === "disk-analyzer") return <HardDriveIcon ref={iconRef} className={className} size={size} />;
  if (itemId === "token-usage") return <ChartColumnBigIcon ref={iconRef} className={className} size={size} />;
  if (itemId === "canvas") return <CanvasIcon ref={iconRef} className={className} size={size} />;
  if (itemId === "pt-design") return <PencilRulerIcon ref={iconRef} className={className} size={size} />;
  if (itemId === "tasks") return <ListTodoIcon ref={iconRef} className={className} size={size} />;
  return <PlusIcon ref={iconRef} className={className} size={size} />;
}

/** Simple icon + name row for items pinned outside the Launchpad collapsible. */
function OutsideNavRow({
  item,
  isActive,
  onNavigate,
  onOpenCanvas,
  onOpenNewWorkspace,
  onOpenPtDesign,
}: LaunchpadSharedProps & {
  item: LaunchpadItemDef;
  isActive: boolean;
}) {
  const t = useTranslations("AppShell.chrome");
  const iconRef = React.useRef<AnimatedIconHandle | null>(null);
  const label = t(item.labelKey);

  const className = cn(
    // px-3 pairs with nav px-2 so icons line up with the Launchpad header rocket (px-5).
    // Instant hover fill — match settings SidebarMenuButton (no color fade).
    "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm outline-none",
    "focus-visible:ring-1 focus-visible:ring-ring",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  );

  const hoverHandlers = {
    onMouseEnter: () => iconRef.current?.startAnimation?.(),
    onMouseLeave: () => iconRef.current?.stopAnimation?.(),
  };

  const content = (
    <>
      <LaunchpadOutsideIcon itemId={item.id} iconRef={iconRef} />
      <span className="min-w-0 truncate">{label}</span>
    </>
  );

  if (item.kind === "pt-design") {
    return (
      <button
        type="button"
        onClick={onOpenPtDesign}
        className={className}
        aria-current={isActive ? "page" : undefined}
        aria-label={label}
        {...hoverHandlers}
      >
        {content}
      </button>
    );
  }

  if (item.kind === "canvas") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpenCanvas}
            className={className}
            aria-current={isActive ? "page" : undefined}
            {...hoverHandlers}
          >
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
            {...hoverHandlers}
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
      {...hoverHandlers}
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
  onOpenPtDesign,
}: LaunchpadSharedProps & {
  item: LaunchpadItemDef;
  index?: number;
  totalItems?: number;
  isActive: boolean;
}) {
  const t = useTranslations("AppShell.chrome");
  const Icon = item.icon;
  const isOddCount = totalItems % 2 === 1;
  const isLastItemAlone = isOddCount && index === totalItems - 1;
  const cardClassName = cn(
    "group relative h-12 cursor-pointer overflow-hidden outline-none transition-all duration-300 transition-colors",
    isLastItemAlone ? "@[200px]:col-span-2" : null,
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
          <span className="text-[10px] font-medium tracking-tight text-center leading-none">
            {t(item.labelKey)}
          </span>
        </div>
      </div>
    </>
  );

  if (item.kind === "pt-design") {
    return (
      <div onClick={onOpenPtDesign} className={cardClassName} role="button" aria-label={t("launchpad.items.ptDesign")}>
        {cardInner}
      </div>
    );
  }

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
