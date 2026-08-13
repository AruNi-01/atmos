"use client";

import React from "react";
import {
  arrayMove,
  closestCenter,
  CSS,
  DndContext,
  horizontalListSortingStrategy,
  KeyboardSensor,
  PointerSensor,
  Popover,
  PopoverContent,
  PopoverTrigger,
  restrictToHorizontalAxis,
  SortableContext,
  sortableKeyboardCoordinates,
  TabsTab,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useSensor,
  useSensors,
  useSortable,
  X,
  type DragEndEvent,
} from "@workspace/ui";
import {
  BookOpen,
  Bot,
  Globe,
  LoaderCircle,
  Plus,
  RotateCw,
  SquareTerminal as TerminalIcon,
  Tablet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { OpenFile } from "@/features/editor/store/use-editor-store";
import { cn } from "@/shared/lib/utils";
import {
  CenterStageTabGroupPopover,
  CENTER_TERMINAL_SHORTCUT_LIMIT,
  ShortcutHint,
  TerminalTabAgentIndicatorWithPanes,
  type TabGroupItem,
} from "@/app-shell/center-stage-tabs";
import {
  CenterStageOpenFileTab,
  CenterStageOverviewTab,
  CenterStageSurfaceContentTab,
  CenterStageStickyTabActions,
  CenterStageTabGroupItemContent,
  CenterStageTabList,
  getCenterStageSurfaceTabVariant,
} from "@/app-shell/center-stage-shared-tabs";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { useAgentAttentionStore } from "@/features/agent/store/agent-attention-store";
import { useTerminalCenterTabPresentation } from "@/features/terminal/hooks/use-terminal-center-tab-presentation";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";
import { useShallow } from "zustand/react/shallow";
import type { CenterTabContextMenuState, CenterTabDescriptor } from "@/app-shell/center-stage-tab-model";
import {
  orderCenterTabsBySavedOrder,
  preventNonPrimaryTabActivate,
} from "@/app-shell/center-stage-tab-model";
import type { GithubCenterTab } from "@/features/github/store/use-github-center-tabs";
import type { BrowserCenterTab } from "@/features/browser/store/use-browser-center-tabs";
import {
  getActivePreviewBrowserFaviconUrl,
  getActivePreviewBrowserLabel,
  type PreviewBrowserPrefs,
} from "@/features/browser/lib/browser-labels";

type SessionDisplay = {
  sessionTitle?: string | null;
  revisionLabel?: string | null;
} | null;

interface CenterStageTabBarProps {
  activeValue: string;
  browserFallbackLabel: string;
  browserTabs: BrowserCenterTab[];
  codeReviewTabVisible: boolean;
  effectiveContextId: string;
  githubTabs: GithubCenterTab[];
  isTabGroupItemActive: (tab: TabGroupItem) => boolean;
  openFiles: OpenFile[];
  orderedGroupedTabItems: Array<{ key: string; label: string; tabs: TabGroupItem[] }>;
  previewBrowserPrefs: PreviewBrowserPrefs;
  projectWikiTabVisible: boolean;
  scrollableTabsRef: React.RefObject<HTMLDivElement | null>;
  sessionDisplay: SessionDisplay;
  simulatorOpenedAt: number;
  simulatorTabOpen: boolean;
  tabGroupDndSensors: React.ComponentProps<typeof CenterStageTabGroupPopover>["sensors"];
  tabGroupPopoverOpen: boolean;
  /** Saved strip order (tab ids). Missing/new tabs append after. */
  tabStripOrder: string[];
  termTabPlusHoveredTabId: string | null;
  visibleTerminalTabs: Array<{ id: string; title: string; closable: boolean; customTitle?: string }>;
  wikiCenterEligible: boolean;
  wikiRefreshing: boolean;
  handleCenterStageTabChange: (value: string) => void;
  handleCloseTabGroupItem: (tab: TabGroupItem) => void;
  handleCloseBrowserTab: (value: string) => void;
  handleCloseFile: (file: OpenFile) => void;
  handleCloseGithubTab: (value: string) => void;
  handleCloseTerminalCenterTab: (tabId: string) => void;
  handleCreateBrowserCenterTab: () => void;
  handleCreateSimulatorCenterTab: () => void;
  handleCloseSimulatorCenterTab: () => void;
  handleCreateTerminalCenterTab: () => void;
  handleRenameTerminalCenterTab: (tabId: string, title: string) => void;
  handleSelectTabGroupItem: (tab: TabGroupItem) => void;
  handleTabGroupDragEnd: (event: DragEndEvent) => void;
  onTabStripOrderChange: (order: string[]) => void;
  pinFile: (path: string, workspaceId?: string) => void;
  setCodeReviewCloseConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setProjectWikiCloseConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTabContextMenu: (value: CenterTabContextMenuState) => void;
  setTabGroupPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTermTabPlusHoveredTabId: React.Dispatch<React.SetStateAction<string | null>>;
  setWikiRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  setWikiRefreshTrigger: React.Dispatch<React.SetStateAction<number>>;
}

export function CenterStageTabBar({
  activeValue,
  browserFallbackLabel,
  browserTabs,
  codeReviewTabVisible,
  effectiveContextId,
  githubTabs,
  isTabGroupItemActive,
  openFiles,
  orderedGroupedTabItems,
  previewBrowserPrefs,
  projectWikiTabVisible,
  scrollableTabsRef,
  sessionDisplay,
  simulatorOpenedAt,
  simulatorTabOpen,
  tabGroupDndSensors,
  tabGroupPopoverOpen,
  tabStripOrder,
  termTabPlusHoveredTabId,
  visibleTerminalTabs,
  wikiCenterEligible,
  wikiRefreshing,
  handleCenterStageTabChange: _handleCenterStageTabChange,
  handleCloseTabGroupItem,
  handleCloseBrowserTab,
  handleCloseFile,
  handleCloseGithubTab,
  handleCloseSimulatorCenterTab,
  handleCloseTerminalCenterTab,
  handleCreateBrowserCenterTab,
  handleCreateSimulatorCenterTab,
  handleCreateTerminalCenterTab,
  handleRenameTerminalCenterTab,
  handleSelectTabGroupItem,
  handleTabGroupDragEnd,
  onTabStripOrderChange,
  pinFile,
  setCodeReviewCloseConfirmOpen,
  setProjectWikiCloseConfirmOpen,
  setTabContextMenu,
  setTabGroupPopoverOpen,
  setTermTabPlusHoveredTabId,
  setWikiRefreshing,
  setWikiRefreshTrigger,
}: CenterStageTabBarProps) {
  const t = useTranslations("appShell");
  const newTerminalTabLabel = t("centerStageTabBar.newTerminalTab");
  const newBrowserLabel = t("centerStageTabBar.newBrowser");
  const newSimulatorLabel = t("centerStageTabBar.newSimulator");
  const newTabMenuLabel = t("centerStageTabBar.newTabMenu");

  const renderTabGroupItemContent = React.useCallback((tab: TabGroupItem) => {
    return <CenterStageTabGroupItemContent effectiveContextId={effectiveContextId} tab={tab} />;
  }, [effectiveContextId]);

  // Natural open-order among file / github / browser surface tabs (before pin reordering).
  const orderedSurfaceTabs = React.useMemo<
    Array<
      | { type: "file"; openedAt: number; file: OpenFile }
      | { type: "github"; openedAt: number; tab: GithubCenterTab }
      | { type: "browser"; openedAt: number; tab: BrowserCenterTab }
      | { type: "simulator"; openedAt: number }
    >
  >(() => {
    const items = [
      ...openFiles.map(
        (file) => ({ type: "file" as const, openedAt: file.lastOpenedAt, file }),
      ),
      ...githubTabs.map(
        (tab) => ({ type: "github" as const, openedAt: tab.openedAt, tab }),
      ),
      ...browserTabs.map(
        (tab) => ({ type: "browser" as const, openedAt: tab.openedAt, tab }),
      ),
      ...(simulatorTabOpen
        ? [{ type: "simulator" as const, openedAt: simulatorOpenedAt }]
        : []),
    ];
    return items.sort((left, right) => left.openedAt - right.openedAt);
  }, [browserTabs, githubTabs, openFiles, simulatorOpenedAt, simulatorTabOpen]);

  // Base visual order: terminals → special terminals → surface tabs by open time.
  // User drag order is applied on top via tabStripOrder.
  const baseOrderedDescriptors = React.useMemo<CenterTabDescriptor[]>(() => {
    const descriptors: CenterTabDescriptor[] = [];

    for (const tab of visibleTerminalTabs) {
      descriptors.push({
        id: tab.id,
        value: tab.id,
        kind: "terminal",
        label: tab.customTitle || tab.title,
        customTitle: tab.customTitle,
      });
    }

    if (projectWikiTabVisible) {
      descriptors.push({
        id: "project-wiki",
        value: "project-wiki",
        kind: "project-wiki",
        label: t("centerStageTabBar.projectWiki"),
      });
    }

    if (codeReviewTabVisible) {
      descriptors.push({
        id: "code-review",
        value: "code-review",
        kind: "code-review",
        label: t("centerStageTabBar.codeReview"),
      });
    }

    for (const item of orderedSurfaceTabs) {
      if (item.type === "file") {
        const variant = getCenterStageSurfaceTabVariant(item.file.path);
        descriptors.push({
          id: item.file.path,
          value: item.file.path,
          kind: variant === "file" ? "file" : variant,
          label: item.file.name,
          file: item.file,
        });
        continue;
      }

      if (item.type === "browser") {
        const browserContext =
          previewBrowserPrefs.byContext[item.tab.browserContextId];
        const label = getActivePreviewBrowserLabel(
          browserContext,
          browserFallbackLabel,
        );
        descriptors.push({
          id: item.tab.value,
          value: item.tab.value,
          kind: "browser",
          label,
        });
        continue;
      }

      if (item.type === "simulator") {
        descriptors.push({
          id: "simulator",
          value: "simulator",
          kind: "simulator",
          label: t("centerStageTabBar.simulator"),
        });
        continue;
      }

      descriptors.push({
        id: item.tab.value,
        value: item.tab.value,
        kind: item.tab.kind,
        label: item.tab.label,
      });
    }

    return descriptors;
  }, [
    browserFallbackLabel,
    codeReviewTabVisible,
    orderedSurfaceTabs,
    previewBrowserPrefs,
    projectWikiTabVisible,
    t,
    visibleTerminalTabs,
  ]);

  const orderedDescriptors = React.useMemo(
    () => orderCenterTabsBySavedOrder(baseOrderedDescriptors, tabStripOrder),
    [baseOrderedDescriptors, tabStripOrder],
  );

  const stripDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleStripDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = orderedDescriptors.map((tab) => tab.id);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      onTabStripOrderChange(arrayMove(ids, oldIndex, newIndex));
    },
    [onTabStripOrderChange, orderedDescriptors],
  );

  const openContextMenu = React.useCallback(
    (event: React.MouseEvent, tab: CenterTabDescriptor) => {
      event.preventDefault();
      event.stopPropagation();
      setTabContextMenu({
        x: event.clientX,
        y: event.clientY,
        tab,
        orderedTabs: orderedDescriptors,
      });
    },
    [orderedDescriptors, setTabContextMenu],
  );

  React.useEffect(() => {
    const root = scrollableTabsRef.current;
    if (!root) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      if (!(event.target instanceof Element) || !root.contains(event.target)) return;

      const primaryDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (primaryDelta === 0) return;

      const maxScrollLeft = root.scrollWidth - root.clientWidth;
      if (maxScrollLeft <= 0) return;

      const next = Math.max(0, Math.min(maxScrollLeft, root.scrollLeft + primaryDelta));
      if (next === root.scrollLeft) return;
      event.preventDefault();
      root.scrollLeft = next;
    };

    root.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", handleWheel);
    };
  }, [scrollableTabsRef, orderedDescriptors.length]);

  const renderDescriptorTab = (tab: CenterTabDescriptor) => {
    if (tab.kind === "terminal") {
      const source = visibleTerminalTabs.find((item) => item.id === tab.value);
      if (!source) return null;
      const index = visibleTerminalTabs.findIndex((item) => item.id === tab.value);
      return (
        <TerminalExtraTab
          key={tab.id}
          activeValue={activeValue}
          effectiveContextId={effectiveContextId}
          hasShortcut={index >= 0 && index < CENTER_TERMINAL_SHORTCUT_LIMIT}
          hoveredTabId={termTabPlusHoveredTabId}
          shortcutDigit={index + 1}
          newTerminalTabLabel={newTerminalTabLabel}
          tab={source}
          onClose={handleCloseTerminalCenterTab}
          onCreateTab={handleCreateTerminalCenterTab}
          onContextMenu={(event) => openContextMenu(event, tab)}
          setHoveredTabId={setTermTabPlusHoveredTabId}
        />
      );
    }

    if (tab.kind === "project-wiki") {
      return (
        <SpecialTerminalTab
          key={tab.id}
          closeLabel={t("centerStageTabBar.closeProjectWikiTab")}
          icon={<TerminalIcon className="size-3.5 shrink-0" />}
          label={t("centerStageTabBar.projectWiki")}
          tooltip={t("centerStageTabBar.projectWikiTerminal")}
          variant="project-wiki"
          value="project-wiki"
          onClose={() => setProjectWikiCloseConfirmOpen(true)}
          onContextMenu={(event) => openContextMenu(event, tab)}
        />
      );
    }

    if (tab.kind === "code-review") {
      return (
        <SpecialTerminalTab
          key={tab.id}
          closeLabel={t("centerStageTabBar.closeCodeReviewTab")}
          icon={<TerminalIcon className="size-3.5 shrink-0 text-blue-500" />}
          label={t("centerStageTabBar.codeReview")}
          tooltip={t("centerStageTabBar.codeReviewTerminal")}
          variant="code-review"
          value="code-review"
          onClose={() => setCodeReviewCloseConfirmOpen(true)}
          onContextMenu={(event) => openContextMenu(event, tab)}
        />
      );
    }

    if (tab.file) {
      return (
        <CenterStageOpenFileTab
          key={tab.id}
          file={tab.file}
          sessionDisplay={sessionDisplay}
          onClose={handleCloseFile}
          onContextMenuRequest={(event) => openContextMenu(event, tab)}
          onPreviewPin={(nextFile) => pinFile(nextFile.path, effectiveContextId)}
        />
      );
    }

    if (tab.kind === "browser") {
      const browserTab = browserTabs.find((item) => item.value === tab.value);
      if (!browserTab) return null;
      const browserContext =
        previewBrowserPrefs.byContext[browserTab.browserContextId];
      const label = getActivePreviewBrowserLabel(
        browserContext,
        browserFallbackLabel,
      );
      const faviconUrl = getActivePreviewBrowserFaviconUrl(browserContext);
      return (
        <CenterStageSurfaceContentTab
          key={tab.id}
          closeLabel={t("centerStageTabBar.closeTab", { tab: label })}
          faviconUrl={faviconUrl}
          name={label}
          onClose={() => handleCloseBrowserTab(browserTab.value)}
          onContextMenu={(event) => openContextMenu(event, tab)}
          path={label}
          tooltip={label}
          value={browserTab.value}
          variant="browser"
        />
      );
    }

    if (tab.kind === "simulator") {
      const label = t("centerStageTabBar.simulator");
      return (
        <CenterStageSurfaceContentTab
          key={tab.id}
          closeLabel={t("centerStageTabBar.closeSimulatorTab")}
          name={label}
          onClose={handleCloseSimulatorCenterTab}
          onContextMenu={(event) => openContextMenu(event, tab)}
          path={label}
          tooltip={label}
          value="simulator"
          variant="simulator"
        />
      );
    }

    const githubTab = githubTabs.find((item) => item.value === tab.value);
    if (!githubTab) return null;
    return (
      <CenterStageSurfaceContentTab
        key={tab.id}
        closeLabel={t("centerStageTabBar.closeTab", { tab: githubTab.label })}
        name={githubTab.label}
        onClose={() => handleCloseGithubTab(githubTab.value)}
        onContextMenu={(event) => openContextMenu(event, tab)}
        path={`${githubTab.owner}/${githubTab.repo}`}
        tooltip={githubTab.description || `${githubTab.owner}/${githubTab.repo}`}
        value={githubTab.value}
        variant={githubTab.kind}
      />
    );
  };

  return (
    <CenterStageTabList>
      <CenterStageOverviewTab
        tooltipContent={
          <div className="flex items-center gap-2">
            <span>{t("centerStageTabBar.overview")}</span>
            <ShortcutHint digit={0} />
          </div>
        }
      />

      {wikiCenterEligible ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <TabsTab
              value="wiki"
              onPointerDown={preventNonPrimaryTabActivate}
              className="group/wiki relative h-full! pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none border-0!"
            >
              <span className="relative size-3.5">
                <BookOpen
                  className={cn(
                    "size-3.5 absolute inset-0 transition-all duration-200",
                    activeValue === "wiki"
                      ? "group-hover/wiki:opacity-0 group-hover/wiki:scale-50 group-hover/wiki:rotate-[-30deg]"
                      : "",
                  )}
                />
                {activeValue === "wiki" ? (
                  wikiRefreshing ? (
                    <LoaderCircle className="size-3.5 absolute inset-0 animate-spin" />
                  ) : (
                    <RotateCw
                      className={cn(
                        "size-3.5 absolute inset-0 transition-all duration-200",
                        "opacity-0 scale-50 rotate-60",
                        "group-hover/wiki:opacity-100 group-hover/wiki:scale-100 group-hover/wiki:rotate-0",
                      )}
                    />
                  )
                ) : null}
              </span>
              {activeValue === "wiki" ? (
                <span
                  role="button"
                  aria-label={t("centerStageTabBar.refreshWiki")}
                  className="absolute inset-0 opacity-0 group-hover/wiki:opacity-100 pointer-events-none group-hover/wiki:pointer-events-auto cursor-pointer"
                  onClick={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    setWikiRefreshing(true);
                    setWikiRefreshTrigger((key) => key + 1);
                    setTimeout(() => setWikiRefreshing(false), 600);
                  }}
                />
              ) : null}
            </TabsTab>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {activeValue === "wiki" ? t("centerStageTabBar.refreshWiki") : t("centerStageTabBar.projectWiki")}
          </TooltipContent>
        </Tooltip>
      ) : null}

      <div
        ref={scrollableTabsRef}
        data-center-tabs-scroll
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto no-scrollbar"
      >
        <DndContext
          sensors={stripDndSensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragEnd={handleStripDragEnd}
        >
          <SortableContext
            items={orderedDescriptors.map((tab) => tab.id)}
            strategy={horizontalListSortingStrategy}
          >
            {orderedDescriptors.map((tab) => (
              <SortableCenterStripTab key={tab.id} id={tab.id}>
                {renderDescriptorTab(tab)}
              </SortableCenterStripTab>
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <CenterStageStickyTabActions>
        <CenterStageNewTabMenu
          browserLabel={newBrowserLabel}
          simulatorLabel={newSimulatorLabel}
          menuLabel={newTabMenuLabel}
          terminalLabel={newTerminalTabLabel}
          onCreateBrowser={handleCreateBrowserCenterTab}
          onCreateSimulator={handleCreateSimulatorCenterTab}
          onCreateTerminal={handleCreateTerminalCenterTab}
        />
        <CenterStageTabGroupPopover
          open={tabGroupPopoverOpen}
          onOpenChange={setTabGroupPopoverOpen}
          groups={orderedGroupedTabItems}
          activeValue={activeValue}
          sensors={tabGroupDndSensors}
          onDragEnd={handleTabGroupDragEnd}
          onSelect={handleSelectTabGroupItem}
          onClose={handleCloseTabGroupItem}
          isClosable={isTabGroupItemClosable}
          isItemActive={isTabGroupItemActive}
          renderContent={renderTabGroupItemContent}
        />
      </CenterStageStickyTabActions>
    </CenterStageTabList>
  );
}

function isTabGroupItemClosable(tab: TabGroupItem) {
  return (
    tab.kind === "terminal" ||
    tab.kind === "project-wiki" ||
    tab.kind === "code-review" ||
    tab.kind === "file" ||
    tab.kind === "diff" ||
    tab.kind === "diff-group" ||
    tab.kind === "review-diff" ||
    tab.kind === "conflict" ||
    tab.kind === "github-pr" ||
    tab.kind === "github-issue" ||
    tab.kind === "github-action" ||
    tab.kind === "browser" ||
    tab.kind === "simulator"
  );
}

function SortableCenterStripTab({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  // Only while actively dragging: force grabbing cursor globally so it stays
  // visible even over TabsTab (cursor-pointer) and neighboring strip chrome.
  React.useEffect(() => {
    if (!isDragging) return;
    const previous = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.cursor = previous;
    };
  }, [isDragging]);

  // Translate only — CSS.Transform also applies scaleX/scaleY when neighboring
  // tabs have different widths, which makes the dragged (and over) tabs grow/shrink.
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn(
        "flex h-full shrink-0 items-stretch touch-none",
        isDragging && "z-20 cursor-grabbing opacity-60 [&_button]:cursor-grabbing",
      )}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function TerminalExtraTab({
  activeValue,
  effectiveContextId,
  hasShortcut,
  hoveredTabId,
  shortcutDigit,
  newTerminalTabLabel,
  tab,
  onClose,
  onCreateTab,
  onContextMenu,
  setHoveredTabId,
}: {
  activeValue: string;
  effectiveContextId: string;
  hasShortcut: boolean;
  hoveredTabId: string | null;
  shortcutDigit: number;
  newTerminalTabLabel: string;
  tab: { id: string; title: string; customTitle?: string };
  onClose: (tabId: string) => void;
  onCreateTab: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  setHoveredTabId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const t = useTranslations("appShell");
  const { displayTitle, toolbarAgent } = useTerminalCenterTabPresentation({
    contextId: effectiveContextId,
    tabId: tab.id,
    fallbackTitle: tab.title,
    customTitle: tab.customTitle,
  });
  const closeAriaLabel = t("centerStageTabBar.closeTab", { tab: displayTitle });

  const stablePaneIds = useTerminalStore(
    useShallow((s) => {
      const panes = s.getPanes(effectiveContextId, tab.id);
      return Object.values(panes)
        .map((pane) =>
          pane.tmuxWindowName ? `${effectiveContextId}:${pane.tmuxWindowName}` : null,
        )
        .filter((id): id is string => Boolean(id));
    }),
  );
  const attentionReason = useAgentAttentionStore((s) => {
    let best: "permission_request" | "task_complete" | null = null;
    for (const id of stablePaneIds) {
      const reason = s.panes.get(id)?.reason;
      if (!reason) continue;
      if (reason === "permission_request") return "permission_request" as const;
      best = reason;
    }
    return best;
  });

  const tabIconHoverClass =
    activeValue === tab.id
      ? "group-hover/term-tab:opacity-0 group-hover/term-tab:scale-50 group-hover/term-tab:rotate-[-20deg]"
      : "";

  const tabLeadingIcon = toolbarAgent ? (
    toolbarAgent.iconType === "built-in" ? (
      <span
        className={cn(
          "flex size-3.5 items-center justify-center transition-all duration-200",
          tabIconHoverClass,
        )}
      >
        <AgentIcon registryId={toolbarAgent.id} name={toolbarAgent.label} size={14} />
      </span>
    ) : (
      <Bot
        className={cn("size-3.5 text-muted-foreground transition-all duration-200", tabIconHoverClass)}
      />
    )
  ) : (
    <TerminalIcon
      className={cn("size-3.5 transition-all duration-200", tabIconHoverClass)}
    />
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TabsTab
          value={tab.id}
          onPointerDown={preventNonPrimaryTabActivate}
          onContextMenu={onContextMenu}
          className={cn(
            "group/term-tab relative !h-full pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none !border-0",
            attentionReason && "agent-attention-ring-tab",
            attentionReason === "permission_request" && "agent-attention-ring-permission",
            attentionReason === "task_complete" && "agent-attention-ring-complete",
          )}
        >
          <span className="relative flex size-4 shrink-0 items-center justify-center">
            {tabLeadingIcon}
            {activeValue === tab.id ? (
              <CreateTerminalTabButton
                groupName="term-tab"
                onCreateTab={onCreateTab}
                onHoverChange={(hovered) => setHoveredTabId(hovered ? tab.id : null)}
                newTerminalTabLabel={newTerminalTabLabel}
              />
            ) : null}
          </span>
          <span className="max-w-[180px] truncate text-[13px] font-medium whitespace-nowrap">
            {displayTitle}
          </span>
          <TerminalTabAgentIndicatorWithPanes contextId={effectiveContextId} tabId={tab.id} />
          <div
            className={cn(
              "absolute right-0 top-1/2 z-10 flex h-full -translate-y-1/2 items-center rounded-r-sm bg-linear-to-l from-muted/25 to-transparent pl-2.5 pr-1.5 backdrop-blur-[4px] transition-opacity duration-200",
              activeValue === tab.id ? "opacity-0 group-hover/term-tab:opacity-100" : "opacity-0 pointer-events-none",
            )}
          >
            <span
              role="button"
              aria-label={closeAriaLabel}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.id);
              }}
              className="flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground cursor-pointer"
            >
              <X className="size-3" />
            </span>
          </div>
        </TabsTab>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="flex items-center gap-2">
          {hoveredTabId === tab.id ? (
            <>
              <span>{newTerminalTabLabel}</span>
              <ShortcutHint digit="T" />
            </>
          ) : (
            <>
              <span>{displayTitle}</span>
              {hasShortcut ? <ShortcutHint digit={shortcutDigit} /> : null}
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function CenterStageNewTabMenu({
  browserLabel,
  simulatorLabel,
  menuLabel,
  terminalLabel,
  onCreateBrowser,
  onCreateSimulator,
  onCreateTerminal,
}: {
  browserLabel: string;
  simulatorLabel: string;
  menuLabel: string;
  terminalLabel: string;
  onCreateBrowser: () => void;
  onCreateSimulator: () => void;
  onCreateTerminal: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const closeTimerRef = React.useRef<number | null>(null);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = React.useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }, [clearCloseTimer]);

  React.useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={menuLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-full w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground data-[state=open]:bg-muted/50 data-[state=open]:text-foreground"
          onMouseEnter={() => {
            clearCloseTimer();
            setOpen(true);
          }}
          onMouseLeave={scheduleClose}
          onFocus={() => {
            clearCloseTimer();
            setOpen(true);
          }}
          onBlur={scheduleClose}
        >
          <Plus className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={4}
        className="w-44 border-border/70 bg-popover/90 p-1 shadow-lg backdrop-blur-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
          onClick={() => {
            onCreateTerminal();
            setOpen(false);
          }}
        >
          <TerminalIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{terminalLabel}</span>
          <ShortcutHint digit="T" />
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
          onClick={() => {
            onCreateBrowser();
            setOpen(false);
          }}
        >
          <Globe className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{browserLabel}</span>
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
          onClick={() => {
            onCreateSimulator();
            setOpen(false);
          }}
        >
          <Tablet className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{simulatorLabel}</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

function CreateTerminalTabButton({
  groupName,
  onCreateTab,
  onHoverChange,
  newTerminalTabLabel,
}: {
  groupName: "term-tab";
  onCreateTab: () => void;
  onHoverChange: (hovered: boolean) => void;
  newTerminalTabLabel: string;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={newTerminalTabLabel}
      className={cn(
        "absolute inset-0 -m-1 flex items-center justify-center rounded-md p-1 text-muted-foreground transition-all",
        "opacity-0 scale-50 rotate-60 pointer-events-none",
        groupName === "term-tab" && "group-hover/term-tab:opacity-100 group-hover/term-tab:scale-100 group-hover/term-tab:rotate-0 group-hover/term-tab:pointer-events-auto",
        "hover:bg-muted-foreground/20 hover:text-foreground",
      )}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onCreateTab();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onCreateTab();
      }}
    >
      <Plus className="size-3.5" />
    </span>
  );
}

function SpecialTerminalTab({
  closeLabel,
  icon,
  label,
  tooltip,
  variant,
  value,
  onClose,
  onContextMenu,
}: {
  closeLabel: string;
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  variant: "project-wiki" | "code-review";
  value: string;
  onClose: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TabsTab
          value={value}
          onPointerDown={preventNonPrimaryTabActivate}
          onContextMenu={onContextMenu}
          className={cn(
            "relative !h-full pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none !border-0",
            variant === "project-wiki" ? "group/pw" : "group/cr",
          )}
        >
          {icon}
          <span className="text-[13px] font-medium text-pretty">{label}</span>
          <div
            className={cn(
              "absolute right-0 top-1/2 z-10 flex h-full -translate-y-1/2 items-center pl-2 pr-1.5 backdrop-blur-[4px] [mask-image:linear-gradient(to_right,transparent,black_40%)] transition-opacity duration-200",
              variant === "project-wiki"
                ? "opacity-0 group-hover/pw:opacity-100"
                : "opacity-0 group-hover/cr:opacity-100",
            )}
          >
            <span
              role="button"
              aria-label={closeLabel}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              className="flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground cursor-pointer"
            >
              <X className="size-3" />
            </span>
          </div>
        </TabsTab>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
