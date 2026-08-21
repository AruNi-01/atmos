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
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  restrictToHorizontalAxis,
  SortableContext,
  sortableKeyboardCoordinates,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useSensor,
  useSensors,
  useSortable,
  type DragEndEvent,
} from "@workspace/ui";
import {
  Tabs as MotionTabs,
  TabsList as MotionTabsList,
  TabsTrigger as MotionTabsTrigger,
} from "@workspace/ui/components/motion/tabs";
import { motion, useReducedMotion } from "motion/react";
import {
  BookOpen,
  Bot,
  ChevronRight,
  FileDiff,
  FolderTree,
  GitBranch,
  Github,
  Globe,
  Layers,
  LayoutTemplate,
  LoaderCircle,
  Maximize2,
  Minimize2,
  PencilRuler,
  GitGraph,
  Play,
  Plus,
  RotateCw,
  Rows2,
  Smartphone,
  SquareSplitHorizontal,
  SquareTerminal as TerminalIcon,
} from "lucide-react";
import type { CenterToolTabValue } from "@/app-shell/center-tool-tabs";
import {
  applyHorizontalTabStripWheel,
  scrollActiveTabIntoStripView,
} from "@/app-shell/center-stage-tab-scroll";
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
  CenterStageTab,
  CenterStageTabIconSlot,
  CenterStageTabGroupItemContent,
  CenterStageTabList,
  CENTER_STAGE_ICON_TAB_CLASS,
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
import { useCenterStageFullscreenStore } from "@/app-shell/use-center-stage-fullscreen";

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
  openFiles: OpenFile[];
  orderedGroupedTabItems: Array<{ key: string; label: string; tabs: TabGroupItem[] }>;
  previewBrowserPrefs: PreviewBrowserPrefs;
  projectWikiTabVisible: boolean;
  simulatorTabVisible: boolean;
  gitHistoryTabVisible: boolean;
  sessionDisplay: SessionDisplay;
  tabGroupDndSensors: React.ComponentProps<typeof CenterStageTabGroupPopover>["sensors"];
  /** Saved strip order (tab ids). Missing/new tabs append after. */
  tabStripOrder: string[];
  visibleTerminalTabs: Array<{ id: string; title: string; closable: boolean; customTitle?: string }>;
  wikiCenterEligible: boolean;
  wikiRefreshing: boolean;
  /**
   * Overview is primary-pane only. Secondary multi-pane tab strips pass false
   * so split panes stay isolated from the overview surface.
   */
  overviewVisible?: boolean;
  handleCenterStageTabChange: (value: string) => void;
  handleCloseTabGroupItem: (tab: TabGroupItem) => void;
  handleCloseBrowserTab: (value: string) => void;
  handleCloseFile: (file: OpenFile) => void;
  handleCloseGithubTab: (value: string) => void;
  handleCloseTerminalCenterTab: (tabId: string) => void;
  handleCreateBrowserCenterTab: () => void;
  handleCreateSimulatorCenterTab: () => void;
  handleCreateTerminalCenterTab: () => void;
  handleCreateToolCenterTab: (tab: CenterToolTabValue) => void;
  handleCloseSimulatorTab: () => void;
  handleCloseGitHistoryTab: () => void;
  handleCloseToolTab: (tab: CenterToolTabValue) => void;
  changesTabVisible: boolean;
  reviewTabVisible: boolean;
  runTabVisible: boolean;
  githubHubTabVisible: boolean;
  filesTabVisible: boolean;
  ptDesignTabVisible: boolean;
  handleRenameTerminalCenterTab: (tabId: string, title: string) => void;
  handleSelectTabGroupItem: (tab: TabGroupItem) => void;
  handleTabGroupDragEnd: (event: DragEndEvent) => void;
  onTabStripOrderChange: (order: string[]) => void;
  pinFile: (path: string, workspaceId?: string) => void;
  setCodeReviewCloseConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setProjectWikiCloseConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTabContextMenu: (value: CenterTabContextMenuState) => void;
  setWikiRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  setWikiRefreshTrigger: React.Dispatch<React.SetStateAction<number>>;
  /** Owning mosaic pane — fullscreen expands this pane over sibling center regions. */
  paneId?: string;
  /** Split the center stage into another pane (right). */
  onSplitRight?: () => void;
  /** Split the center stage into another pane (down). */
  onSplitDown?: () => void;
  /** Saved global center layouts (functional surfaces + geometry). */
  savedLayouts?: Array<{ id: string; name: string }>;
  /** Persist current multi-pane layout under a user-provided name. */
  onSaveLayout?: (name: string) => void;
  /** Apply a previously saved layout to the current context. */
  onApplyLayout?: (layoutId: string) => void;
  /** True when apply would replace a split or tabs other than Overview. */
  shouldConfirmApplyLayout?: () => boolean;
  /** Create a new independent center space with a user-provided name. */
  onCreateSpace?: (name: string) => void;
}

export function CenterStageTabBar({
  activeValue,
  browserFallbackLabel,
  browserTabs,
  codeReviewTabVisible,
  effectiveContextId,
  githubTabs,
  openFiles,
  orderedGroupedTabItems,
  previewBrowserPrefs,
  projectWikiTabVisible,
  simulatorTabVisible,
  gitHistoryTabVisible,
  changesTabVisible,
  reviewTabVisible,
  runTabVisible,
  githubHubTabVisible,
  filesTabVisible,
  ptDesignTabVisible,
  sessionDisplay,
  tabGroupDndSensors,
  tabStripOrder,
  visibleTerminalTabs,
  wikiCenterEligible,
  wikiRefreshing,
  overviewVisible = true,
  handleCenterStageTabChange,
  handleCloseTabGroupItem,
  handleCloseBrowserTab,
  handleCloseFile,
  handleCloseGithubTab,
  handleCloseTerminalCenterTab,
  handleCreateBrowserCenterTab,
  handleCreateSimulatorCenterTab,
  handleCreateTerminalCenterTab,
  handleCreateToolCenterTab,
  handleCloseSimulatorTab,
  handleCloseGitHistoryTab,
  handleCloseToolTab,
  handleRenameTerminalCenterTab,
  handleSelectTabGroupItem,
  handleTabGroupDragEnd,
  onTabStripOrderChange,
  pinFile,
  setCodeReviewCloseConfirmOpen,
  setProjectWikiCloseConfirmOpen,
  setTabContextMenu,
  setWikiRefreshing,
  setWikiRefreshTrigger,
  paneId,
  onSplitRight,
  onSplitDown,
  savedLayouts,
  onSaveLayout,
  onApplyLayout,
  shouldConfirmApplyLayout,
  onCreateSpace,
}: CenterStageTabBarProps) {
  const t = useTranslations("appShell");
  const newTerminalTabLabel = t("centerStageTabBar.newTerminalTab");
  const newBrowserLabel = t("centerStageTabBar.newBrowser");
  const newTabMenuLabel = t("centerStageTabBar.newTabMenu");
  // Per-instance so split panes do not share one open popover.
  const [tabGroupPopoverOpen, setTabGroupPopoverOpen] = React.useState(false);

  const isTabGroupItemActive = React.useCallback(
    (tab: TabGroupItem) => {
      if (tab.kind !== "browser") {
        return activeValue === tab.value;
      }
      if (activeValue !== tab.value || !tab.browserContextId || !tab.browserTabId) {
        return false;
      }
      const context = previewBrowserPrefs.byContext[tab.browserContextId];
      const activeTabId = context?.activeTabId ?? context?.tabs?.[0]?.id;
      return activeTabId === tab.browserTabId;
    },
    [activeValue, previewBrowserPrefs],
  );

  const renderTabGroupItemContent = React.useCallback((
    tab: TabGroupItem,
    close?: { label: string; onClose: () => void },
  ) => {
    return (
      <CenterStageTabGroupItemContent
        effectiveContextId={effectiveContextId}
        tab={tab}
        closeLabel={close?.label}
        onClose={close?.onClose}
      />
    );
  }, [effectiveContextId]);

  // Natural open-order among file / github / browser surface tabs (before pin reordering).
  const orderedSurfaceTabs = React.useMemo<
    Array<
      | { type: "file"; openedAt: number; file: OpenFile }
      | { type: "github"; openedAt: number; tab: GithubCenterTab }
      | { type: "browser"; openedAt: number; tab: BrowserCenterTab }
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
    ];
    return items.sort((left, right) => left.openedAt - right.openedAt);
  }, [browserTabs, githubTabs, openFiles]);

  // Fallback visual order when the user has never dragged the strip:
  // terminals → special terminals → surface tabs by open time.
  // Newly added tabs are appended via tabStripOrder and are independent
  // of the grouped-tab popover order.
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

    if (simulatorTabVisible) {
      descriptors.push({
        id: "simulator",
        value: "simulator",
        kind: "simulator",
        label: t("centerStageTabBar.simulator"),
      });
    }

    if (gitHistoryTabVisible) {
      descriptors.push({
        id: "git-history",
        value: "git-history",
        kind: "git-history",
        label: t("centerStageTabBar.history"),
      });
    }

    if (changesTabVisible) {
      descriptors.push({
        id: "changes",
        value: "changes",
        kind: "changes",
        label: t("centerStageTabBar.changes"),
      });
    }

    if (reviewTabVisible) {
      descriptors.push({
        id: "review",
        value: "review",
        kind: "review",
        label: t("centerStageTabBar.review"),
      });
    }

    if (runTabVisible) {
      descriptors.push({
        id: "run",
        value: "run",
        kind: "run",
        label: t("centerStageTabBar.run"),
      });
    }

    if (githubHubTabVisible) {
      descriptors.push({
        id: "github",
        value: "github",
        kind: "github",
        label: t("centerStageTabBar.github"),
      });
    }

    if (filesTabVisible) {
      descriptors.push({
        id: "files",
        value: "files",
        kind: "files",
        label: t("centerStageTabBar.files"),
      });
    }

    if (ptDesignTabVisible) {
      descriptors.push({
        id: "pt-design",
        value: "pt-design",
        kind: "pt-design",
        label: t("centerStageTabBar.ptDesign"),
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
    changesTabVisible,
    codeReviewTabVisible,
    filesTabVisible,
    ptDesignTabVisible,
    githubHubTabVisible,
    reviewTabVisible,
    runTabVisible,
    simulatorTabVisible,
    gitHistoryTabVisible,
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

  const scrollableTabsRef = React.useRef<HTMLDivElement>(null);

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
      applyHorizontalTabStripWheel(root, event, event.target);
    };

    root.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", handleWheel);
    };
  }, [orderedDescriptors.length]);

  React.useEffect(() => {
    if (!activeValue) return;
    const timer = window.setTimeout(() => {
      const root = scrollableTabsRef.current;
      if (!root) return;
      scrollActiveTabIntoStripView(root);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    activeValue,
    effectiveContextId,
    openFiles.length,
    projectWikiTabVisible,
    codeReviewTabVisible,
    visibleTerminalTabs.length,
  ]);

  const renderDescriptorTab = (tab: CenterTabDescriptor) => {
    if (tab.kind === "terminal") {
      const source = visibleTerminalTabs.find((item) => item.id === tab.value);
      if (!source) return null;
      const index = visibleTerminalTabs.findIndex((item) => item.id === tab.value);
      return (
        <TerminalExtraTab
          key={tab.id}
          effectiveContextId={effectiveContextId}
          hasShortcut={index >= 0 && index < CENTER_TERMINAL_SHORTCUT_LIMIT}
          shortcutDigit={index + 1}
          tab={source}
          onClose={handleCloseTerminalCenterTab}
          onContextMenu={(event) => openContextMenu(event, tab)}
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
          value="code-review"
          onClose={() => setCodeReviewCloseConfirmOpen(true)}
          onContextMenu={(event) => openContextMenu(event, tab)}
        />
      );
    }

    if (tab.kind === "simulator") {
      return (
        <SpecialTerminalTab
          key={tab.id}
          closeLabel={t("centerStageTabBar.closeSimulatorTab")}
          icon={<Smartphone className="size-3.5 shrink-0" />}
          label={t("centerStageTabBar.simulator")}
          tooltip={t("centerStageTabBar.simulator")}
          value="simulator"
          onClose={handleCloseSimulatorTab}
          onContextMenu={(event) => openContextMenu(event, tab)}
        />
      );
    }

    if (tab.kind === "git-history") {
      return (
        <SpecialTerminalTab
          key={tab.id}
          closeLabel={t("centerStageTabBar.closeHistoryTab")}
          icon={<GitGraph className="size-3.5 shrink-0" />}
          label={t("centerStageTabBar.history")}
          tooltip={t("centerStageTabBar.history")}
          value="git-history"
          onClose={handleCloseGitHistoryTab}
          onContextMenu={(event) => openContextMenu(event, tab)}
        />
      );
    }

    if (tab.kind === "changes") {
      return (
        <SpecialTerminalTab
          key={tab.id}
          closeLabel={t("centerStageTabBar.closeChangesTab")}
          icon={<GitBranch className="size-3.5 shrink-0" />}
          label={t("centerStageTabBar.changes")}
          tooltip={t("centerStageTabBar.changes")}
          value="changes"
          onClose={() => handleCloseToolTab("changes")}
          onContextMenu={(event) => openContextMenu(event, tab)}
        />
      );
    }

    if (tab.kind === "review") {
      return (
        <SpecialTerminalTab
          key={tab.id}
          closeLabel={t("centerStageTabBar.closeReviewTab")}
          icon={<FileDiff className="size-3.5 shrink-0" />}
          label={t("centerStageTabBar.review")}
          tooltip={t("centerStageTabBar.review")}
          value="review"
          onClose={() => handleCloseToolTab("review")}
          onContextMenu={(event) => openContextMenu(event, tab)}
        />
      );
    }

    if (tab.kind === "run") {
      return (
        <SpecialTerminalTab
          key={tab.id}
          closeLabel={t("centerStageTabBar.closeRunTab")}
          icon={<Play className="size-3.5 shrink-0" />}
          label={t("centerStageTabBar.run")}
          tooltip={t("centerStageTabBar.run")}
          value="run"
          onClose={() => handleCloseToolTab("run")}
          onContextMenu={(event) => openContextMenu(event, tab)}
        />
      );
    }

    if (tab.kind === "github") {
      return (
        <SpecialTerminalTab
          key={tab.id}
          closeLabel={t("centerStageTabBar.closeGithubTab")}
          icon={<Github className="size-3.5 shrink-0" />}
          label={t("centerStageTabBar.github")}
          tooltip={t("centerStageTabBar.github")}
          value="github"
          onClose={() => handleCloseToolTab("github")}
          onContextMenu={(event) => openContextMenu(event, tab)}
        />
      );
    }

    if (tab.kind === "files") {
      return (
        <SpecialTerminalTab
          key={tab.id}
          closeLabel={t("centerStageTabBar.closeFilesTab")}
          icon={<FolderTree className="size-3.5 shrink-0" />}
          label={t("centerStageTabBar.files")}
          tooltip={t("centerStageTabBar.files")}
          value="files"
          onClose={() => handleCloseToolTab("files")}
          onContextMenu={(event) => openContextMenu(event, tab)}
        />
      );
    }

    if (tab.kind === "pt-design") {
      return (
        <SpecialTerminalTab
          key={tab.id}
          closeLabel={t("centerStageTabBar.closePtDesignTab")}
          icon={<PencilRuler className="size-3.5 shrink-0" />}
          label={t("centerStageTabBar.ptDesign")}
          tooltip={t("centerStageTabBar.ptDesign")}
          value="pt-design"
          onClose={() => handleCloseToolTab("pt-design")}
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
    <CenterStageTabList
      value={activeValue}
      onValueChange={handleCenterStageTabChange}
      actions={
        <CenterStageStickyTabActions>
          <CenterStageNewTabMenu
            browserLabel={newBrowserLabel}
            changesLabel={t("centerStageTabBar.newChanges")}
            filesLabel={t("centerStageTabBar.newFiles")}
            githubLabel={t("centerStageTabBar.newGithub")}
            ptDesignLabel={t("centerStageTabBar.newPtDesign")}
            layoutLabel={t("centerStageTabBar.layouts")}
            menuLabel={newTabMenuLabel}
            newLayoutLabel={t("centerStageTabBar.saveCurrentLayout")}
            reviewLabel={t("centerStageTabBar.newReview")}
            runLabel={t("centerStageTabBar.newRun")}
            saveLayoutDialogTitle={t("centerStageTabBar.saveLayoutDialogTitle")}
            saveLayoutNamePlaceholder={t("centerStageTabBar.saveLayoutNamePlaceholder")}
            saveLayoutConfirmLabel={t("centerStageTabBar.saveLayoutConfirm")}
            saveLayoutCancelLabel={t("centerStageTabBar.saveLayoutCancel")}
            applyLayoutConfirmTitle={t("centerStageTabBar.applyLayoutConfirmTitle")}
            applyLayoutConfirmDescription={t("centerStageTabBar.applyLayoutConfirmDescription")}
            applyLayoutConfirmLabel={t("centerStageTabBar.applyLayoutConfirm")}
            applyLayoutCancelLabel={t("centerStageTabBar.applyLayoutCancel")}
            simulatorLabel={t("centerStageTabBar.newSimulator")}
            paneId={paneId}
            fullscreenLabel={t("centerStageTabBar.fullscreen")}
            exitFullscreenLabel={t("centerStageTabBar.exitFullscreen")}
            splitDownLabel={t("centerStageTabBar.splitDown")}
            splitRightLabel={t("centerStageTabBar.splitRight")}
            terminalLabel={newTerminalTabLabel}
            savedLayouts={savedLayouts}
            onCreateBrowser={handleCreateBrowserCenterTab}
            onCreateSimulator={handleCreateSimulatorCenterTab}
            onCreateTerminal={handleCreateTerminalCenterTab}
            onCreateToolTab={handleCreateToolCenterTab}
            onSplitDown={onSplitDown}
            onSplitRight={onSplitRight}
            onSaveLayout={onSaveLayout}
            onApplyLayout={onApplyLayout}
            shouldConfirmApplyLayout={shouldConfirmApplyLayout}
            onCreateSpace={onCreateSpace}
            newSpaceLabel={t("centerStageTabBar.newSpace")}
            plusMenuTabsLabel={t("centerStageTabBar.plusMenuTabs")}
            plusMenuLayoutLabel={t("centerStageTabBar.plusMenuLayout")}
            newSpaceDialogTitle={t("centerStageTabBar.newSpaceDialogTitle")}
            newSpaceNamePlaceholder={t("centerStageTabBar.newSpaceNamePlaceholder")}
            newSpaceConfirmLabel={t("centerStageTabBar.newSpaceConfirm")}
            newSpaceCancelLabel={t("centerStageTabBar.newSpaceCancel")}
          />
          <CenterStageTabGroupPopover
            open={tabGroupPopoverOpen}
            onOpenChange={setTabGroupPopoverOpen}
            groups={orderedGroupedTabItems}
            activeValue={activeValue}
            sensors={tabGroupDndSensors}
            onDragEnd={handleTabGroupDragEnd}
            onSelect={(tab) => {
              handleSelectTabGroupItem(tab);
              setTabGroupPopoverOpen(false);
            }}
            onClose={handleCloseTabGroupItem}
            isClosable={isTabGroupItemClosable}
            isItemActive={isTabGroupItemActive}
            renderContent={renderTabGroupItemContent}
          />
        </CenterStageStickyTabActions>
      }
    >
      {overviewVisible ? (
        <CenterStageOverviewTab
          tooltipContent={
            <div className="flex items-center gap-2">
              <span>{t("centerStageTabBar.overview")}</span>
              <ShortcutHint digit={0} />
            </div>
          }
        />
      ) : null}

      {wikiCenterEligible ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <CenterStageTab
              value="wiki"
              onPointerDown={(event) => {
                preventNonPrimaryTabActivate(event);
                event.stopPropagation();
              }}
              className={cn("group/wiki relative", CENTER_STAGE_ICON_TAB_CLASS)}
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
            </CenterStageTab>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {activeValue === "wiki" ? t("centerStageTabBar.refreshWiki") : t("centerStageTabBar.projectWiki")}
          </TooltipContent>
        </Tooltip>
      ) : null}

      <div
        ref={scrollableTabsRef}
        data-center-tabs-scroll
        className="pointer-events-none flex min-w-0 flex-1 items-center overflow-x-auto no-scrollbar"
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
    tab.kind === "simulator" ||
    tab.kind === "git-history" ||
    tab.kind === "changes" ||
    tab.kind === "review" ||
    tab.kind === "run" ||
    tab.kind === "github" ||
    tab.kind === "files" ||
    tab.kind === "pt-design"
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
  const { onPointerDown, ...restListeners } = listeners ?? {};

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
        "pointer-events-auto flex h-7 shrink-0 items-center touch-none",
        isDragging && "z-20 cursor-grabbing opacity-60 [&_button]:cursor-grabbing",
      )}
      {...attributes}
      {...restListeners}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        event.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}

function TerminalExtraTab({
  effectiveContextId,
  hasShortcut,
  shortcutDigit,
  tab,
  onClose,
  onContextMenu,
}: {
  effectiveContextId: string;
  hasShortcut: boolean;
  shortcutDigit: number;
  tab: { id: string; title: string; customTitle?: string };
  onClose: (tabId: string) => void;
  onContextMenu: (event: React.MouseEvent) => void;
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

  const tabLeadingIcon = toolbarAgent ? (
    toolbarAgent.iconType === "built-in" ? (
      <AgentIcon registryId={toolbarAgent.id} name={toolbarAgent.label} size={14} />
    ) : (
      <Bot className="size-3.5" />
    )
  ) : (
    <TerminalIcon className="size-3.5" />
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <CenterStageTab
          value={tab.id}
          onPointerDown={preventNonPrimaryTabActivate}
          onContextMenu={onContextMenu}
          className={cn(
            attentionReason && "agent-attention-ring-tab",
            attentionReason === "permission_request" && "agent-attention-ring-permission",
            attentionReason === "task_complete" && "agent-attention-ring-complete",
          )}
        >
          <CenterStageTabIconSlot
            closeLabel={closeAriaLabel}
            onClose={() => onClose(tab.id)}
          >
            {tabLeadingIcon}
          </CenterStageTabIconSlot>
          <span className="max-w-[180px] truncate whitespace-nowrap">
            {displayTitle}
          </span>
          <TerminalTabAgentIndicatorWithPanes contextId={effectiveContextId} tabId={tab.id} />
        </CenterStageTab>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="flex items-center gap-2">
          <span>{displayTitle}</span>
          {hasShortcut ? <ShortcutHint digit={shortcutDigit} /> : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

const PLUS_MENU_TAB_EASE = [0.22, 1, 0.36, 1] as const;

function PlusMenuTabPanels({
  tab,
  tabs,
  layout,
}: {
  tab: "tabs" | "layout";
  tabs: React.ReactNode;
  layout: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const layoutRef = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number | "auto">("auto");

  React.useLayoutEffect(() => {
    const el = tab === "layout" ? layoutRef.current : tabsRef.current;
    if (!el) return;
    const apply = () => {
      const next = el.offsetHeight;
      setHeight((prev) => (prev === next ? prev : next));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [tab]);

  return (
    <motion.div
      initial={false}
      animate={reduce || height === "auto" ? undefined : { height }}
      transition={{ duration: 0.3, ease: PLUS_MENU_TAB_EASE }}
      className="mt-1 overflow-hidden"
    >
      <div className="relative">
        <motion.div
          ref={tabsRef}
          initial={false}
          animate={{
            opacity: tab === "tabs" ? 1 : 0,
            scale: tab === "tabs" ? 1 : 0.96,
          }}
          transition={{ duration: reduce ? 0 : 0.22, ease: PLUS_MENU_TAB_EASE }}
          className={cn(
            "origin-top",
            tab === "tabs"
              ? "relative"
              : "pointer-events-none absolute inset-x-0 top-0",
          )}
          aria-hidden={tab !== "tabs"}
          inert={tab !== "tabs" ? true : undefined}
        >
          {tabs}
        </motion.div>
        <motion.div
          ref={layoutRef}
          initial={false}
          animate={{
            opacity: tab === "layout" ? 1 : 0,
            scale: tab === "layout" ? 1 : 0.96,
          }}
          transition={{ duration: reduce ? 0 : 0.22, ease: PLUS_MENU_TAB_EASE }}
          className={cn(
            "origin-top",
            tab === "layout"
              ? "relative"
              : "pointer-events-none absolute inset-x-0 top-0",
          )}
          aria-hidden={tab !== "layout"}
          inert={tab !== "layout" ? true : undefined}
        >
          {layout}
        </motion.div>
      </div>
    </motion.div>
  );
}

function CenterStageNewTabMenu({
  browserLabel,
  changesLabel,
  filesLabel,
  githubLabel,
  ptDesignLabel,
  layoutLabel,
  menuLabel,
  newLayoutLabel,
  reviewLabel,
  runLabel,
  saveLayoutDialogTitle,
  saveLayoutNamePlaceholder,
  saveLayoutConfirmLabel,
  saveLayoutCancelLabel,
  applyLayoutConfirmTitle,
  applyLayoutConfirmDescription,
  applyLayoutConfirmLabel,
  applyLayoutCancelLabel,
  simulatorLabel,
  paneId,
  fullscreenLabel,
  exitFullscreenLabel,
  splitDownLabel,
  splitRightLabel,
  terminalLabel,
  savedLayouts,
  onCreateBrowser,
  onCreateSimulator,
  onCreateTerminal,
  onCreateToolTab,
  onSplitDown,
  onSplitRight,
  onSaveLayout,
  onApplyLayout,
  shouldConfirmApplyLayout,
  onCreateSpace,
  newSpaceLabel,
  newSpaceDialogTitle,
  newSpaceNamePlaceholder,
  newSpaceConfirmLabel,
  newSpaceCancelLabel,
  plusMenuTabsLabel,
  plusMenuLayoutLabel,
}: {
  browserLabel: string;
  changesLabel: string;
  filesLabel: string;
  githubLabel: string;
  ptDesignLabel: string;
  layoutLabel: string;
  menuLabel: string;
  newLayoutLabel: string;
  reviewLabel: string;
  runLabel: string;
  saveLayoutDialogTitle: string;
  saveLayoutNamePlaceholder: string;
  saveLayoutConfirmLabel: string;
  saveLayoutCancelLabel: string;
  applyLayoutConfirmTitle: string;
  applyLayoutConfirmDescription: string;
  applyLayoutConfirmLabel: string;
  applyLayoutCancelLabel: string;
  simulatorLabel: string;
  paneId?: string;
  fullscreenLabel: string;
  exitFullscreenLabel: string;
  splitDownLabel: string;
  splitRightLabel: string;
  terminalLabel: string;
  savedLayouts?: Array<{ id: string; name: string }>;
  onCreateBrowser: () => void;
  onCreateSimulator: () => void;
  onCreateTerminal: () => void;
  onCreateToolTab: (tab: CenterToolTabValue) => void;
  onSplitDown?: () => void;
  onSplitRight?: () => void;
  onSaveLayout?: (name: string) => void;
  onApplyLayout?: (layoutId: string) => void;
  shouldConfirmApplyLayout?: () => boolean;
  onCreateSpace?: (name: string) => void;
  newSpaceLabel?: string;
  newSpaceDialogTitle: string;
  newSpaceNamePlaceholder: string;
  newSpaceConfirmLabel: string;
  newSpaceCancelLabel: string;
  plusMenuTabsLabel: string;
  plusMenuLayoutLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [plusTab, setPlusTab] = React.useState<"tabs" | "layout">("tabs");
  const [layoutsSubOpen, setLayoutsSubOpen] = React.useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
  const [layoutName, setLayoutName] = React.useState("");
  const [spaceDialogOpen, setSpaceDialogOpen] = React.useState(false);
  const [spaceName, setSpaceName] = React.useState("");
  const [applyConfirmOpen, setApplyConfirmOpen] = React.useState(false);
  const [pendingApplyLayoutId, setPendingApplyLayoutId] = React.useState<string | null>(null);
  const isCenterFullscreen = useCenterStageFullscreenStore((state) => state.isFullscreen);
  const toggleCenterFullscreen = useCenterStageFullscreenStore(
    (state) => state.toggleFullscreen,
  );
  const closeTimerRef = React.useRef<number | null>(null);
  const layoutsLeaveTimerRef = React.useRef<number | null>(null);

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
      setLayoutsSubOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }, [clearCloseTimer]);

  const clearLayoutsLeaveTimer = React.useCallback(() => {
    if (layoutsLeaveTimerRef.current != null) {
      window.clearTimeout(layoutsLeaveTimerRef.current);
      layoutsLeaveTimerRef.current = null;
    }
  }, []);

  const scheduleLayoutsClose = React.useCallback(() => {
    clearLayoutsLeaveTimer();
    layoutsLeaveTimerRef.current = window.setTimeout(() => {
      setLayoutsSubOpen(false);
      layoutsLeaveTimerRef.current = null;
    }, 120);
  }, [clearLayoutsLeaveTimer]);

  React.useEffect(
    () => () => {
      clearCloseTimer();
      clearLayoutsLeaveTimer();
    },
    [clearCloseTimer, clearLayoutsLeaveTimer],
  );

  const openSaveDialog = React.useCallback(() => {
    setLayoutName("");
    setSaveDialogOpen(true);
    setOpen(false);
    setLayoutsSubOpen(false);
  }, []);

  const confirmSaveLayout = React.useCallback(() => {
    const name = layoutName.trim();
    if (!name || !onSaveLayout) return;
    onSaveLayout(name);
    setSaveDialogOpen(false);
    setLayoutName("");
  }, [layoutName, onSaveLayout]);

  const openSpaceDialog = React.useCallback(() => {
    setSpaceName("");
    setSpaceDialogOpen(true);
    setOpen(false);
    setLayoutsSubOpen(false);
  }, []);

  const confirmCreateSpace = React.useCallback(() => {
    const name = spaceName.trim();
    if (!name || !onCreateSpace) return;
    onCreateSpace(name);
    setSpaceDialogOpen(false);
    setSpaceName("");
  }, [onCreateSpace, spaceName]);

  const requestApplyLayout = React.useCallback(
    (layoutId: string) => {
      if (shouldConfirmApplyLayout?.()) {
        setPendingApplyLayoutId(layoutId);
        setApplyConfirmOpen(true);
        setOpen(false);
        setLayoutsSubOpen(false);
        return;
      }
      onApplyLayout?.(layoutId);
      setOpen(false);
      setLayoutsSubOpen(false);
    },
    [onApplyLayout, shouldConfirmApplyLayout],
  );

  const confirmApplyLayout = React.useCallback(() => {
    if (!pendingApplyLayoutId) return;
    onApplyLayout?.(pendingApplyLayoutId);
    setPendingApplyLayoutId(null);
    setApplyConfirmOpen(false);
  }, [onApplyLayout, pendingApplyLayoutId]);

  const showLayoutItems = Boolean(onSaveLayout || onApplyLayout);

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setLayoutsSubOpen(false);
            setPlusTab("tabs");
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={menuLabel}
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-active hover:text-foreground data-[state=open]:bg-active data-[state=open]:text-foreground"
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
          className="w-48 overflow-hidden border-border/70 bg-popover/90 p-1 shadow-lg backdrop-blur-xl"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
          onPointerDownOutside={(event) => {
            const target = event.target;
            if (
              target instanceof Element &&
              target.closest("[data-center-stage-layouts-menu]")
            ) {
              event.preventDefault();
            }
          }}
          onFocusOutside={(event) => {
            const target = event.target;
            if (
              target instanceof Element &&
              target.closest("[data-center-stage-layouts-menu]")
            ) {
              event.preventDefault();
            }
          }}
        >
          <MotionTabs
            value={plusTab}
            onValueChange={(value) => {
              if (value === "tabs" || value === "layout") setPlusTab(value);
              if (value !== "layout") setLayoutsSubOpen(false);
            }}
            variant="pill"
            className="w-full"
          >
            <MotionTabsList className="flex h-8 w-full min-w-0 gap-0.5 p-0.5">
              <MotionTabsTrigger
                value="tabs"
                className="h-7 min-w-0 flex-1 px-2 text-xs"
                onMouseEnter={() => {
                  setPlusTab("tabs");
                  setLayoutsSubOpen(false);
                }}
              >
                {plusMenuTabsLabel}
              </MotionTabsTrigger>
              <MotionTabsTrigger
                value="layout"
                className="h-7 min-w-0 flex-1 px-2 text-xs"
                onMouseEnter={() => setPlusTab("layout")}
              >
                {plusMenuLayoutLabel}
              </MotionTabsTrigger>
            </MotionTabsList>
            <PlusMenuTabPanels
              tab={plusTab}
              tabs={
                <>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
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
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
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
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              onCreateToolTab("files");
              setOpen(false);
            }}
          >
            <FolderTree className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{filesLabel}</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              onCreateToolTab("changes");
              setOpen(false);
            }}
          >
            <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{changesLabel}</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              onCreateToolTab("review");
              setOpen(false);
            }}
          >
            <FileDiff className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{reviewLabel}</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              onCreateToolTab("run");
              setOpen(false);
            }}
          >
            <Play className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{runLabel}</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              onCreateToolTab("github");
              setOpen(false);
            }}
          >
            <Github className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{githubLabel}</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              onCreateToolTab("pt-design");
              setOpen(false);
            }}
          >
            <PencilRuler className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{ptDesignLabel}</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              onCreateSimulator();
              setOpen(false);
            }}
          >
            <Smartphone className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{simulatorLabel}</span>
          </button>
                </>
              }
              layout={
                <>
          <button
            type="button"
            aria-pressed={isCenterFullscreen}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              toggleCenterFullscreen(paneId);
              setOpen(false);
            }}
          >
            {isCenterFullscreen ? (
              <Minimize2 className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Maximize2 className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {isCenterFullscreen ? exitFullscreenLabel : fullscreenLabel}
            </span>
          </button>
          {onSplitRight ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onSplitRight();
                setOpen(false);
              }}
            >
              <SquareSplitHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{splitRightLabel}</span>
            </button>
          ) : null}
          {onSplitDown ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onSplitDown();
                setOpen(false);
              }}
            >
              <Rows2 className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{splitDownLabel}</span>
            </button>
          ) : null}
          {onCreateSpace && newSpaceLabel ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={openSpaceDialog}
            >
              <Layers className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{newSpaceLabel}</span>
            </button>
          ) : null}
          {showLayoutItems ? (
            <Popover open={layoutsSubOpen} onOpenChange={setLayoutsSubOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
                  aria-haspopup="menu"
                  aria-expanded={layoutsSubOpen}
                  onMouseEnter={() => {
                    clearLayoutsLeaveTimer();
                    clearCloseTimer();
                    setLayoutsSubOpen(true);
                  }}
                  onMouseLeave={scheduleLayoutsClose}
                  onClick={(event) => {
                    event.preventDefault();
                    clearLayoutsLeaveTimer();
                    clearCloseTimer();
                    setLayoutsSubOpen(true);
                  }}
                >
                  <LayoutTemplate className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{layoutLabel}</span>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="left"
                sideOffset={4}
                data-center-stage-layouts-menu=""
                className="w-48 border-border/70 bg-popover/90 p-1 shadow-lg backdrop-blur-xl"
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                onMouseEnter={() => {
                  clearLayoutsLeaveTimer();
                  clearCloseTimer();
                }}
                onMouseLeave={() => {
                  scheduleLayoutsClose();
                  scheduleClose();
                }}
              >
                {onSaveLayout ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                    onClick={openSaveDialog}
                  >
                    <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{newLayoutLabel}</span>
                  </button>
                ) : null}
                {onSaveLayout && (savedLayouts?.length ?? 0) > 0 ? (
                  <div className="my-1 h-px bg-border/60" role="separator" />
                ) : null}
                {(savedLayouts ?? []).map((layout) => (
                  <button
                    key={layout.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                    onClick={() => requestApplyLayout(layout.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">{layout.name}</span>
                  </button>
                ))}
                {(savedLayouts?.length ?? 0) === 0 && !onSaveLayout ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    —
                  </div>
                ) : null}
              </PopoverContent>
            </Popover>
          ) : null}
                </>
              }
            />
          </MotionTabs>
        </PopoverContent>
      </Popover>

      <Dialog
        open={applyConfirmOpen}
        onOpenChange={(open) => {
          setApplyConfirmOpen(open);
          if (!open) setPendingApplyLayoutId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{applyLayoutConfirmTitle}</DialogTitle>
            <DialogDescription>{applyLayoutConfirmDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setApplyConfirmOpen(false);
                setPendingApplyLayoutId(null);
              }}
            >
              {applyLayoutCancelLabel}
            </Button>
            <Button type="button" onClick={confirmApplyLayout}>
              {applyLayoutConfirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={spaceDialogOpen} onOpenChange={setSpaceDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{newSpaceDialogTitle}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              confirmCreateSpace();
            }}
          >
            <Input
              autoFocus
              value={spaceName}
              onChange={(event) => setSpaceName(event.target.value)}
              placeholder={newSpaceNamePlaceholder}
              maxLength={64}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSpaceDialogOpen(false)}
              >
                {newSpaceCancelLabel}
              </Button>
              <Button type="submit" disabled={!spaceName.trim()}>
                {newSpaceConfirmLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{saveLayoutDialogTitle}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              confirmSaveLayout();
            }}
          >
            <Input
              autoFocus
              value={layoutName}
              onChange={(event) => setLayoutName(event.target.value)}
              placeholder={saveLayoutNamePlaceholder}
              maxLength={64}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSaveDialogOpen(false)}
              >
                {saveLayoutCancelLabel}
              </Button>
              <Button type="submit" disabled={!layoutName.trim()}>
                {saveLayoutConfirmLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SpecialTerminalTab({
  closeLabel,
  icon,
  label,
  tooltip,
  value,
  onClose,
  onContextMenu,
}: {
  closeLabel: string;
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  value: string;
  onClose: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <CenterStageTab
          value={value}
          aria-label={label}
          onPointerDown={preventNonPrimaryTabActivate}
          onContextMenu={onContextMenu}
          className="relative"
        >
          <CenterStageTabIconSlot closeLabel={closeLabel} onClose={onClose}>
            {icon}
          </CenterStageTabIconSlot>
          <span className="text-pretty">{label}</span>
        </CenterStageTab>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
