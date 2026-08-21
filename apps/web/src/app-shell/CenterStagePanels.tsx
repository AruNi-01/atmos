"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { toastManager } from "@workspace/ui";
import type { ReviewTarget } from "@/api/ws-api";
import { systemApi } from "@/api/rest-api";
import type { OpenFile } from "@/features/editor/store/use-editor-store";
import {
  FIXED_TERMINAL_TAB_VALUE,
  PROJECT_WIKI_WINDOW_NAME,
  type TerminalCenterTab,
} from "@/features/terminal/store/use-terminal-store";
import type { FixedTab } from "@/shared/lib/nuqs/searchParams";
import { cn } from "@/shared/lib/utils";
import type { TerminalGridHandle } from "@/features/terminal/components/TerminalGrid";
import type { PendingNamedTerminalRun } from "@/app-shell/center-stage-support";
import type { TerminalPaneProps } from "@/features/terminal/types/index";
import type { Project, Workspace } from "@/shared/types/domain";
import { useWorkspaceSurfaceCacheStore } from "@/features/workspace/store/use-workspace-surface-cache-store";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";
import type { GithubCenterTab } from "@/features/github/store/use-github-center-tabs";
import type { BrowserCenterTab } from "@/features/browser/store/use-browser-center-tabs";
import {
  pruneStickyLeavingContexts,
  pushStickyLeavingContext,
  resolveContextIdsToRender,
  resolveFrameActiveTab,
  resolveWorkspaceFrameActiveTabIds,
  mountedKeysForContext,
} from "@/app-shell/workspace-surface-policies";
import { scheduleIdle } from "@/app-shell/workspace-surface-switch";
import { readCenterStageLastTab } from "@/shared/stores/use-ui-pref-hooks";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useGithubCenterTabsStore } from "@/features/github/store/use-github-center-tabs";
import { useBrowserCenterTabsStore } from "@/features/browser/store/use-browser-center-tabs";
import {
  collectActiveTabIds,
  isFreshEmptyCenterLayout,
} from "@/app-shell/center-pane/center-pane-layout";
import { isExtraCenterSpaceKey } from "@/app-shell/center-space/center-space";
import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
import { paneHiddenByCenterFullscreen } from "@/app-shell/center-stage-fullscreen";
import { isTerminalCenterTabValue } from "@/app-shell/center-stage-tabs";
import {
  EMPTY_MOUNTED_TAB_IDS,
  WorkspaceCenterFrame,
  type TerminalQuickOpenAgent,
} from "@/app-shell/workspace-center-frame";
const WikiTab = dynamic(
  () => import("@/features/wiki").then((m) => m.WikiTab),
  { ssr: false },
);

interface CenterStagePanelsProps {
  activeValue: string;
  /** Multi-pane: all pane active tabs (focused first). */
  activeTabIds?: readonly string[] | null;
  /** Multi-pane: tab id → pane id for slot positioning. */
  tabToPaneId?: Readonly<Record<string, string>> | null;
  /** Multi-pane: content slot boxes relative to the panel host. */
  paneSlotBoxes?: Readonly<
    Record<string, { top: number; left: number; width: number; height: number }>
  > | null;
  /** Mosaic pane currently filling the center body. */
  fullscreenPaneId?: string | null;
  browserTabs: BrowserCenterTab[];
  codeReviewTabVisible: boolean;
  codeReviewTerminalGridRef: React.RefObject<TerminalGridHandle | null>;
  currentBranch?: string | null;
  currentProject?: Project;
  currentRepoPath?: string | null;
  currentView: string;
  currentWorkspace?: Workspace;
  /**
   * Deferred URL context — drives URL-synced live props (handlers, open files).
   * May lag `paintContextId` so hop commits stay interruptible (IMP-013).
   */
  effectiveContextId: string;
  /**
   * Immediate paint identity (live URL). Outer frame visibility follows this,
   * not deferred rebind.
   */
  paintContextId: string;
  githubTabs: GithubCenterTab[];
  handleCloseGithubTab: (value: string) => void;
  handleCreateTerminalCenterTab: () => void;
  handleTerminalPaneClosed: (event: {
    paneId: string;
    pane: TerminalPaneProps;
    terminalTabId: string;
    isLastPane: boolean;
  }) => void;

  openFiles: OpenFile[];
  onGithubPullRequestChanged: () => void;
  projectWikiTabVisible: boolean;
  simulatorTabVisible: boolean;
  gitHistoryTabVisible: boolean;
  changesTabVisible: boolean;
  reviewTabVisible: boolean;
  runTabVisible: boolean;
  githubHubTabVisible: boolean;
  filesTabVisible: boolean;
  ptDesignTabVisible: boolean;
  projectWikiTerminalGridRef: React.RefObject<TerminalGridHandle | null>;
  projectWikiUserTriggeredRef: React.RefObject<boolean>;
  reviewTarget: ReviewTarget | null;
  setFixedTab: (tab: FixedTab) => void;
  setProjectWikiPendingCommand: React.Dispatch<React.SetStateAction<PendingNamedTerminalRun | null>>;
  setProjectWikiVisibleMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setWikiPage: (page: string) => void;
  terminalGridRef: React.RefObject<TerminalGridHandle | null>;
  terminalGridRefs: React.RefObject<Record<string, TerminalGridHandle | null>>;
  terminalQuickOpenAgents: TerminalQuickOpenAgent[];
  visibleTerminalTabs: TerminalCenterTab[];
  wikiCenterEligible: boolean;
  wikiPageFromUrl?: string | null;
  wikiRefreshTrigger: number;
  mountedTerminalTabsByContext: Record<string, string[]>;
}

export function CenterStagePanels({
  activeValue,
  activeTabIds,
  tabToPaneId,
  paneSlotBoxes,
  fullscreenPaneId,
  browserTabs,
  codeReviewTabVisible,
  codeReviewTerminalGridRef,
  currentBranch,
  currentProject,
  currentRepoPath,
  currentView,
  currentWorkspace,
  effectiveContextId,
  paintContextId,
  githubTabs,
  handleCloseGithubTab,
  handleCreateTerminalCenterTab,
  handleTerminalPaneClosed,

  openFiles,
  onGithubPullRequestChanged,
  projectWikiTabVisible,
  simulatorTabVisible,
  gitHistoryTabVisible,
  changesTabVisible,
  reviewTabVisible,
  runTabVisible,
  githubHubTabVisible,
  filesTabVisible,
  ptDesignTabVisible,
  projectWikiTerminalGridRef,
  projectWikiUserTriggeredRef,
  reviewTarget,
  setFixedTab,
  setProjectWikiPendingCommand,
  setProjectWikiVisibleMap,
  setWikiPage,
  terminalGridRef,
  terminalGridRefs,
  terminalQuickOpenAgents,
  visibleTerminalTabs,
  wikiCenterEligible,
  wikiPageFromUrl,
  wikiRefreshTrigger,
  mountedTerminalTabsByContext,
}: CenterStagePanelsProps) {
  const t = useTranslations("appShell.centerStagePanels");
  // Do NOT subscribe to visualActiveContextId — hop paint is DOM-first (IMP-010/012).
  // Subscribing forced a multi-frame host re-render on every click and starved sidebar input.
  // Prefer id lists over full warm entry objects — lastAccessed churn must not re-render.
  const warmIds = useWorkspaceSurfaceCacheStore((s) =>
    s.warm.map((w) => w.contextId).join("\0"),
  );
  const mountPlan = useWorkspaceSurfaceCacheStore((s) => s.mountPlan);
  const setSurfaceSnapshots = useWorkspaceSurfaceCacheStore((s) => s.setSurfaceSnapshots);
  const allWorkspaceTerminalTabs = useTerminalStore((s) => s.workspaceTerminalTabs);
  // Structural fingerprint only (scope → pane ids). Dynamic title / agent metadata
  // updates must NOT re-render CenterStagePanels or re-run mount-budget snapshots.
  const terminalPaneStructureKey = useTerminalStore((s) => {
    const panesByScope = s.workspacePanes;
    const scopeKeys = Object.keys(panesByScope);
    if (scopeKeys.length === 0) return "";
    scopeKeys.sort();
    let out = "";
    for (const scopeKey of scopeKeys) {
      const ids = Object.keys(panesByScope[scopeKey] ?? {});
      ids.sort();
      out += `${scopeKey}:${ids.join(",")};`;
    }
    return out;
  });
  const getOpenFiles = useEditorStore((s) => s.getOpenFiles);
  const githubTabsByContext = useGithubCenterTabsStore((s) => s.tabsByContext);
  const browserTabsByContext = useBrowserCenterTabsStore((s) => s.tabsByContext);
  const layoutsByContext = useCenterPaneLayoutStore((s) => s.byContext);

  // Sticky leave tracks paint (live) id so the shell we just left stays mounted
  // while deferred URL-sync catches up.
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
  const contextIdsToRender = resolveContextIdsToRender({
    effectiveContextId: paintContextId,
    warmIds: warmIdList,
    stickyLeavingIds: stickyLeavingIdsRef.current,
  });

  // Shell visibility: live paint id (and optional visual lead from store snapshot).
  const visualActiveContextId =
    useWorkspaceSurfaceCacheStore.getState().visualActiveContextId;
  const displayContextId =
    visualActiveContextId &&
    visualActiveContextId !== paintContextId &&
    contextIdsToRender.includes(visualActiveContextId)
      ? visualActiveContextId
      : paintContextId;

  // Publish surface snapshots once per structural change (effect cleanup cancels
  // superseded idle work so rapid hops do not run intermediate snapshots).
  const snapshotGenRef = React.useRef(0);
  React.useEffect(() => {
    const contextIds = contextIdsToRender;
    const gen = ++snapshotGenRef.current;
    return scheduleIdle(() => {
      if (gen !== snapshotGenRef.current) return;
      // Read panes live so we pick up structure at idle time without subscribing
      // to title-level workspacePanes updates.
      const liveGetPanes = useTerminalStore.getState().getPanes;
      // Prefer URL-synced active for snapshot authority; visual-only lead still uses
      // last-tab identity for the leading frame until promote lands.
      // Snapshot authority uses deferred URL-sync id when settled; fall back to paint.
      const activeId = effectiveContextId || paintContextId;
      const batch: Array<{
        contextId: string;
        terminalTabIds: string[];
        terminalPaneCountByTabId: Record<string, number>;
        editorPathsRecent: string[];
        browserTabValues: string[];
        lightIds: string[];
        namedTerminals: Array<"project-wiki" | "code-review">;
        frameActiveTab: string;
        frameActiveTabIds?: readonly string[];
      }> = [];
      for (const contextId of contextIds) {
        const isActive = contextId === activeId;
        const contextLayout = layoutsByContext[contextId];
        if (
          isExtraCenterSpaceKey(contextId) &&
          (!contextLayout || isFreshEmptyCenterLayout(contextLayout))
        ) {
          batch.push({
            contextId,
            terminalTabIds: [],
            terminalPaneCountByTabId: {},
            editorPathsRecent: [],
            browserTabValues: [],
            lightIds: [],
            namedTerminals: [],
            frameActiveTab: "",
            frameActiveTabIds: [],
          });
          continue;
        }
        const tabs =
          allWorkspaceTerminalTabs[contextId] ??
          (isActive
            ? visibleTerminalTabs
            : [{ id: FIXED_TERMINAL_TAB_VALUE, title: "Term", closable: true }]);
        const files = getOpenFiles(contextId);
        const last = readCenterStageLastTab(contextId);
        const validForContext = [
          ...tabs.map((tab) => tab.id),
          ...files.map((f) => f.path),
          ...((githubTabsByContext[contextId] ?? []).map((tab) => tab.value)),
          ...((browserTabsByContext[contextId] ?? []).map((b) => b.value)),
          "overview",
          "wiki",
          "project-wiki",
          "code-review",
          "simulator",
          "git-history",
          "changes",
          "review",
          "run",
          "github",
          "files",
          "pt-design",
          FIXED_TERMINAL_TAB_VALUE,
        ];
        const frameActiveTab = resolveFrameActiveTab({
          isActiveFrame: isActive,
          urlOrEditorTab: isActive ? activeValue : null,
          lastCenterTab: last,
          fallbackTab: FIXED_TERMINAL_TAB_VALUE,
          validTabs: validForContext,
        });
        const paneActiveTabIds =
          contextLayout && contextLayout.order.length > 1
            ? collectActiveTabIds(contextLayout).filter(Boolean)
            : [];
        const preferKeepIds =
          paneActiveTabIds.length > 0 ? paneActiveTabIds : [frameActiveTab];
        const lightIds: string[] = [];
        for (const tabId of preferKeepIds) {
          if (
            tabId === "overview" ||
            tabId === "wiki" ||
            tabId === "simulator" ||
            tabId === "git-history" ||
            tabId === "changes" ||
            tabId === "review" ||
            tabId === "run" ||
            tabId === "github" ||
            tabId === "files" ||
            tabId === "pt-design"
          ) {
            lightIds.push(tabId);
          }
        }
        // GitHub center tabs are light surfaces — pane-active / last-active ids enter mount plan.
        const ghTabs = githubTabsByContext[contextId] ?? [];
        for (const tab of ghTabs) {
          if (
            preferKeepIds.includes(tab.value) ||
            (isActive && activeValue === tab.value)
          ) {
            lightIds.push(tab.value);
          }
        }
        const named: Array<"project-wiki" | "code-review"> = [];
        if (
          preferKeepIds.includes("project-wiki") ||
          (isActive && projectWikiTabVisible)
        ) {
          named.push("project-wiki");
        }
        if (
          preferKeepIds.includes("code-review") ||
          (isActive && codeReviewTabVisible)
        ) {
          named.push("code-review");
        }
        const paneActiveTerminals = preferKeepIds.filter((id) =>
          isTerminalCenterTabValue(id),
        );
        const terminalTabIds = Array.from(
          new Set(
            (isActive
              ? mountedTerminalTabsByContext[contextId] ?? tabs.map((tab) => tab.id)
              : mountedTerminalTabsByContext[contextId] ?? [FIXED_TERMINAL_TAB_VALUE]
            )
              .concat(paneActiveTerminals)
              .filter(Boolean),
          ),
        );
        const terminalPaneCountByTabId: Record<string, number> = {};
        for (const tabId of terminalTabIds) {
          const panes = liveGetPanes(
            contextId,
            tabId === FIXED_TERMINAL_TAB_VALUE ? undefined : tabId,
          );
          terminalPaneCountByTabId[tabId] = Math.max(1, Object.keys(panes ?? {}).length);
        }
        batch.push({
          contextId,
          terminalTabIds,
          terminalPaneCountByTabId,
          editorPathsRecent: files.map((f) => f.path),
          browserTabValues: (browserTabsByContext[contextId] ?? []).map((b) => b.value),
          lightIds,
          namedTerminals: named,
          frameActiveTab,
          frameActiveTabIds: preferKeepIds,
        });
      }
      // One notify for N contexts — avoids N mountPlan recomputes mid-idle.
      setSurfaceSnapshots(batch);
    }, 200);
    // Intentionally omit setSurfaceSnapshots identity churn; store no-ops identical snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid mountPlan-driven loops
  }, [
    activeValue,
    allWorkspaceTerminalTabs,
    browserTabsByContext,
    codeReviewTabVisible,
    contextIdsToRender.join(","),
    getOpenFiles,
    githubTabsByContext,
    mountedTerminalTabsByContext,
    // Structure only — titles/agent fields must not appear here.
    terminalPaneStructureKey,
    projectWikiTabVisible,
    simulatorTabVisible,
    gitHistoryTabVisible,
    changesTabVisible,
    reviewTabVisible,
    runTabVisible,
    githubHubTabVisible,
    filesTabVisible,
    ptDesignTabVisible,
    visibleTerminalTabs,
    effectiveContextId,
    paintContextId,
    layoutsByContext,
  ]);

  const fallbackTerminalTitle = t("fallbackTerminalTitle");

  return (
    // Single flex child so wiki does not share height 50/50 with workspace frames.
    // Frames stay absolute-stacked inside; wiki overlays full inset when active.
    <div className="relative flex-1 min-h-0 min-w-0 w-full">
      {/* Stack workspace frames: keep warm DOM mounted, CSS-hide only. */}
      {contextIdsToRender.map((contextId) => {
        // Shell paint follows live paint / visual id (not deferred rebind).
        const isActiveContext = contextId === displayContextId;
        // Heavy live props only after deferred URL context catches paint (IMP-013).
        const isUrlSyncedActive =
          isActiveContext &&
          contextId === effectiveContextId &&
          effectiveContextId === paintContextId;
        const mountedTabIds =
          mountedTerminalTabsByContext[contextId] ?? EMPTY_MOUNTED_TAB_IDS;
        const mountPlanKeys = mountedKeysForContext(mountPlan, contextId).join("\0");
        const contextLayout = layoutsByContext[contextId];
        const retainedActiveTabIds =
          contextLayout && contextLayout.order.length > 1
            ? collectActiveTabIds(contextLayout)
            : null;

        return (
          <WorkspaceCenterFrame
            key={contextId}
            contextId={contextId}
            isActiveContext={isActiveContext}
            isUrlSyncedActive={isUrlSyncedActive}
            mountPlan={mountPlan}
            mountPlanKeys={mountPlanKeys}
            mountedTabIds={mountedTabIds}
            fallbackTerminalTitle={fallbackTerminalTitle}
            activeValue={isUrlSyncedActive ? activeValue : null}
            activeTabIds={resolveWorkspaceFrameActiveTabIds({
              isActiveContext,
              isUrlSyncedActive,
              liveActiveTabIds: activeTabIds,
              retainedActiveTabIds,
            })}
            tabToPaneId={isUrlSyncedActive ? tabToPaneId : null}
            paneSlotBoxes={isUrlSyncedActive ? paneSlotBoxes : null}
            fullscreenPaneId={isUrlSyncedActive ? fullscreenPaneId : null}
            visibleTerminalTabs={isUrlSyncedActive ? visibleTerminalTabs : undefined}
            openFiles={isUrlSyncedActive ? openFiles : undefined}
            githubTabs={isUrlSyncedActive ? githubTabs : undefined}
            browserTabs={isUrlSyncedActive ? browserTabs : undefined}
            currentView={isUrlSyncedActive ? currentView : undefined}
            currentProject={isUrlSyncedActive ? currentProject : undefined}
            currentWorkspace={isUrlSyncedActive ? currentWorkspace : undefined}
            currentBranch={isUrlSyncedActive ? currentBranch : undefined}
            currentRepoPath={isUrlSyncedActive ? currentRepoPath : undefined}
            reviewTarget={isUrlSyncedActive ? reviewTarget : undefined}
            projectWikiTabVisible={projectWikiTabVisible}
            codeReviewTabVisible={codeReviewTabVisible}
            simulatorTabVisible={simulatorTabVisible}
            gitHistoryTabVisible={gitHistoryTabVisible}
            changesTabVisible={changesTabVisible}
            reviewTabVisible={reviewTabVisible}
            runTabVisible={runTabVisible}
            githubHubTabVisible={githubHubTabVisible}
            filesTabVisible={filesTabVisible}
            ptDesignTabVisible={ptDesignTabVisible}
            terminalQuickOpenAgents={
              isUrlSyncedActive ? terminalQuickOpenAgents : undefined
            }
            terminalGridRef={isUrlSyncedActive ? terminalGridRef : undefined}
            terminalGridRefs={isUrlSyncedActive ? terminalGridRefs : undefined}
            projectWikiTerminalGridRef={
              isUrlSyncedActive ? projectWikiTerminalGridRef : undefined
            }
            codeReviewTerminalGridRef={
              isUrlSyncedActive ? codeReviewTerminalGridRef : undefined
            }
            handleCreateTerminalCenterTab={
              isUrlSyncedActive ? handleCreateTerminalCenterTab : undefined
            }
            handleTerminalPaneClosed={
              isUrlSyncedActive ? handleTerminalPaneClosed : undefined
            }
            handleCloseGithubTab={isUrlSyncedActive ? handleCloseGithubTab : undefined}
            onGithubPullRequestChanged={
              isUrlSyncedActive ? onGithubPullRequestChanged : undefined
            }
          />
        );
      })}

      {/*
        Wiki stays host-active only (callbacks write URL).
        Absolute overlay — never a flex-1 sibling of frames (that split the stage 50/50).
        display:none when inactive is fine: wiki has no xterm WebGL keep-alive need.
      */}
      {wikiCenterEligible && (
        <div
          data-center-pane-owner={tabToPaneId?.wiki}
          className={cn(
            "absolute inset-0 z-[2] min-h-0 min-w-0 overflow-hidden bg-background",
            (!(
              activeValue === "wiki" ||
              (activeTabIds && activeTabIds.includes("wiki"))
            ) ||
              paneHiddenByCenterFullscreen(fullscreenPaneId, tabToPaneId?.wiki)) &&
              "hidden",
            activeTabIds && activeTabIds.includes("wiki") && "pointer-events-auto",
          )}
          style={
            activeTabIds &&
            activeTabIds.includes("wiki") &&
            tabToPaneId?.wiki &&
            paneSlotBoxes?.[tabToPaneId.wiki]
              ? {
                  top: paneSlotBoxes[tabToPaneId.wiki]!.top,
                  right: "auto",
                  bottom: "auto",
                  left: paneSlotBoxes[tabToPaneId.wiki]!.left,
                  width: paneSlotBoxes[tabToPaneId.wiki]!.width,
                  height: paneSlotBoxes[tabToPaneId.wiki]!.height,
                }
              : undefined
          }
        >
          <WikiTab
            contextId={effectiveContextId}
            effectivePath={currentProject?.mainFilePath || ""}
            projectName={currentProject?.name}
            refreshTrigger={wikiRefreshTrigger}
            terminalGridRef={terminalGridRef}
            onSwitchToTerminal={() => setFixedTab("terminal")}
            onSwitchToProjectWikiAndRun={(run) => {
              projectWikiUserTriggeredRef.current = true;
              setProjectWikiPendingCommand(run);
              setProjectWikiVisibleMap((prev) => ({
                ...prev,
                [effectiveContextId]: true,
              }));
              setFixedTab("project-wiki");
            }}
            onProjectWikiReplaceAndRun={async (run) => {
              try {
                await systemApi.killProjectWikiWindow(effectiveContextId);
                projectWikiTerminalGridRef.current?.removeTerminalByTmuxWindowName(
                  PROJECT_WIKI_WINDOW_NAME,
                );
                projectWikiUserTriggeredRef.current = true;
                setProjectWikiPendingCommand(run);
                setProjectWikiVisibleMap((prev) => ({
                  ...prev,
                  [effectiveContextId]: true,
                }));
                setFixedTab("project-wiki");
                toastManager.add({
                  title: t("toasts.wikiGenerationStarted.title"),
                  description: t("toasts.wikiGenerationStarted.description"),
                  type: "info",
                });
              } catch (err) {
                setProjectWikiPendingCommand(null);
                toastManager.add({
                  title: t("errors.failedToClosePreviousTerminal"),
                  description: err instanceof Error ? err.message : t("errors.unknown"),
                  type: "error",
                });
              }
            }}
            wikiPage={wikiPageFromUrl ?? undefined}
            onWikiPageChange={setWikiPage}
            isWikiTabActive={activeValue === "wiki"}
          />
        </div>
      )}
    </div>
  );
}
