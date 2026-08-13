"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  CSS,
  DndContext,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SortableContext,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  X,
  closestCenter,
  getFileIconProps,
  restrictToVerticalAxis,
  useSortable,
  verticalListSortingStrategy,
  type DragEndEvent,
} from "@workspace/ui";
import { Command, Inbox, List } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { AgentAttentionIndicator } from "@/features/agent/components/AgentAttentionIndicator";
import { AgentHookStatusIndicator } from "@/features/agent/components/AgentHookStatusIndicator";
import {
  type AttentionReason,
  useAgentAttentionStore,
} from "@/features/agent/store/agent-attention-store";
import { AGENT_STATE, useAgentHooksStore } from "@/features/agent/store/agent-hooks-store";
import type { OpenFile } from "@/features/editor/store/use-editor-store";
import type { CenterStageUiPrefs } from "@/shared/stores/use-ui-pref-hooks";
import {
  FIXED_TERMINAL_TAB_VALUE,
  TERMINAL_TAB_VALUE_PREFIX,
  useTerminalStore,
} from "@/features/terminal/store/use-terminal-store";
import { cn } from "@/shared/lib/utils";

/** Cap each group column so long labels truncate instead of stretching the popover. */
const TAB_GROUP_COLUMN_MAX_WIDTH_CLASS = "max-w-[240px]";

export const FIXED_TABS = new Set<string>(["overview", "wiki", "project-wiki", "code-review"]);
export const CENTER_TERMINAL_SHORTCUT_LIMIT = 5;

export type TabGroupItem = {
  id: string;
  label: string;
  value: string;
  kind:
    | "overview"
    | "wiki"
    | "terminal"
    | "project-wiki"
    | "code-review"
    | "file"
    | "diff"
    | "diff-group"
    | "review-diff"
    | "conflict"
    | "github-pr"
    | "github-issue"
    | "github-action"
    | "github-commit"
    | "browser"
    | "simulator";
  file?: OpenFile;
  /** Center browser instance id (for kind === "browser"). */
  browserId?: string;
  /** Internal preview browser tab id (for kind === "browser"). */
  browserTabId?: string;
  /** Preview browser prefs context key (for kind === "browser"). */
  browserContextId?: string;
  /** Favicon URL for browser internal tabs (kind === "browser"). */
  faviconUrl?: string;
  /**
   * Terminal family section id for the Terminals column
   * (e.g. "regular" | "project-wiki" | "code-review"). Different sections
   * are separated by a horizontal rule, like browser instances.
   */
  terminalSection?: string;
  /** Draw a horizontal rule above this item (e.g. between different browsers). */
  separatorBefore?: boolean;
};

export type TabGroupOrderByContext = CenterStageUiPrefs["tabGroupOrderByContext"];

export function applySavedTabGroupOrder(
  group: { key: string; label: string; tabs: TabGroupItem[] },
  savedOrder?: string[],
) {
  const normalizedSavedOrder = Array.isArray(savedOrder)
    ? savedOrder.filter((item): item is string => typeof item === "string")
    : [];
  if (!normalizedSavedOrder.length) {
    return group;
  }

  const orderIndex = new Map(normalizedSavedOrder.map((id, index) => [id, index]));
  const sortedBySaved = [...group.tabs].sort((left, right) => {
    const leftIndex = orderIndex.get(left.id);
    const rightIndex = orderIndex.get(right.id);
    if (leftIndex === undefined && rightIndex === undefined) return 0;
    if (leftIndex === undefined) return 1;
    if (rightIndex === undefined) return -1;
    return leftIndex - rightIndex;
  });
  return {
    ...group,
    tabs: sortedBySaved,
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
  const attentionReason = useAgentAttentionStore((s) => {
    let best: AttentionReason | null = null;
    for (const id of stablePaneIds) {
      const reason = s.panes.get(id)?.reason;
      if (!reason) continue;
      if (reason === "permission_request") return "permission_request" as const;
      best = reason;
    }
    return best;
  });

  // Live run/permission indicator takes precedence when active.
  if (state !== AGENT_STATE.IDLE) {
    return (
      <AgentHookStatusIndicator
        state={state}
        variant="compact"
        placement="center_terminal"
        className="ml-0.5"
      />
    );
  }
  // Sticky task-complete (or leftover permission) until the user focuses every pane.
  if (attentionReason) {
    return <AgentAttentionIndicator reason={attentionReason} className="ml-0.5" size={12} />;
  }
  return null;
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

const TAB_GROUP_LABEL_SELECTOR = "[data-tab-group-label]";

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
  const t = useTranslations("AppShell.chrome");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tab.id,
    data: {
      groupKey,
      // Browser internal tabs only reorder within the same browser instance.
      browserId: tab.browserId,
    },
  });

  const contentRef = React.useRef<HTMLDivElement>(null);
  const [isLabelTruncated, setIsLabelTruncated] = React.useState(false);
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const tooltipLabel = tab.file?.path ?? tab.label;

  React.useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const measure = () => {
      const labelEl = root.querySelector<HTMLElement>(TAB_GROUP_LABEL_SELECTOR);
      if (!labelEl) {
        setIsLabelTruncated(false);
        return;
      }
      // Sub-pixel rounding can leave a 1px gap between scroll and client width.
      setIsLabelTruncated(labelEl.scrollWidth > labelEl.clientWidth + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    const labelEl = root.querySelector<HTMLElement>(TAB_GROUP_LABEL_SELECTOR);
    if (labelEl) observer.observe(labelEl);
    return () => observer.disconnect();
  }, [tab.id, tab.label, tab.file?.name, tab.file?.path, children]);

  React.useEffect(() => {
    if (!isLabelTruncated) setTooltipOpen(false);
  }, [isLabelTruncated]);

  return (
    <Tooltip
      open={isLabelTruncated ? tooltipOpen : false}
      onOpenChange={(next) => {
        if (isLabelTruncated) setTooltipOpen(next);
      }}
    >
      <TooltipTrigger asChild>
        <div
          ref={setNodeRef}
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
            "group/tab-item relative flex h-10 w-full min-w-0 cursor-grab items-center gap-1 rounded-md pl-2 pr-2 text-left text-muted-foreground transition-colors active:cursor-grabbing",
            "hover:bg-sidebar-accent/70 hover:text-sidebar-foreground dark:hover:bg-muted/45",
            isActive && "bg-muted/40 hover:bg-sidebar-accent/70",
            isDragging && "z-10 opacity-70 shadow-md",
          )}
          {...attributes}
          {...listeners}
          role="button"
          tabIndex={0}
        >
          <div
            ref={contentRef}
            className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
          >
            {children}
          </div>
          {closable ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={t("centerStageTabs.closeTab", { label: tab.label })}
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
      </TooltipTrigger>
      {isLabelTruncated ? (
        <TooltipContent side="bottom" className="max-w-md break-all">
          {tooltipLabel}
        </TooltipContent>
      ) : null}
    </Tooltip>
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
  isItemActive,
  renderContent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: Array<{ key: string; label: string; tabs: TabGroupItem[] }>;
  activeValue: string;
  sensors: React.ComponentProps<typeof DndContext>["sensors"];
  onDragEnd: (event: DragEndEvent) => void;
  onSelect: (tab: TabGroupItem) => void;
  onClose: (tab: TabGroupItem) => void;
  isClosable: (tab: TabGroupItem) => boolean;
  /** Optional override for active highlighting (e.g. browser internal tabs). */
  isItemActive?: (tab: TabGroupItem) => boolean;
  renderContent: (tab: TabGroupItem) => React.ReactNode;
}) {
  const t = useTranslations("AppShell.chrome");

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-full! rounded-none border-0 px-4 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label={t("centerStageTabs.openTabGroups")}
        >
          <List className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto max-w-[calc(100vw-2rem)] overflow-hidden border-border/70 bg-popover/68 p-2 shadow-xl backdrop-blur-2xl"
      >
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-5 text-center">
            <Inbox className="size-8 text-muted-foreground/50" />
            <div className="text-sm font-medium text-muted-foreground">
              {t("centerStageTabs.empty.title")}
            </div>
            <p className="max-w-[200px] text-xs text-muted-foreground/70">
              {t("centerStageTabs.empty.description")}
            </p>
          </div>
        ) : (
          // Keep columns at their natural width (capped per column). When the
          // combined groups exceed the popover max width, scroll horizontally.
          <div className="scrollbar-on-hover max-h-[420px] max-w-full overflow-x-auto overflow-y-auto">
            <div className="grid w-max min-w-max grid-flow-col auto-cols-max gap-2">
              {groups.map((group) => (
                <section
                  key={group.key}
                  className={cn(
                    "flex max-h-[396px] min-h-0 w-max shrink-0 flex-col overflow-hidden rounded-md border border-border/45 bg-muted/45 backdrop-blur-md dark:bg-background/72",
                    TAB_GROUP_COLUMN_MAX_WIDTH_CLASS,
                  )}
                >
                  <header className="sticky top-0 z-10 h-10 shrink-0 px-3">
                    <div className="flex h-full items-center text-[11px] font-semibold tracking-wide text-muted-foreground">
                      {group.label}
                    </div>
                  </header>
                  <div className="scrollbar-on-hover min-h-0 w-full min-w-0 flex-1 space-y-1 overflow-y-auto p-2 pt-0">
                    {splitTabGroupSections(group).map((section, sectionIndex) => (
                      <React.Fragment key={section.key}>
                        {sectionIndex > 0 ? (
                          <div
                            aria-hidden
                            className="my-1.5 border-t border-border/60"
                          />
                        ) : null}
                        {/*
                          Each section (browser instance / terminal family) gets
                          its own DndContext so tabs cannot cross separators.
                        */}
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          modifiers={[restrictToVerticalAxis]}
                          onDragEnd={onDragEnd}
                        >
                          <SortableContext
                            items={section.tabs.map((tab) => tab.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="w-full min-w-0">
                              {section.tabs.map((tab) => (
                                <SortableTabGroupItem
                                  key={tab.id}
                                  groupKey={section.sortableKey}
                                  tab={tab}
                                  isActive={
                                    typeof isItemActive === "function"
                                      ? isItemActive(tab)
                                      : activeValue === tab.value
                                  }
                                  closable={isClosable(tab)}
                                  onSelect={() => onSelect(tab)}
                                  onClose={() => onClose(tab)}
                                >
                                  {renderContent(tab)}
                                </SortableTabGroupItem>
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      </React.Fragment>
                    ))}
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

/**
 * Split a group column into independent sortable sections.
 * Browser tabs are partitioned by browser instance; terminal tabs by family
 * (regular / project-wiki / code-review) so DnD cannot cross separators.
 */
function splitTabGroupSections(group: {
  key: string;
  tabs: TabGroupItem[];
}): Array<{ key: string; sortableKey: string; tabs: TabGroupItem[] }> {
  if (group.key === "browser") {
    return splitBySectionKey(group.tabs, (tab) => tab.browserId, "browser-instance");
  }

  if (group.key === "terminal") {
    return splitBySectionKey(
      group.tabs,
      (tab) => tab.terminalSection ?? tab.kind,
      "terminal-section",
    );
  }

  return [{ key: group.key, sortableKey: group.key, tabs: group.tabs }];
}

function splitBySectionKey(
  tabs: TabGroupItem[],
  getSectionId: (tab: TabGroupItem) => string | undefined,
  keyPrefix: string,
): Array<{ key: string; sortableKey: string; tabs: TabGroupItem[] }> {
  const sections: Array<{ key: string; sortableKey: string; tabs: TabGroupItem[] }> = [];
  let currentSectionId: string | undefined;
  let currentTabs: TabGroupItem[] = [];

  for (const tab of tabs) {
    const sectionId = getSectionId(tab);
    if (sectionId !== currentSectionId) {
      if (currentTabs.length > 0 && currentSectionId) {
        sections.push({
          key: `${keyPrefix}:${currentSectionId}`,
          sortableKey: `${keyPrefix}:${currentSectionId}`,
          tabs: currentTabs,
        });
      }
      currentSectionId = sectionId;
      currentTabs = [tab];
    } else {
      currentTabs.push(tab);
    }
  }

  if (currentTabs.length > 0) {
    const sectionId = currentSectionId ?? "unknown";
    sections.push({
      key: `${keyPrefix}:${sectionId}`,
      sortableKey: `${keyPrefix}:${sectionId}`,
      tabs: currentTabs,
    });
  }

  return sections;
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
