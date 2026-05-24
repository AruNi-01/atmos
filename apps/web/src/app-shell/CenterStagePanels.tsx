"use client";

import React from "react";
import dynamic from "next/dynamic";
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
import type { TerminalPaneAgent } from "@/features/terminal/types/index";
import type { Project, Workspace } from "@/shared/types/domain";

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
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Loading terminal...
          </span>
        </div>
      </div>
    ),
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
  mountedTerminalTabs: string[];
  openFiles: OpenFile[];
  projectWikiTabVisible: boolean;
  projectWikiTerminalGridRef: React.RefObject<TerminalGridHandle | null>;
  projectWikiUserTriggeredRef: React.RefObject<boolean>;
  reviewTarget: ReviewTarget | null;
  setFixedTab: (tab: FixedTab) => void;
  setProjectWikiPendingCommand: React.Dispatch<React.SetStateAction<string | null>>;
  setProjectWikiVisibleMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setWikiPage: (page: string) => void;
  terminalGridRef: React.RefObject<TerminalGridHandle | null>;
  terminalGridRefs: React.RefObject<Record<string, TerminalGridHandle | null>>;
  terminalQuickOpenAgents: TerminalQuickOpenAgent[];
  visibleTerminalTabs: TerminalCenterTab[];
  wikiCenterEligible: boolean;
  wikiPageFromUrl?: string | null;
  wikiRefreshTrigger: number;
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
  mountedTerminalTabs,
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
}: CenterStagePanelsProps) {
  return (
    <>
      {mountedTerminalTabs.includes(FIXED_TERMINAL_TAB_VALUE) && (
        <div
          className={cn(
            "flex-1 min-h-0 min-w-0",
            activeValue !== FIXED_TERMINAL_TAB_VALUE && "hidden",
          )}
        >
          <div className="h-full w-full">
            <TerminalGrid
              ref={terminalGridRef}
              workspaceId={effectiveContextId}
              quickOpenAgents={terminalQuickOpenAgents}
              className="h-full"
              isProjectContext={currentView === "project"}
              onNewTerminalTab={handleCreateTerminalCenterTab}
            />
          </div>
        </div>
      )}

      {visibleTerminalTabs
        .filter(
          (tab) =>
            tab.id !== FIXED_TERMINAL_TAB_VALUE &&
            mountedTerminalTabs.includes(tab.id),
        )
        .map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "flex-1 min-h-0 min-w-0",
              activeValue !== tab.id && "hidden",
            )}
          >
            <div className="h-full w-full">
              <TerminalGrid
                ref={(instance) => {
                  terminalGridRefs.current[tab.id] = instance;
                }}
                workspaceId={effectiveContextId}
                terminalTabId={tab.id}
                quickOpenAgents={terminalQuickOpenAgents}
                className="h-full"
                isProjectContext={currentView === "project"}
                onNewTerminalTab={handleCreateTerminalCenterTab}
              />
            </div>
          </div>
        ))}

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
            onSwitchToProjectWikiAndRun={(command) => {
              projectWikiUserTriggeredRef.current = true;
              setProjectWikiPendingCommand(command);
              setProjectWikiVisibleMap((prev) => ({
                ...prev,
                [effectiveContextId]: true,
              }));
              setFixedTab("project-wiki");
            }}
            onProjectWikiReplaceAndRun={async (command) => {
              try {
                await systemApi.killProjectWikiWindow(effectiveContextId);
                projectWikiTerminalGridRef.current?.removeTerminalByTmuxWindowName(
                  PROJECT_WIKI_WINDOW_NAME,
                );
                projectWikiUserTriggeredRef.current = true;
                setProjectWikiPendingCommand(command);
                setProjectWikiVisibleMap((prev) => ({
                  ...prev,
                  [effectiveContextId]: true,
                }));
                setFixedTab("project-wiki");
                toastManager.add({
                  title: "Wiki generation started",
                  description: "Switched to Project Wiki tab. Check progress there.",
                  type: "info",
                });
              } catch (err) {
                setProjectWikiPendingCommand(null);
                toastManager.add({
                  title: "Failed to close previous terminal",
                  description: err instanceof Error ? err.message : "Unknown error",
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
