"use client";

/**
 * Per-context center tab chrome (APP-043 / IMP-015).
 *
 * Frames already stay mounted and hide via `data-tier`. The tab strip used to
 * be a single URL-deferred bar, so every workspace hop remounted the tabs.
 * Keep one strip per Active∪Warm context and opacity-hide the rest.
 */

import React from "react";
import {
  KeyboardSensor,
  PointerSensor,
  Tabs,
  sortableKeyboardCoordinates,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@workspace/ui";
import { CenterStageTabBar } from "@/app-shell/CenterStageTabBar";
import { useCenterStageTabGroups } from "@/app-shell/use-center-stage-tab-groups";
import { useCenterStageTabScrollEffects } from "@/app-shell/center-stage-support";
import type { TabGroupItem } from "@/app-shell/center-stage-tabs";
import type { CenterTabContextMenuState } from "@/app-shell/center-stage-tab-model";
import {
  pruneStickyLeavingContexts,
  pushStickyLeavingContext,
  resolveContextIdsToRender,
  resolveFrameActiveTab,
} from "@/app-shell/workspace-surface-policies";
import {
  readCenterStageLastTab,
  readCenterStageTabStripOrder,
  writeCenterStageTabStripOrder,
} from "@/shared/stores/use-ui-pref-hooks";
import { useEditorStore, type OpenFile } from "@/features/editor/store/use-editor-store";
import {
  FIXED_TERMINAL_TAB_VALUE,
  useTerminalStore,
  type TerminalCenterTab,
} from "@/features/terminal/store/use-terminal-store";
import { useGithubCenterTabsStore } from "@/features/github/store/use-github-center-tabs";
import { useBrowserCenterTabsStore } from "@/features/browser/store/use-browser-center-tabs";
import {
  DEFAULT_PREVIEW_BROWSER_PREFS,
  type PreviewBrowserPrefs,
} from "@/features/browser/lib/browser-labels";
import { useSimulatorCenterTabStore } from "@/features/simulator";
import { useWorkspaceSurfaceCacheStore } from "@/features/workspace/store/use-workspace-surface-cache-store";
import { useTranslations } from "next-intl";

const EMPTY_TERMINAL_TABS: TerminalCenterTab[] = [];
const EMPTY_OPEN_FILES: OpenFile[] = [];
const EMPTY_GITHUB_TABS: never[] = [];
const EMPTY_BROWSER_TABS: never[] = [];
const EMPTY_ORDER: string[] = [];

const noop = () => {};
const noopCloseFile = (_file: OpenFile) => {};
const noopRename = (_tabId: string, _title: string) => {};
const noopSelectGroup = (_tab: TabGroupItem) => {};
const noopCloseGroup = (_tab: TabGroupItem) => {};
const noopGroupDrag = (_event: DragEndEvent) => {};
const noopStripOrder = (_order: string[]) => {};
const noopPinFile = (_path: string, _workspaceId?: string) => {};
const noopSetTabMenu = (_value: CenterTabContextMenuState) => {};
const noopSetBoolean: React.Dispatch<React.SetStateAction<boolean>> = () => {};
const noopSetNumber: React.Dispatch<React.SetStateAction<number>> = () => {};
const noopSetHover: React.Dispatch<React.SetStateAction<string | null>> = () => {};

type SessionDisplay = {
  sessionTitle?: string | null;
  revisionLabel?: string | null;
} | null;

export type WorkspaceCenterTabBarsProps = {
  paintContextId: string;
  urlContextId: string;
  urlActiveValue: string;
  isUrlSynced: boolean;
  projectWikiVisibleMap: Record<string, boolean>;
  codeReviewVisibleMap: Record<string, boolean>;
  wikiCenterEligible: boolean;
  wikiRefreshing: boolean;
  sessionDisplay: SessionDisplay;
  previewBrowserPrefs: PreviewBrowserPrefs;
  browserFallbackLabel: string;
  handleCenterStageTabChange: (value: string) => void;
  handleCloseTabGroupItem: (tab: TabGroupItem) => void;
  handleCloseBrowserTab: (value: string) => void;
  handleCloseFile: (file: OpenFile) => void;
  handleCloseGithubTab: (value: string) => void;
  handleCloseTerminalCenterTab: (tabId: string) => void;
  handleCreateBrowserCenterTab: () => void;
  handleCreateSimulatorCenterTab: () => void;
  handleCreateTerminalCenterTab: () => void;
  handleCloseSimulatorTab: () => void;
  handleRenameTerminalCenterTab: (tabId: string, title: string) => void;
  handleSelectTabGroupItem: (tab: TabGroupItem) => void;
  pinFile: (path: string, workspaceId?: string) => void;
  setCodeReviewCloseConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setProjectWikiCloseConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTabContextMenu: (value: CenterTabContextMenuState) => void;
  setWikiRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  setWikiRefreshTrigger: React.Dispatch<React.SetStateAction<number>>;
};

function usePaintContextIds(paintContextId: string): {
  contextIds: string[];
  displayContextId: string;
} {
  const warmIds = useWorkspaceSurfaceCacheStore((s) =>
    s.warm.map((w) => w.contextId).join("\0"),
  );
  const lastPaintContextRef = React.useRef(paintContextId);
  const stickyLeavingIdsRef = React.useRef<string[]>([]);
  if (lastPaintContextRef.current !== paintContextId) {
    stickyLeavingIdsRef.current = pushStickyLeavingContext(
      stickyLeavingIdsRef.current,
      lastPaintContextRef.current,
      paintContextId,
    );
    lastPaintContextRef.current = paintContextId;
  }
  const warmIdList = warmIds ? warmIds.split("\0").filter(Boolean) : [];
  stickyLeavingIdsRef.current = pruneStickyLeavingContexts(stickyLeavingIdsRef.current, {
    effectiveContextId: paintContextId,
    warmIds: warmIdList,
  });
  const contextIds = resolveContextIdsToRender({
    effectiveContextId: paintContextId,
    warmIds: warmIdList,
    stickyLeavingIds: stickyLeavingIdsRef.current,
  });
  const visualActiveContextId =
    useWorkspaceSurfaceCacheStore.getState().visualActiveContextId;
  const displayContextId =
    visualActiveContextId &&
    visualActiveContextId !== paintContextId &&
    contextIds.includes(visualActiveContextId)
      ? visualActiveContextId
      : paintContextId;
  return { contextIds, displayContextId };
}

export function WorkspaceCenterTabBars(props: WorkspaceCenterTabBarsProps) {
  const { paintContextId } = props;
  const { contextIds, displayContextId } = usePaintContextIds(paintContextId);

  return (
    <div className="relative h-10 shrink-0">
      {contextIds.map((contextId) => (
        <WorkspaceCenterTabBarLayer
          key={contextId}
          {...props}
          contextId={contextId}
          isPaintActive={contextId === displayContextId}
        />
      ))}
    </div>
  );
}

function WorkspaceCenterTabBarLayer({
  contextId,
  isPaintActive,
  urlContextId,
  urlActiveValue,
  isUrlSynced,
  projectWikiVisibleMap,
  codeReviewVisibleMap,
  wikiCenterEligible,
  wikiRefreshing,
  sessionDisplay,
  previewBrowserPrefs,
  browserFallbackLabel,
  handleCenterStageTabChange,
  handleCloseTabGroupItem,
  handleCloseBrowserTab,
  handleCloseFile,
  handleCloseGithubTab,
  handleCloseTerminalCenterTab,
  handleCreateBrowserCenterTab,
  handleCreateSimulatorCenterTab,
  handleCreateTerminalCenterTab,
  handleCloseSimulatorTab,
  handleRenameTerminalCenterTab,
  handleSelectTabGroupItem,
  pinFile,
  setCodeReviewCloseConfirmOpen,
  setProjectWikiCloseConfirmOpen,
  setTabContextMenu,
  setWikiRefreshing,
  setWikiRefreshTrigger,
}: WorkspaceCenterTabBarsProps & {
  contextId: string;
  isPaintActive: boolean;
}) {
  const t = useTranslations("appShell");
  const isInteractive = isPaintActive && isUrlSynced && contextId === urlContextId;
  const fallbackTitle = t("fallbackTerminalTitle");
  const fallbackTabs = React.useMemo<TerminalCenterTab[]>(
    () => [{ id: FIXED_TERMINAL_TAB_VALUE, title: fallbackTitle, closable: true }],
    [fallbackTitle],
  );

  const storeTerminalTabs = useTerminalStore(
    (s) => s.workspaceTerminalTabs[contextId] ?? EMPTY_TERMINAL_TABS,
  );
  const visibleTerminalTabs =
    storeTerminalTabs.length > 0 ? storeTerminalTabs : fallbackTabs;
  const openFiles = useEditorStore(
    (s) => s.workspaceStates[contextId]?.openFiles ?? EMPTY_OPEN_FILES,
  );
  const githubTabs = useGithubCenterTabsStore(
    (s) => s.tabsByContext[contextId] ?? EMPTY_GITHUB_TABS,
  );
  const browserTabs = useBrowserCenterTabsStore(
    (s) => s.tabsByContext[contextId] ?? EMPTY_BROWSER_TABS,
  );
  const simulatorTabVisible = useSimulatorCenterTabStore((s) =>
    Boolean(s.visibleByContext[contextId]),
  );
  const lastTab = readCenterStageLastTab(contextId);
  const projectWikiTabVisible =
    Boolean(projectWikiVisibleMap[contextId]) || lastTab === "project-wiki";
  const codeReviewTabVisible =
    Boolean(codeReviewVisibleMap[contextId]) || lastTab === "code-review";

  const validTabs = React.useMemo(
    () => [
      ...visibleTerminalTabs.map((tab) => tab.id),
      ...openFiles.map((file) => file.path),
      ...githubTabs.map((tab) => tab.value),
      ...browserTabs.map((tab) => tab.value),
      "overview",
      "wiki",
      "project-wiki",
      "code-review",
      "simulator",
      FIXED_TERMINAL_TAB_VALUE,
    ],
    [browserTabs, githubTabs, openFiles, visibleTerminalTabs],
  );
  const layerActiveValue = resolveFrameActiveTab({
    isActiveFrame: isPaintActive,
    urlOrEditorTab: isInteractive ? urlActiveValue : null,
    lastCenterTab: lastTab,
    fallbackTab: visibleTerminalTabs[0]?.id ?? FIXED_TERMINAL_TAB_VALUE,
    validTabs,
  });

  const [tabStripOrder, setTabStripOrder] = React.useState<string[]>(
    () => readCenterStageTabStripOrder(contextId) ?? EMPTY_ORDER,
  );
  React.useEffect(() => {
    setTabStripOrder(readCenterStageTabStripOrder(contextId) ?? EMPTY_ORDER);
  }, [contextId]);

  const handleTabStripOrderChange = React.useCallback(
    (order: string[]) => {
      setTabStripOrder(order);
      writeCenterStageTabStripOrder(contextId, order);
    },
    [contextId],
  );

  const { handleTabGroupDragEnd, orderedGroupedTabItems } = useCenterStageTabGroups({
    browserTabs,
    codeReviewTabVisible,
    effectiveContextId: contextId,
    githubTabs,
    openFiles,
    previewBrowserPrefs: previewBrowserPrefs ?? DEFAULT_PREVIEW_BROWSER_PREFS,
    projectWikiTabVisible,
    terminalTabs: visibleTerminalTabs,
  });

  const tabGroupDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [tabGroupPopoverOpen, setTabGroupPopoverOpen] = React.useState(false);
  const [termTabPlusHoveredTabId, setTermTabPlusHoveredTabId] = React.useState<
    string | null
  >(null);
  const scrollableTabsRef = React.useRef<HTMLDivElement>(null);

  useCenterStageTabScrollEffects({
    activeValue: layerActiveValue,
    codeReviewTabVisible,
    effectiveContextId: isPaintActive ? contextId : null,
    openFilesCount: openFiles.length,
    projectWikiTabVisible,
    scrollableTabsRef,
    visibleTerminalTabsCount: visibleTerminalTabs.length,
  });

  const handleSelectGroupItem = React.useCallback(
    (tab: TabGroupItem) => {
      handleSelectTabGroupItem(tab);
      setTabGroupPopoverOpen(false);
    },
    [handleSelectTabGroupItem],
  );

  const isTabGroupItemActive = React.useCallback(
    (tab: TabGroupItem) => {
      if (tab.kind !== "browser") {
        return layerActiveValue === tab.value;
      }
      if (layerActiveValue !== tab.value || !tab.browserContextId || !tab.browserTabId) {
        return false;
      }
      const context = previewBrowserPrefs.byContext[tab.browserContextId];
      const activeTabId = context?.activeTabId ?? context?.tabs?.[0]?.id;
      return activeTabId === tab.browserTabId;
    },
    [layerActiveValue, previewBrowserPrefs],
  );

  return (
    <div
      data-workspace-tabbar={contextId}
      data-tier={isPaintActive ? "active" : "warm"}
      aria-hidden={!isPaintActive}
      inert={!isPaintActive ? true : undefined}
      className="absolute inset-0"
    >
      <Tabs
        value={layerActiveValue}
        onValueChange={isInteractive ? handleCenterStageTabChange : undefined}
        className="flex h-full min-h-0 flex-col overflow-hidden"
      >
        <CenterStageTabBar
          activeValue={layerActiveValue}
          browserFallbackLabel={browserFallbackLabel}
          browserTabs={browserTabs}
          codeReviewTabVisible={codeReviewTabVisible}
          effectiveContextId={contextId}
          githubTabs={githubTabs}
          isTabGroupItemActive={isTabGroupItemActive}
          openFiles={openFiles}
          orderedGroupedTabItems={orderedGroupedTabItems}
          previewBrowserPrefs={previewBrowserPrefs}
          projectWikiTabVisible={projectWikiTabVisible}
          simulatorTabVisible={simulatorTabVisible || lastTab === "simulator"}
          scrollableTabsRef={scrollableTabsRef}
          sessionDisplay={sessionDisplay}
          tabGroupDndSensors={tabGroupDndSensors}
          tabGroupPopoverOpen={tabGroupPopoverOpen}
          tabStripOrder={tabStripOrder}
          termTabPlusHoveredTabId={termTabPlusHoveredTabId}
          visibleTerminalTabs={visibleTerminalTabs}
          wikiCenterEligible={wikiCenterEligible}
          wikiRefreshing={wikiRefreshing}
          handleCenterStageTabChange={
            isInteractive ? handleCenterStageTabChange : noop
          }
          handleCloseTabGroupItem={isInteractive ? handleCloseTabGroupItem : noopCloseGroup}
          handleCloseBrowserTab={isInteractive ? handleCloseBrowserTab : noop}
          handleCloseFile={isInteractive ? handleCloseFile : noopCloseFile}
          handleCloseGithubTab={isInteractive ? handleCloseGithubTab : noop}
          handleCloseTerminalCenterTab={
            isInteractive ? handleCloseTerminalCenterTab : noop
          }
          handleCreateBrowserCenterTab={
            isInteractive ? handleCreateBrowserCenterTab : noop
          }
          handleCreateSimulatorCenterTab={
            isInteractive ? handleCreateSimulatorCenterTab : noop
          }
          handleCreateTerminalCenterTab={
            isInteractive ? handleCreateTerminalCenterTab : noop
          }
          handleCloseSimulatorTab={isInteractive ? handleCloseSimulatorTab : noop}
          handleRenameTerminalCenterTab={
            isInteractive ? handleRenameTerminalCenterTab : noopRename
          }
          handleSelectTabGroupItem={
            isInteractive ? handleSelectGroupItem : noopSelectGroup
          }
          handleTabGroupDragEnd={isInteractive ? handleTabGroupDragEnd : noopGroupDrag}
          onTabStripOrderChange={
            isInteractive ? handleTabStripOrderChange : noopStripOrder
          }
          pinFile={isInteractive ? pinFile : noopPinFile}
          setCodeReviewCloseConfirmOpen={
            isInteractive ? setCodeReviewCloseConfirmOpen : noopSetBoolean
          }
          setProjectWikiCloseConfirmOpen={
            isInteractive ? setProjectWikiCloseConfirmOpen : noopSetBoolean
          }
          setTabContextMenu={isInteractive ? setTabContextMenu : noopSetTabMenu}
          setTabGroupPopoverOpen={setTabGroupPopoverOpen}
          setTermTabPlusHoveredTabId={
            isInteractive ? setTermTabPlusHoveredTabId : noopSetHover
          }
          setWikiRefreshing={isInteractive ? setWikiRefreshing : noopSetBoolean}
          setWikiRefreshTrigger={isInteractive ? setWikiRefreshTrigger : noopSetNumber}
        />
      </Tabs>
    </div>
  );
}
