"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  closestCenter,
  cn,
  CSS,
  DndContext,
  PointerSensor,
  SortableContext,
  pointerWithin,
  rectSortingStrategy,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
  useSortable,
  verticalListSortingStrategy,
  type CollisionDetection,
  type DragEndEvent,
} from "@workspace/ui";
import {
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
import {
  LAUNCHPAD_DROP_INSIDE,
  LAUNCHPAD_DROP_OUTSIDE,
  isLaunchpadItemId,
  selectLaunchpadItemsByPlacement,
  useExperimentSettingsStore,
} from "@/features/settings/store/experiment-settings-store";

let suppressLaunchpadClick = false;
let previousBodyCursor = "";

function markLaunchpadDragStarted() {
  suppressLaunchpadClick = true;
  previousBodyCursor = document.body.style.cursor;
  document.body.style.cursor = "default";
}

function consumeLaunchpadDragClick() {
  if (!suppressLaunchpadClick) return false;
  suppressLaunchpadClick = false;
  return true;
}

function releaseLaunchpadClickSuppression() {
  document.body.style.cursor = previousBodyCursor;
  window.setTimeout(() => {
    suppressLaunchpadClick = false;
  }, 0);
}

const launchpadCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const itemHits = pointerHits.filter((hit) => isLaunchpadItemId(String(hit.id)));
  if (itemHits.length > 0) return itemHits;
  if (pointerHits.length > 0) return pointerHits;
  return closestCenter(args);
};

function handleLaunchpadActivate(
  event: React.MouseEvent,
  action: () => void,
) {
  if (consumeLaunchpadDragClick()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  action();
}

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

export function LeftSidebarLaunchpadBlock(props: LeftSidebarLaunchpadProps) {
  const reorderLaunchpadItems = useExperimentSettingsStore(
    (s) => s.reorderLaunchpadItems,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 400, tolerance: 8 },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    releaseLaunchpadClickSuppression();
    const overId = event.over?.id;
    if (overId == null) return;
    void reorderLaunchpadItems(String(event.active.id), String(overId));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={launchpadCollisionDetection}
      onDragStart={markLaunchpadDragStarted}
      onDragCancel={releaseLaunchpadClickSuppression}
      onDragEnd={handleDragEnd}
    >
      <div className="flex shrink-0 flex-col">
        <LeftSidebarLaunchpad {...props} />
        <LeftSidebarLaunchpadOutside {...props} />
      </div>
    </DndContext>
  );
}

function LaunchpadSortableShell({
  id,
  className,
  children,
}: {
  id: LaunchpadItemId;
  className?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "cursor-default select-none",
        className,
        isDragging && "relative z-20 opacity-50",
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        cursor: "default",
        touchAction: "none",
      }}
      {...listeners}
    >
      {children}
    </div>
  );
}

function LaunchpadInsideDroppable({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: LAUNCHPAD_DROP_INSIDE });
  return (
    <div
      ref={setNodeRef}
      className="mx-2.5 mb-1.5 overflow-hidden rounded-2xl border border-border/70 bg-muted/20"
    >
      {children}
    </div>
  );
}

function LaunchpadInsideGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">{children}</div>
  );
}

function LaunchpadOutsideDroppable({
  children,
  label,
  empty,
}: {
  children: React.ReactNode;
  label: string;
  empty?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: LAUNCHPAD_DROP_OUTSIDE });
  return (
    <nav
      ref={setNodeRef}
      className={cn("flex flex-col gap-0.5 px-2 py-1.5", empty && "min-h-8")}
      aria-label={label}
    >
      {children}
    </nav>
  );
}

export function LeftSidebarLaunchpadOutside({
  launchpadItems,
  ...shared
}: LaunchpadSharedProps & {
  launchpadItems: LaunchpadItems;
}) {
  const t = useTranslations("AppShell.chrome");
  const { active } = useDndContext();
  const items = useMemo(
    () => resolveItemsForPlacement(launchpadItems, "outside"),
    [launchpadItems],
  );

  if (items.length === 0 && !active) return null;

  const itemIds = items.map((item) => item.id);

  return (
    <div className="flex shrink-0 flex-col">
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <LaunchpadOutsideDroppable
          label={t("launchpad.title")}
          empty={items.length === 0}
        >
          {items.map((item) => (
            <LaunchpadSortableShell key={item.id} id={item.id}>
              <OutsideNavRow
                item={item}
                isActive={isLaunchpadItemActive(item, shared)}
                {...shared}
              />
            </LaunchpadSortableShell>
          ))}
        </LaunchpadOutsideDroppable>
      </SortableContext>
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
  const { active } = useDndContext();
  const items = useMemo(
    () => resolveItemsForPlacement(launchpadItems, "inside"),
    [launchpadItems],
  );

  // Hide the Launchpad chrome when no inside items are enabled, unless a drag
  // is in progress so the empty card can receive a cross-list drop.
  if (items.length === 0 && !active) return null;

  return (
    <LaunchpadInsideDroppable>
      <button
        type="button"
        aria-expanded={isExpanded}
        className="flex h-9 w-full cursor-pointer select-none items-center gap-2 px-3 text-sm font-medium outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => onExpandedChange(!isExpanded)}
        onMouseEnter={() => rocketRef.current?.startAnimation?.()}
        onMouseLeave={() => rocketRef.current?.stopAnimation?.()}
      >
        <RocketIcon ref={rocketRef} className="inline-flex shrink-0" size={16} />
        <span>{t("launchpad.title")}</span>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
            <div
              className={cn(
                "border-t border-border/60 px-1.5 pb-1.5 pt-1.5 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                isExpanded ? "opacity-100" : "opacity-0",
              )}
            >
              <SortableContext
                items={items.map((item) => item.id)}
                strategy={rectSortingStrategy}
              >
                <LaunchpadInsideGrid>
                  {items.map((item) => (
                    <LaunchpadSortableShell key={item.id} id={item.id}>
                      <LaunchpadCard
                        item={item}
                        isActive={isLaunchpadItemActive(item, shared)}
                        {...shared}
                      />
                    </LaunchpadSortableShell>
                  ))}
                </LaunchpadInsideGrid>
              </SortableContext>
            </div>
        </div>
      </div>
    </LaunchpadInsideDroppable>
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
    // Instant hover fill — match settings SidebarMenuButton (no color fade).
    "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm outline-none cursor-default",
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
        onClick={(event) => handleLaunchpadActivate(event, onOpenPtDesign)}
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
            onClick={(event) => handleLaunchpadActivate(event, onOpenCanvas)}
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
            onClick={(event) => handleLaunchpadActivate(event, onOpenNewWorkspace)}
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
      onClick={(event) =>
        handleLaunchpadActivate(event, () => {
          if (item.path) onNavigate(item.path);
        })
      }
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
    "flex h-9 w-full items-center justify-center rounded-xl outline-none cursor-default",
    "focus-visible:ring-1 focus-visible:ring-ring",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "bg-background/50 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  );
  const hoverHandlers = {
    onMouseEnter: () => iconRef.current?.startAnimation?.(),
    onMouseLeave: () => iconRef.current?.stopAnimation?.(),
  };

  const activate = () => {
    if (item.kind === "canvas") {
      onOpenCanvas();
      return;
    }
    if (item.kind === "new-workspace") {
      onOpenNewWorkspace();
      return;
    }
    if (item.kind === "pt-design") {
      onOpenPtDesign();
      return;
    }
    if (item.path) onNavigate(item.path);
  };

  const shortcut =
    item.kind === "canvas" ? (
      <>
        <span className="text-xs">⇧</span>
        <span className="text-xs">H</span>
      </>
    ) : item.kind === "new-workspace" ? (
      <span className="text-xs">N</span>
    ) : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(event) => handleLaunchpadActivate(event, activate)}
          className={className}
          aria-label={label}
          aria-current={isActive ? "page" : undefined}
          {...hoverHandlers}
        >
          <LaunchpadOutsideIcon itemId={item.id} iconRef={iconRef} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {shortcut ? (
          <div className="flex items-center gap-2">
            <span>{label}</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
              <Command className="size-3" />
              {shortcut}
            </kbd>
          </div>
        ) : (
          label
        )}
      </TooltipContent>
    </Tooltip>
  );
}
