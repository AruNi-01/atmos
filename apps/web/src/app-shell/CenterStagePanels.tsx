"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Loader2, TabsPanel, toastManager } from "@workspace/ui";
import type { ReviewTarget } from "@/api/ws-api";
import { systemApi } from "@/api/rest-api";
import {
  ReviewContextProvider,
} from "@/features/diff/components/review/ReviewContextProvider";
import { OverviewTab } from "@/features/workspace/components/OverviewTab";
import {
  EDITOR_REVIEW_DIFF_PREFIX,
  getEditorSourcePath,
  getReviewGroupRevisionGuid,
  isConflictResolveEditorPath,
  isReviewGroupEditorPath,
  type OpenFile,
} from "@/features/editor/store/use-editor-store";
import {
  FIXED_TERMINAL_TAB_VALUE,
  PROJECT_WIKI_WINDOW_NAME,
  type TerminalCenterTab,
} from "@/features/terminal/store/use-terminal-store";
import type { FixedTab } from "@/shared/lib/nuqs/searchParams";
import { isDiffGroupEditorPath } from "@/features/diff/lib/diff-editor-paths";
import { cn } from "@/shared/lib/utils";
import type { TerminalGridHandle } from "@/features/terminal/components/TerminalGrid";
import type { PendingNamedTerminalRun } from "@/app-shell/center-stage-support";
import type { TerminalPaneAgent } from "@/features/terminal/types/index";
import type { TerminalPaneProps } from "@/features/terminal/types/index";
import type { Project, Workspace } from "@/shared/types/domain";
import { useTerminalCacheStore } from "@/features/terminal/store/use-terminal-cache-store";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";

function TerminalGridLoadingFallback() {
  const t = useTranslations("appShell.centerStagePanels");

  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {t("loadingTerminal")}
        </span>
      </div>
    </div>
  );
}

const WikiTab = dynamic(
  () => import("@/features/wiki").then((m) => m.WikiTab),
  { ssr: false },
);

const ChangesCodeView = dynamic(
  () =>
    import("@/features/diff/components/ChangesCodeView").then((m) => m.ChangesCodeView),
  { ssr: false },
);
const DiffViewer = dynamic(
  () => import("@/features/diff/components/DiffViewer").then((m) => m.DiffViewer),
  { ssr: false },
);
const ReviewCodeView = dynamic(
  () => import("@/features/diff/components/ReviewCodeView").then((m) => m.ReviewCodeView),
  { ssr: false },
);

const GitConflictResolver = dynamic(
  () =>
    import("@/features/diff/components/GitConflictResolver").then(
      (m) => m.GitConflictResolver,
    ),
  { ssr: false },
);

const FileViewer = dynamic(() => import("@/features/editor/components/FileViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

const TerminalGrid = dynamic(
  () =>
    import("@/features/terminal/components/TerminalGrid").then(
      (mod) => mod.TerminalGrid,
    ),
  {
    ssr: false,
    loading: () => <TerminalGridLoadingFallback />,
  },
);

type TerminalQuickOpenAgent = {
  agent: TerminalPaneAgent;
  command: string;
};

interface CenterStagePanelsProps {
  activeValue: string;
  codeReviewTabVisible: boolean;
  codeReviewTerminalGridRef: React.RefObject<TerminalGridHandle | null>;
  currentBranch?: string | null;
  currentProject?: Project;
  currentRepoPath?: string | null;
  currentView: string;
  currentWorkspace?: Workspace;
  effectiveContextId: string;
  handleCreateTerminalCenterTab: () => void;
  handleTerminalPaneClosed: (event: {
    paneId: string;
    pane: TerminalPaneProps;
    terminalTabId: string;
    isLastPane: boolean;
  }) => void;

  openFiles: OpenFile[];
  projectWikiTabVisible: boolean;
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
  codeReviewTabVisible,
  codeReviewTerminalGridRef,
  currentBranch,
  currentProject,
  currentRepoPath,
  currentView,
  currentWorkspace,
  effectiveContextId,
  handleCreateTerminalCenterTab,
  handleTerminalPaneClosed,

  openFiles,
  projectWikiTabVisible,
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
  const cachedContexts = useTerminalCacheStore(s => s.cachedContexts);
  const allWorkspaceTerminalTabs = useTerminalStore(s => s.workspaceTerminalTabs);
  const workspaceContexts = useTerminalStore(s => s.workspaceContexts);

  const contextIdsToRender = Array.from(new Set([effectiveContextId, ...cachedContexts.map(c => c.contextId)])).filter(Boolean);

  return (
    <>
      {contextIdsToRender.map((contextId) => {
        const isActiveContext = contextId === effectiveContextId;
        const tabs = isActiveContext 
          ? visibleTerminalTabs 
          : (allWorkspaceTerminalTabs[contextId] || [{ id: FIXED_TERMINAL_TAB_VALUE, title: t("fallbackTerminalTitle"), closable: true }]);
        const mountedTabs = mountedTerminalTabsByContext[contextId] || [];
        const isProject = isActiveContext ? currentView === "project" : (workspaceContexts[contextId] ?? false);

        return (
          <React.Fragment key={contextId}>
            {tabs
              .filter((tab) => mountedTabs.includes(tab.id))
              .map((tab) => (
                <div
                  key={`${contextId}-${tab.id}`}
                  className={cn(
                    "flex-1 min-h-0 min-w-0",
                    (!isActiveContext || activeValue !== tab.id) && "hidden",
                  )}
                >
                  <div className="h-full w-full">
                    <TerminalGrid
                      ref={isActiveContext
                        ? (tab.id === FIXED_TERMINAL_TAB_VALUE
                            ? terminalGridRef
                            : (instance) => {
                                if (terminalGridRefs.current) {
                                  terminalGridRefs.current[tab.id] = instance;
                                }
                              })
                        : undefined
                      }
                      workspaceId={contextId}
                      terminalTabId={tab.id === FIXED_TERMINAL_TAB_VALUE ? undefined : tab.id}
                      quickOpenAgents={terminalQuickOpenAgents}
                      className="h-full"
                      isProjectContext={isProject}
                      onNewTerminalTab={isActiveContext ? handleCreateTerminalCenterTab : undefined}
                      onTerminalPaneClosed={isActiveContext ? handleTerminalPaneClosed : undefined}
                    />
                  </div>
                </div>
              ))}
          </React.Fragment>
        );
      })}

      {projectWikiTabVisible && (
        <div
          className={cn(
            "flex-1 min-h-0 min-w-0",
            activeValue !== "project-wiki" && "hidden",
          )}
        >
          <TerminalGrid
            ref={projectWikiTerminalGridRef}
            workspaceId={effectiveContextId}
            scope="project-wiki"
            toolbarActions={{ split: false, maximize: false, close: false }}
            className="h-full"
            onNewTerminalTab={handleCreateTerminalCenterTab}
          />
        </div>
      )}

      {codeReviewTabVisible && (
        <div
          className={cn(
            "flex-1 min-h-0 min-w-0",
            activeValue !== "code-review" && "hidden",
          )}
        >
          <TerminalGrid
            ref={codeReviewTerminalGridRef}
            workspaceId={effectiveContextId}
            scope="code-review"
            toolbarActions={{ split: false, maximize: false, close: false }}
            className="h-full"
            onNewTerminalTab={handleCreateTerminalCenterTab}
          />
        </div>
      )}

      <div
        className={cn(
          "flex-1 min-h-0 min-w-0 overflow-auto",
          activeValue !== "overview" && "hidden",
        )}
      >
        <OverviewTab
          contextId={effectiveContextId}
          projectId={currentProject?.id}
          projectName={currentProject?.name}
          projectPath={currentProject?.mainFilePath}
          workspaceName={currentWorkspace?.displayName ?? currentWorkspace?.name}
          workspacePath={currentWorkspace?.localPath}
          gitBranch={currentBranch ?? undefined}
          createdAt={currentWorkspace?.createdAt}
          isProjectOnly={!currentWorkspace}
          githubIssue={currentWorkspace?.githubIssue}
          priority={currentWorkspace?.priority}
          workflowStatus={currentWorkspace?.workflowStatus}
          labels={currentWorkspace?.labels}
          active={activeValue === "overview"}
        />
      </div>

      {wikiCenterEligible && (
        <div
          className={cn(
            "flex-1 min-h-0 min-w-0 overflow-hidden",
            activeValue !== "wiki" && "hidden",
          )}
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

      {openFiles.map((file) => (
        <TabsPanel
          key={file.path}
          value={file.path}
          keepMounted
          className="flex-1 min-h-0 min-w-0"
        >
          {isDiffGroupEditorPath(file.path) && currentRepoPath ? (
            <ChangesCodeView repoPath={currentRepoPath} groupPath={file.path} />
          ) : isReviewGroupEditorPath(file.path) ? (
            <ReviewContextProvider
              target={reviewTarget}
              filePath=""
              fileSnapshotGuid={null}
              revisionGuid={getReviewGroupRevisionGuid(file.path)}
            >
              <ReviewCodeView groupPath={file.path} />
            </ReviewContextProvider>
          ) : file.path.startsWith(EDITOR_REVIEW_DIFF_PREFIX) && currentRepoPath ? (
            <ReviewContextProvider
              target={reviewTarget}
              filePath={getEditorSourcePath(file.path)}
              fileSnapshotGuid={
                file.path.slice(EDITOR_REVIEW_DIFF_PREFIX.length).split("/")[0] ||
                null
              }
            >
              <DiffViewer
                repoPath={currentRepoPath}
                filePath={getEditorSourcePath(file.path)}
                originalPath={file.path}
              />
            </ReviewContextProvider>
          ) : isConflictResolveEditorPath(file.path) ? (
            <GitConflictResolver />
          ) : (
            <FileViewer
              file={file}
              className="flex-1"
              surfaceActive={activeValue === file.path}
            />
          )}
        </TabsPanel>
      ))}
    </>
  );
}
