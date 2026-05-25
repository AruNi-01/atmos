"use client";

import React from "react";
import {
  Button,
  CSS,
  DndContext,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SortableContext,
  X,
  closestCenter,
  getFileIconProps,
  restrictToVerticalAxis,
  useSortable,
  verticalListSortingStrategy,
  type DragEndEvent,
} from "@workspace/ui";
import { Command, GripVertical, Inbox, List } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { AgentHookStatusIndicator } from "@/features/agent/components/AgentHookStatusIndicator";
import { AGENT_STATE, useAgentHooksStore } from "@/features/agent/store/agent-hooks-store";
import type { OpenFile } from "@/features/editor/store/use-editor-store";
import type { CenterStageUiPrefs } from "@/shared/stores/use-ui-pref-hooks";
import {
  FIXED_TERMINAL_TAB_VALUE,
  TERMINAL_TAB_VALUE_PREFIX,
  useTerminalStore,
} from "@/features/terminal/store/use-terminal-store";
import { cn } from "@/shared/lib/utils";

export const FIXED_TABS = new Set<string>(["overview", "wiki", "project-wiki", "code-review"]);
export const CENTER_TERMINAL_SHORTCUT_LIMIT = 4;

export type TabGroupItem = {
  id: string;
  label: string;
  value: string;
  kind: "overview" | "wiki" | "terminal" | "project-wiki" | "code-review" | "file" | "diff" | "diff-group" | "review-diff" | "conflict";
  file?: OpenFile;
};

export type TabGroupOrderByContext = CenterStageUiPrefs["tabGroupOrderByContext"];

export function applySavedTabGroupOrder(
  group: { key: string; label: string; tabs: TabGroupItem[] },
  savedOrder?: string[],
) {
  const normalizedSavedOrder = Array.isArray(savedOrder)
    ? savedOrder.filter((item): item is string => typeof item === "string")
    : [];
  if (!normalizedSavedOrder.length) return group;

  const orderIndex = new Map(normalizedSavedOrder.map((id, index) => [id, index]));
  return {
    ...group,
    tabs: [...group.tabs].sort((left, right) => {
      const leftIndex = orderIndex.get(left.id);
      const rightIndex = orderIndex.get(right.id);
      if (leftIndex === undefined && rightIndex === undefined) return 0;
      if (leftIndex === undefined) return 1;
      if (rightIndex === undefined) return -1;
      return leftIndex - rightIndex;
    }),
  };
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function FileIcon({ name, className }: { name: string; className?: string }) {
  const iconProps = getFileIconProps({ name, isDir: false, className });
  // eslint-disable-next-line @next/next/no-img-element -- file icons are tiny decorative SVG/data assets from the UI package.
  return <img {...iconProps} alt="" />;
}

// Inner component: only subscribes to agent store, receives pane IDs as stable prop.
function TerminalTabAgentIndicator({ stablePaneIds }: { stablePaneIds: string[] }) {
  const state = useAgentHooksStore((s) => {
    if (stablePaneIds.length === 0) return AGENT_STATE.IDLE;
    let hasRunning = false;
    for (const stablePaneId of stablePaneIds) {
      const paneState = s.getAgentStateForPaneId(stablePaneId);
      if (paneState === AGENT_STATE.PERMISSION_REQUEST) return AGENT_STATE.PERMISSION_REQUEST;
      if (paneState === AGENT_STATE.RUNNING) hasRunning = true;
    }
    return hasRunning ? AGENT_STATE.RUNNING : AGENT_STATE.IDLE;
  });
  if (state === AGENT_STATE.IDLE) return null;
  return <AgentHookStatusIndicator state={state} variant="compact" className="ml-0.5" />;
}

// Outer component keeps terminal and agent store subscriptions in separate render scopes.
export function TerminalTabAgentIndicatorWithPanes({ contextId, tabId }: { contextId: string; tabId: string }) {
  const stablePaneIds = useTerminalStore(
    useShallow((s) => {
      const panes = s.getPanes(contextId, tabId);
      return Object.values(panes)
        .map((p) => (p.tmuxWindowName ? `${contextId}:${p.tmuxWindowName}` : null))
        .filter((id): id is string => id !== null);
    })
  );
  return <TerminalTabAgentIndicator stablePaneIds={stablePaneIds} />;
}

export function SortableTabGroupItem({
  groupKey,
  tab,
  isActive,
  children,
  closable,
  onSelect,
  onClose,
}: {
  groupKey: string;
  tab: TabGroupItem;
  isActive: boolean;
  children: React.ReactNode;
  closable: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tab.id,
    data: { groupKey },
  });

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect();
      }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "group/tab-item relative flex h-10 w-full min-w-max cursor-pointer items-center gap-1 rounded-md pl-2 pr-2 text-left text-muted-foreground transition-colors",
        "hover:bg-sidebar-accent/70 hover:text-sidebar-foreground dark:hover:bg-muted/45",
        isActive && "bg-muted/40 hover:bg-sidebar-accent/70",
        isDragging && "z-10 opacity-70 shadow-md"
      )}
    >
      <span
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="-ml-0.5 -mr-1.5 flex size-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-0 transition-colors hover:text-foreground active:cursor-grabbing group-hover/tab-item:opacity-100"
        aria-label={`Drag ${tab.label}`}
        onClick={(event) => event.stopPropagation()}
      >
        <GripVertical className="size-3" />
      </span>
      {children}
      {closable ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Close ${tab.label}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
          className="ml-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-all hover:bg-muted-foreground/20 hover:text-foreground group-hover/tab-item:opacity-100"
        >
          <X className="size-3" />
        </span>
      ) : null}
    </div>
  );
}

export function CenterStageTabGroupPopover({
  open,
  onOpenChange,
  groups,
  activeValue,
  sensors,
  onDragEnd,
  onSelect,
  onClose,
  isClosable,
  renderContent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: Array<{ key: string; label: string; tabs: TabGroupItem[] }>;
  activeValue: string;
  sensors: React.ComponentProps<typeof DndContext>["sensors"];
  onDragEnd: (event: DragEndEvent) => void;
  onSelect: (value: string) => void;
  onClose: (tab: TabGroupItem) => void;
  isClosable: (tab: TabGroupItem) => boolean;
  renderContent: (tab: TabGroupItem) => React.ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-full rounded-none border-0 px-4 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label="Open tab groups"
        >
          <List className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)] border-border/70 bg-popover/68 p-2 shadow-xl backdrop-blur-2xl">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-5 text-center">
            <Inbox className="size-8 text-muted-foreground/50" />
            <div className="text-sm font-medium text-muted-foreground">No open tabs</div>
            <p className="max-w-[200px] text-xs text-muted-foreground/70">
              Only non-pinned tabs such as files, diffs, and conflict resolves will appear here.
            </p>
          </div>
        ) : (
          <div className="scrollbar-on-hover max-h-[420px] overflow-auto">
            <div className="grid min-w-max grid-flow-col auto-cols-max gap-2">
              {groups.map((group) => (
                <section
                  key={group.key}
                  className="flex max-h-[396px] min-h-0 w-fit flex-col overflow-hidden rounded-md border border-border/45 bg-muted/45 backdrop-blur-md dark:bg-background/72"
                >
                  <header className="sticky top-0 z-10 h-10 shrink-0 px-3">
                    <div className="flex h-full items-center text-[11px] font-semibold tracking-wide text-muted-foreground">
                      {group.label}
                    </div>
                  </header>
                  <div className="scrollbar-on-hover min-h-0 flex-1 w-full space-y-1 overflow-y-auto p-2 pt-0">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      modifiers={[restrictToVerticalAxis]}
                      onDragEnd={onDragEnd}
                    >
                      <SortableContext
                        items={group.tabs.map((tab) => tab.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="w-fit">
                          {group.tabs.map((tab) => (
                            <SortableTabGroupItem
                              key={tab.id}
                              groupKey={group.key}
                              tab={tab}
                              isActive={activeValue === tab.value}
                              closable={isClosable(tab)}
                              onSelect={() => onSelect(tab.value)}
                              onClose={() => onClose(tab)}
                            >
                              {renderContent(tab)}
                            </SortableTabGroupItem>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function isTerminalCenterTabValue(value: string | null | undefined): value is string {
  return value === FIXED_TERMINAL_TAB_VALUE || !!value?.startsWith(TERMINAL_TAB_VALUE_PREFIX);
}

export function ShortcutHint({ digit }: { digit: number | string }) {
  return (
    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
      <Command className="size-3" />
      <span className="text-xs">{digit}</span>
    </kbd>
  );
}

export function getRelativePath(path: string, basePath?: string): string {
  if (!basePath) return path;
  if (path === basePath) return ".";
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return path.startsWith(normalizedBase) ? path.slice(normalizedBase.length) : path;
}
