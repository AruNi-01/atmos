"use client";

import React from "react";
import dynamic from "next/dynamic";
import { TerminalLine } from "@/types/types";
import {
  SquareTerminal as TerminalIcon,
  X,
  Code,
  GitCompare,
  Circle,
  Loader2,
  Tabs,
  TabsList,
  TabsTab,
  TabsPanel,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toastManager,
  getFileIconProps,
  LayoutDashboard,
} from "@workspace/ui";
import { cn } from "@/lib/utils";
import { useEditorStore, useEditorStoreHydration, OpenFile } from "@/hooks/use-editor-store";
import { useGitStore } from "@/hooks/use-git-store";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { Plus, Bot, Sparkles, Cpu, Zap, Brain } from "lucide-react";
import type { TerminalGridHandle } from "@/components/terminal/TerminalGrid";
import WelcomePage from "@/components/welcome/WelcomePage";
import { useSearchParams } from "next/navigation";
import { useDialogStore } from "@/hooks/use-dialog-store";
import { useProjectStore } from "@/hooks/use-project-store";
import { WorkspaceSetupProgressView } from "@/components/workspace/WorkspaceSetupProgress";
import { RecentWorkspacesView } from "@/components/workspace/RecentWorkspacesView";
import { ArchivedWorkspacesView } from "@/components/workspace/ArchivedWorkspacesView";
import { OverviewTab } from "@/components/workspace/OverviewTab";
import { WorkspacesManagementView } from "@/components/workspace/WorkspacesManagementView";
import { SkillsView } from "@/components/skills/SkillsView";
import { useGitInfoStore } from "@/hooks/use-git-info-store";

// Dynamic import Monaco Editor to avoid SSR issues
const FileViewer = dynamic(
  () => import("@/components/editor/FileViewer"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

// Dynamic import TerminalGrid to avoid SSR issues with xterm.js
const TerminalGrid = dynamic(
  () =>
    import("@/components/terminal/TerminalGrid").then(
      (mod) => mod.TerminalGrid
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading terminal...</span>
        </div>
      </div>
    ),
  }
);

// File icon component matching the file tree
function FileIcon({ name, className }: { name: string; className?: string }) {
  const iconProps = getFileIconProps({ name, isDir: false, className });
  return <img {...iconProps} />;
}

interface CenterStageProps {
  logs: TerminalLine[];
}

const CenterStage: React.FC<CenterStageProps> = ({ logs }) => {
  const [fileToClose, setFileToClose] = React.useState<OpenFile | null>(null);
  const [useRealTerminal, setUseRealTerminal] = React.useState(true);
  const [fixedTab, setFixedTab] = React.useState<"overview" | "terminal">("terminal");
  const terminalGridRef = React.useRef<TerminalGridHandle>(null);

  // Wait for editor store hydration to avoid SSR mismatch
  useEditorStoreHydration();

  const handleCloseFile = (file: OpenFile) => {
    if (file.isDirty) {
      setFileToClose(file);
    } else {
      closeFile(file.path);
    }
  };

  const confirmClose = () => {
    if (fileToClose) {
      closeFile(fileToClose.path);
      setFileToClose(null);
    }
  };

  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspaceId");
  const projectId = searchParams.get("projectId");
  const effectiveContextId = workspaceId || projectId;

  const {
    setWorkspaceId,
    getOpenFiles,
    getActiveFilePath,
    setActiveFile,
    closeFile,
    getActiveFile,
    pinFile,
  } = useEditorStore();
  const { setCreateProjectOpen } = useDialogStore();
  const { projects, setupProgress, clearSetupProgress } = useProjectStore();
  const { currentBranch } = useGitInfoStore();

  const currentSetupProgress = workspaceId ? setupProgress[workspaceId] : null;

  const handleFinishSetup = () => {
    if (workspaceId) {
      clearSetupProgress(workspaceId);
    }
  };

  // Sync effective context ID with store
  React.useEffect(() => {
    setWorkspaceId(effectiveContextId);
  }, [effectiveContextId, setWorkspaceId]);

  const openFiles = getOpenFiles(effectiveContextId || undefined);
  const activeFilePath = getActiveFilePath(effectiveContextId || undefined);

  // activeValue 优先使用打开的文件路径，否则使用 fixedTab
  const activeValue = activeFilePath || fixedTab;

  const handleAddAgent = (name: string) => {
    if (terminalGridRef.current) {
      // Switch to terminal tab if not active
      if (activeFilePath) {
        setActiveFile(null, effectiveContextId || undefined);
      }
      terminalGridRef.current.addTerminal(name);
    }
  };

  const activeFile = getActiveFile(effectiveContextId || undefined);
  const { currentRepoPath } = useGitStore();

  // Derive workspace and project info for OverviewTab
  const { currentProject, currentWorkspace } = (() => {
    if (!effectiveContextId) return { currentProject: undefined, currentWorkspace: undefined };
    
    for (const project of projects) {
      const workspace = project.workspaces.find(w => w.id === effectiveContextId);
      if (workspace) {
        return { currentProject: project, currentWorkspace: workspace };
      }
    }
    
    // If no workspace found, check if effectiveContextId is a projectId
    const project = projects.find(p => p.id === effectiveContextId);
    return { currentProject: project, currentWorkspace: undefined };
  })();

  const isRecentView = searchParams.get('view') === 'recent';
  const isArchivedView = searchParams.get('view') === 'archived';
  const isWorkspacesView = searchParams.get('view') === 'workspaces';
  const isSkillsView = searchParams.get('view') === 'skills';

  if (!effectiveContextId) {
    if (isRecentView || isArchivedView || isWorkspacesView) {
      return (
        <main className="h-full overflow-hidden">
          <WorkspacesManagementView />
        </main>
      );
    }
    if (isSkillsView) {
      return (
        <main className="h-full overflow-hidden">
          <SkillsView />
        </main>
      );
    }
    return (
      <main className="h-full overflow-hidden">
        <WelcomePage
          onAddProject={() => setCreateProjectOpen(true)}
          onCloneRemote={() => {
            // Placeholder for now
            toastManager.add({
              title: "Coming Soon",
              description: "Clone From Remote feature is under development",
              type: "info"
            });
          }}
        />
      </main>
    );
  }

  // Show setup progress if active workspace is being initialized
  if (currentSetupProgress) {
    return (
      <main className="h-full overflow-hidden bg-background">
        <WorkspaceSetupProgressView
          progress={currentSetupProgress}
          onFinish={handleFinishSetup}
        />
      </main>
    );
  }



  return (
    <main className="h-full flex flex-col overflow-hidden">
      <Tabs
        value={activeValue}
        onValueChange={(val) => {
          if (val === "terminal" || val === "overview") {
            setFixedTab(val);
            setActiveFile(null, effectiveContextId || undefined);
          } else {
            setActiveFile(val, effectiveContextId || undefined);
          }
        }}
        className="flex-1 flex flex-col gap-0 min-h-0 overflow-hidden"
      >
        {/* Top Tab Bar */}
        <TabsList
          variant="underline"
          className="h-10 w-full justify-start border-b border-sidebar-border px-0 bg-transparent overflow-x-auto no-scrollbar gap-0 items-stretch !py-0"
        >
          {/* Overview Tab - Fixed, shown when workspace/project is selected */}
          {effectiveContextId && (
            <TabsTab
              value="overview"
              className="!h-full pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none !border-0"
            >
              <LayoutDashboard className="size-3.5" />
              <span className="text-[13px] font-medium text-pretty">
                Overview
              </span>
            </TabsTab>
          )}

          <TabsTab
            value="terminal"
            className="relative !h-full pl-4 pr-8 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none !border-0"
          >
            <TerminalIcon className="size-3.5" />
            <span className="text-[13px] font-medium text-pretty">
              Terminal
            </span>

            {/* Code Agent Dropdown - Absolute positioning to not affect flex layout flow */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div
                  role="button"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-sm hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Plus className="size-3" />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onClick={() => handleAddAgent("Claude Code")}>
                  <Bot className="mr-2 size-4 text-purple-500" />
                  <span>Claude Code</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAddAgent("Codex")}>
                  <Cpu className="mr-2 size-4 text-blue-500" />
                  <span>Codex</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAddAgent("OpenCode")}>
                  <Sparkles className="mr-2 size-4 text-yellow-500" />
                  <span>OpenCode</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAddAgent("Droid")}>
                  <Zap className="mr-2 size-4 text-green-500" />
                  <span>Droid</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAddAgent("Amp")}>
                  <Brain className="mr-2 size-4 text-orange-500" />
                  <span>Amp</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TabsTab>




          {/* Open File Tabs */}
          {openFiles.map((file) => {
            const isDiff = file.path.startsWith("diff://");
            const displayPath = isDiff ? file.path.replace("diff://", "") : file.path;

            return (
              <Tooltip key={file.path}>
                <TooltipTrigger asChild>
                  <TabsTab
                    value={file.path}
                    className="!h-full pl-2 pr-1 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-1.5 group grow-0 shrink-0 justify-start rounded-none !border-0"
                    onDoubleClick={() => {
                      if (file.isPreview) {
                        pinFile(file.path, effectiveContextId || undefined);
                      }
                    }}
                  >
                    {isDiff ? (
                      <GitCompare className="size-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <FileIcon name={file.name} className="size-3.5 shrink-0" />
                    )}
                    <span
                      className={cn(
                        "text-[13px] font-medium whitespace-nowrap",
                        isDiff && "text-emerald-500",
                        file.isPreview && "italic"
                      )}
                    >
                      {file.name}
                    </span>
                    {/* Status Icons Slot (Dirty dot / Close button) */}
                    <div className="relative size-4 flex items-center justify-center shrink-0 ml-0">
                      {/* Dirty indicator: Shown when dirty, hidden on hover so X check can take over */}
                      {file.isDirty && (
                        <Circle className="size-1.5 fill-current text-muted-foreground group-hover:hidden" />
                      )}
                      {/* Close button: Absolutely positioned to not affect width, shown on hover */}
                      <span
                        role="button"
                        aria-label="Close tab"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseFile(file);
                        }}
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-muted-foreground/20 rounded-sm cursor-pointer transition-all ease-out duration-200"
                      >
                        <X className="size-3" />
                      </span>
                    </div>
                  </TabsTab>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-md break-all">
                  {displayPath}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TabsList>

        {/* Main Content Area - Panels are direct children of Tabs flex-col container */}
        {/* 
          Terminal is kept mounted and uses CSS visibility to avoid re-initialization.
          This prevents terminal sessions from restarting when switching tabs.
        */}
        <div
          className={cn(
            "flex-1 min-h-0 min-w-0",
            activeValue !== "terminal" && "hidden"
          )}
        >
          {useRealTerminal ? (
            /* Real xterm.js Terminal - Always mounted, visibility controlled by parent */
            <div className="h-full w-full">
              <TerminalGrid
                ref={terminalGridRef}
                workspaceId={effectiveContextId || ""}
                className="h-full"
              />
            </div>
          ) : (
            /* Fallback Mock Terminal View */
            <div className="flex-1 flex flex-col h-full bg-background">
              {/* Pane 1 */}
              <div className="flex-1 flex flex-col border-b border-sidebar-border">
                <div className="h-8 flex items-center justify-between px-3 bg-muted/30">
                  <span className="text-[11px] text-muted-foreground font-medium tabular-nums text-pretty">
                    Local: 3000 (Server)
                  </span>
                  <div className="flex space-x-2">
                    <div className="size-2 rounded-full bg-emerald-500"></div>
                  </div>
                </div>
                <div className="flex-1 p-4 font-mono text-[13px] overflow-y-auto no-scrollbar">
                  {logs.map((log) => (
                    <div key={log.id} className="mb-1 leading-relaxed break-all">
                      <span
                        className={cn(`
                                        ${log.type === "command" ? "text-muted-foreground" : ""}
                                        ${log.type === "success" ? "text-emerald-600 dark:text-emerald-400" : ""}
                                        ${log.type === "error" ? "text-rose-600 dark:text-rose-400" : ""}
                                        ${log.type === "info" ? "text-blue-600 dark:text-blue-300" : ""}
                                    `)}
                      >
                        {log.content}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Pane 2 */}
              <div className="flex-1 flex flex-col">
                <div className="h-8 flex items-center justify-between px-3 bg-muted/30">
                  <span className="text-[11px] text-muted-foreground font-medium text-pretty">
                    Build: Watch Mode
                  </span>
                </div>
                <div className="flex-1 p-4 font-mono text-[13px] text-muted-foreground overflow-y-auto no-scrollbar">
                  <div className="text-pretty"> build started...</div>
                  <div className="text-emerald-600 dark:text-emerald-500 tabular-nums text-pretty">
                    build completed in 420ms
                  </div>
                  <div className="flex items-center mt-2 animate-pulse">
                    <span className="text-muted-foreground mr-2">➜</span>
                    <span className="text-muted-foreground">_</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Overview Tab Content - CSS visibility controlled like terminal */}
        {effectiveContextId && (
          <div
            className={cn(
              "flex-1 min-h-0 min-w-0 overflow-auto",
              activeValue !== "overview" && "hidden"
            )}
          >
            <OverviewTab
              contextId={effectiveContextId}
              projectName={currentProject?.name}
              projectPath={currentProject?.mainFilePath}
              workspaceName={currentWorkspace?.name}
              workspacePath={currentWorkspace?.localPath}
              gitBranch={currentBranch ?? undefined}
              createdAt={currentWorkspace?.createdAt}
              isProjectOnly={!currentWorkspace}
            />
          </div>
        )}

        {openFiles.map((file) => (
          <TabsPanel
            key={file.path}
            value={file.path}
            className="flex-1 min-h-0 min-w-0"
          >
            {file.path.startsWith("diff://") && currentRepoPath ? (
              <DiffViewer
                repoPath={currentRepoPath}
                filePath={file.path.replace("diff://", "")}
              />
            ) : (
              <FileViewer file={file} className="flex-1" />
            )}
          </TabsPanel>
        ))}
      </Tabs>

      {/* Unsaved Changes Dialog */}
      <Dialog
        open={!!fileToClose}
        onOpenChange={(open) => !open && setFileToClose(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              &quot;{fileToClose?.name}&quot; has unsaved changes. Do you want to discard
              them?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileToClose(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmClose}>
              Discard Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default CenterStage;
