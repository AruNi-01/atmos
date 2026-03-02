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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toastManager,
  getFileIconProps,
  LayoutDashboard,
} from "@workspace/ui";
import { cn } from "@/lib/utils";
import { useEditorStore, useEditorStoreHydration, OpenFile } from "@/hooks/use-editor-store";
import { useGitStore } from "@/hooks/use-git-store";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { Plus, BookOpen, RefreshCw, Star } from "lucide-react";
import { AGENT_OPTIONS, type AgentId } from "@/components/wiki/AgentSelect";
import { AgentIcon } from "@/components/agent/AgentIcon";
import { functionSettingsApi } from "@/api/ws-api";
import type { TerminalGridHandle } from "@/components/terminal/TerminalGrid";
import WelcomePage from "@/components/welcome/WelcomePage";
import { useQueryStates } from "nuqs";
import { centerStageParams } from "@/lib/nuqs/searchParams";
import type { FixedTab } from "@/lib/nuqs/searchParams";
import { useContextParams } from "@/hooks/use-context-params";
import { useDialogStore } from "@/hooks/use-dialog-store";
import { useProjectStore } from "@/hooks/use-project-store";
import { WorkspaceSetupProgressView } from "@/components/workspace/WorkspaceSetupProgress";
import { RecentWorkspacesView } from "@/components/workspace/RecentWorkspacesView";
import { ArchivedWorkspacesView } from "@/components/workspace/ArchivedWorkspacesView";
import { OverviewTab } from "@/components/workspace/OverviewTab";
import { WorkspacesManagementView } from "@/components/workspace/WorkspacesManagementView";
import { SkillsView } from "@/components/skills/SkillsView";
import { TerminalManagerView } from "@/components/terminal/TerminalManagerView";
import { AgentManagerView } from "@/components/agent/AgentManagerView";
import { useGitInfoStore } from "@/hooks/use-git-info-store";
import { WikiTab } from "@/components/wiki";
import { systemApi } from "@/api/rest-api";
import { PROJECT_WIKI_WINDOW_NAME, CODE_REVIEW_WINDOW_NAME } from "@/hooks/use-terminal-store";
import { CodeReviewDialog } from "@/components/code-review";

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

const FIXED_TABS = new Set<string>(["overview", "terminal", "wiki", "project-wiki", "code-review"]);
const LAST_ACTIVE_TAB_STORAGE_KEY = "atmos-last-active-tab-by-context";

function getRelativePath(path: string, basePath?: string): string {
  if (!basePath) return path;
  if (path === basePath) return ".";
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return path.startsWith(normalizedBase) ? path.slice(normalizedBase.length) : path;
}

const CenterStage: React.FC<CenterStageProps> = ({ logs }) => {
  const [fileToClose, setFileToClose] = React.useState<OpenFile | null>(null);
  const [useRealTerminal, setUseRealTerminal] = React.useState(true);
  const terminalGridRef = React.useRef<TerminalGridHandle>(null);
  const scrollableTabsRef = React.useRef<HTMLDivElement>(null);
  const terminalLabelRef = React.useRef<HTMLSpanElement>(null);
  const reloadingFilesRef = React.useRef<Set<string>>(new Set());
  const projectWikiTerminalGridRef = React.useRef<TerminalGridHandle>(null);
  const [projectWikiVisibleMap, setProjectWikiVisibleMap] = React.useState<Record<string, boolean>>({});
  const [projectWikiPendingCommand, setProjectWikiPendingCommand] = React.useState<string | null>(null);
  /** When user triggers wiki gen from Wiki tab, skip check overwriting projectWikiTabVisible (avoids race) */
  const projectWikiUserTriggeredRef = React.useRef(false);
  const [projectWikiCloseConfirmOpen, setProjectWikiCloseConfirmOpen] = React.useState(false);
  const [wikiRefreshTrigger, setWikiRefreshTrigger] = React.useState(0);
  const [wikiRefreshing, setWikiRefreshing] = React.useState(false);
  const [tabContextMenu, setTabContextMenu] = React.useState<{
    x: number;
    y: number;
    filePath: string;
  } | null>(null);

  // Agent dropdown state
  const [agentDropdownOpen, setAgentDropdownOpen] = React.useState(false);
  const [defaultAgentId, setDefaultAgentId] = React.useState<AgentId>("claude");
  const agentDropdownTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Code Review tab state
  const codeReviewTerminalGridRef = React.useRef<TerminalGridHandle>(null);
  const [codeReviewVisibleMap, setCodeReviewVisibleMap] = React.useState<Record<string, boolean>>({});
  const [codeReviewPendingCommand, setCodeReviewPendingCommand] = React.useState<string | null>(null);
  const codeReviewUserTriggeredRef = React.useRef(false);
  const [codeReviewCloseConfirmOpen, setCodeReviewCloseConfirmOpen] = React.useState(false);
  // codeReviewDialogOpen is managed via useDialogStore for cross-component access

  // Wait for editor store hydration to avoid SSR mismatch
  useEditorStoreHydration();

  const { workspaceId, projectId, effectiveContextId, currentView } = useContextParams();

  // Derive per-workspace visibility (default false for unseen workspaces)
  const projectWikiTabVisible = effectiveContextId ? (projectWikiVisibleMap[effectiveContextId] ?? false) : false;
  const codeReviewTabVisible = effectiveContextId ? (codeReviewVisibleMap[effectiveContextId] ?? false) : false;

  // --- URL-synced tab state ---
  const [{ tab: tabFromUrl, wikiPage: wikiPageFromUrl }, setUrlParams] = useQueryStates(centerStageParams);

  const fixedTab: FixedTab = React.useMemo(() => {
    if (tabFromUrl === "project-wiki" && !projectWikiTabVisible) return "terminal";
    if (tabFromUrl === "code-review" && !codeReviewTabVisible) return "terminal";
    return tabFromUrl;
  }, [tabFromUrl, projectWikiTabVisible, codeReviewTabVisible]);

  const setFixedTab = React.useCallback(
    (tab: FixedTab) => {
      if (tab === fixedTab) return;
      const updates: Parameters<typeof setUrlParams>[0] = { tab };
      // Clear wikiPage when leaving wiki tab
      if (tab !== "wiki") {
        updates.wikiPage = null;
      }
      setUrlParams(updates);
    },
    [fixedTab, setUrlParams]
  );

  const setWikiPage = React.useCallback(
    (page: string) => {
      setUrlParams({ tab: "wiki" as const, wikiPage: page });
    },
    [setUrlParams]
  );

  // Check Project Wiki window on mount and when workspace changes. Redirect to terminal only when window doesn't exist.
  // Intentionally NOT depending on tabFromUrl: when user triggers wiki gen from Wiki tab, we switch to project-wiki
  // and the window doesn't exist yet — re-running the check would overwrite projectWikiTabVisible and redirect away.
  React.useEffect(() => {
    if (!effectiveContextId) return;
    const ctxId = effectiveContextId;
    systemApi.checkProjectWikiWindow(ctxId).then(
      ({ exists }) => {
        if (projectWikiUserTriggeredRef.current) return; // User just triggered wiki gen, don't overwrite
        setProjectWikiVisibleMap(prev => ({ ...prev, [ctxId]: exists }));
        if (tabFromUrl === "project-wiki" && !exists) {
          setUrlParams({ tab: "terminal" });
        }
      },
      () => {
        if (projectWikiUserTriggeredRef.current) return;
        setProjectWikiVisibleMap(prev => ({ ...prev, [ctxId]: false }));
        if (tabFromUrl === "project-wiki") {
          setUrlParams({ tab: "terminal" });
        }
      }
    );
  }, [effectiveContextId]); // eslint-disable-line react-hooks/exhaustive-deps -- tabFromUrl/setUrlParams in callback; exclude tabFromUrl to avoid race when user switches to project-wiki

  // Check Code Review window on mount and when workspace changes.
  React.useEffect(() => {
    if (!effectiveContextId) return;
    const ctxId = effectiveContextId;
    systemApi.checkCodeReviewWindow(ctxId).then(
      ({ exists }) => {
        if (codeReviewUserTriggeredRef.current) return;
        setCodeReviewVisibleMap(prev => ({ ...prev, [ctxId]: exists }));
        if (tabFromUrl === "code-review" && !exists) {
          setUrlParams({ tab: "terminal" });
        }
      },
      () => {
        if (codeReviewUserTriggeredRef.current) return;
        setCodeReviewVisibleMap(prev => ({ ...prev, [ctxId]: false }));
        if (tabFromUrl === "code-review") {
          setUrlParams({ tab: "terminal" });
        }
      }
    );
  }, [effectiveContextId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const {
    setWorkspaceId,
    getOpenFiles,
    getActiveFilePath,
    setActiveFile,
    closeFile,
    getActiveFile,
    pinFile,
    reloadFileContent,
  } = useEditorStore();
  const { setCreateProjectOpen, isCodeReviewDialogOpen, setCodeReviewDialogOpen } = useDialogStore();
  const { projects, setupProgress, clearSetupProgress } = useProjectStore();
  const { currentBranch } = useGitInfoStore();

  const currentSetupProgress = workspaceId ? setupProgress[workspaceId] : null;

  const closeFilesSafely = (files: OpenFile[]) => {
    if (files.length === 0) return;
    const closable = files.filter((f) => !f.isDirty);
    const dirtyCount = files.length - closable.length;

    for (const file of closable) {
      closeFile(file.path, effectiveContextId || undefined);
    }

    if (dirtyCount > 0) {
      toastManager.add({
        title: "Skipped unsaved tabs",
        description: `${dirtyCount} tab(s) have unsaved changes and were not closed.`,
        type: "warning",
      });
    }
  };

  const copyToClipboard = async (value: string, successTitle: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toastManager.add({ title: successTitle, type: "success" });
    } catch {
      toastManager.add({
        title: "Copy failed",
        description: "Clipboard is not available.",
        type: "error",
      });
    }
  };

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

  React.useEffect(() => {
    if (!effectiveContextId) return;
    for (const file of openFiles) {
      if (!file.isLoading) continue;
      const key = `${effectiveContextId}:${file.path}`;
      if (reloadingFilesRef.current.has(key)) continue;
      reloadingFilesRef.current.add(key);
      reloadFileContent(file.path, effectiveContextId)
        .finally(() => {
          reloadingFilesRef.current.delete(key);
        });
    }
  }, [effectiveContextId, openFiles, reloadFileContent]);

  React.useEffect(() => {
    const container = scrollableTabsRef.current;
    if (!container) return;

    const applyScrollStyle = () => {
      const ratio = Math.min(container.scrollLeft / 64, 1);
      const label = terminalLabelRef.current;
      if (!label) return;
      label.style.opacity = `${1 - ratio}`;
      label.style.maxWidth = `${72 * (1 - ratio)}px`;
      label.style.marginLeft = `${10 * (1 - ratio)}px`;
    };

    const handleScroll = () => {
      applyScrollStyle();
    };

    applyScrollStyle();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [effectiveContextId, openFiles.length, projectWikiTabVisible, codeReviewTabVisible]);

  React.useEffect(() => {
    if (!effectiveContextId || !activeValue) return;
    try {
      const raw = sessionStorage.getItem(LAST_ACTIVE_TAB_STORAGE_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      map[effectiveContextId] = activeValue;
      sessionStorage.setItem(LAST_ACTIVE_TAB_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // ignore storage errors
    }
  }, [effectiveContextId, activeValue]);

  React.useEffect(() => {
    if (!effectiveContextId || activeFilePath) return;
    try {
      const raw = sessionStorage.getItem(LAST_ACTIVE_TAB_STORAGE_KEY);
      if (!raw) return;
      const map = JSON.parse(raw) as Record<string, string>;
      const last = map[effectiveContextId];
      if (!last || last === activeValue) return;
      if (FIXED_TABS.has(last)) {
        setFixedTab(last as FixedTab);
        return;
      }
      const exists = openFiles.some((f) => f.path === last);
      if (exists) {
        setActiveFile(last, effectiveContextId);
      }
    } catch {
      // ignore storage errors
    }
  }, [effectiveContextId, activeFilePath, activeValue, openFiles, setActiveFile, setFixedTab]);

  // Auto-scroll active tab into view when it changes or context/tabs are restored
  React.useEffect(() => {
    const container = scrollableTabsRef.current;
    if (!activeValue || !container) return;
    if (FIXED_TABS.has(activeValue)) return;

    const timer = setTimeout(() => {
      const current = scrollableTabsRef.current;
      if (!current) return;
      const activeTab = current.querySelector<HTMLElement>('[data-active], [aria-selected="true"]');
      if (activeTab) {
        const containerRect = current.getBoundingClientRect();
        const tabRect = activeTab.getBoundingClientRect();
        const isVisible = tabRect.left >= containerRect.left && tabRect.right <= containerRect.right;
        if (!isVisible) {
          activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [activeValue, effectiveContextId, openFiles.length, projectWikiTabVisible, codeReviewTabVisible]);

  // Run pending wiki command when Project Wiki tab is active and grid is ready
  React.useEffect(() => {
    if (!projectWikiPendingCommand || !effectiveContextId || !projectWikiTabVisible || activeValue !== "project-wiki")
      return;
    const cmd = projectWikiPendingCommand;
    setProjectWikiPendingCommand(null);
    projectWikiTerminalGridRef.current?.createOrFocusAndRunTerminal({
      title: PROJECT_WIKI_WINDOW_NAME,
      command: cmd,
    });
    // Clear user-triggered ref after delay so check result can apply for future navigations
    const t = setTimeout(() => {
      projectWikiUserTriggeredRef.current = false;
    }, 3000);
    return () => clearTimeout(t);
  }, [projectWikiPendingCommand, effectiveContextId, projectWikiTabVisible, activeValue]);

  // Run pending code review command when Code Review tab is active and grid is ready
  React.useEffect(() => {
    if (!codeReviewPendingCommand || !effectiveContextId || !codeReviewTabVisible || activeValue !== "code-review")
      return;
    const cmd = codeReviewPendingCommand;
    setCodeReviewPendingCommand(null);
    codeReviewTerminalGridRef.current?.createOrFocusAndRunTerminal({
      title: CODE_REVIEW_WINDOW_NAME,
      command: cmd,
    });
    const t = setTimeout(() => {
      codeReviewUserTriggeredRef.current = false;
    }, 3000);
    return () => clearTimeout(t);
  }, [codeReviewPendingCommand, effectiveContextId, codeReviewTabVisible, activeValue]);

  const handleAddAgent = (name: string) => {
    if (terminalGridRef.current) {
      // Switch to terminal tab if not active
      if (activeFilePath) {
        setActiveFile(null, effectiveContextId || undefined);
      }
      terminalGridRef.current.addTerminal(name);
    }
  };

  // Load default agent from function_settings
  React.useEffect(() => {
    functionSettingsApi.get().then((settings) => {
      const saved = (settings as Record<string, unknown>)?.agent_cli as Record<string, unknown> | undefined;
      const agentId = saved?.center_fix_terminal_default_agent as string | undefined;
      if (agentId && AGENT_OPTIONS.some((a) => a.id === agentId)) {
        setDefaultAgentId(agentId as AgentId);
      }
    }).catch(() => {});
  }, []);

  const handleSetDefaultAgent = (agentId: AgentId) => {
    setDefaultAgentId(agentId);
    functionSettingsApi.update("agent_cli", "center_fix_terminal_default_agent", agentId).catch(() => {});
  };

  const handleQuickAddDefaultAgent = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const agent = AGENT_OPTIONS.find((a) => a.id === defaultAgentId);
    if (agent) handleAddAgent(agent.label);
    setAgentDropdownOpen(false);
  };

  const handleAgentDropdownEnter = () => {
    if (agentDropdownTimeoutRef.current) {
      clearTimeout(agentDropdownTimeoutRef.current);
    }
    setAgentDropdownOpen(true);
  };

  const handleAgentDropdownLeave = () => {
    agentDropdownTimeoutRef.current = setTimeout(() => {
      setAgentDropdownOpen(false);
    }, 150);
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

  if (!effectiveContextId) {
    if (currentView === "workspaces") {
      return (
        <main className="h-full overflow-hidden">
          <WorkspacesManagementView />
        </main>
      );
    }
    if (currentView === "skills") {
      return (
        <main className="h-full overflow-hidden">
          <SkillsView />
        </main>
      );
    }
    if (currentView === "terminals") {
      return (
        <main className="h-full overflow-hidden">
          <TerminalManagerView />
        </main>
      );
    }
    if (currentView === "agents") {
      return (
        <main className="h-full overflow-hidden">
          <AgentManagerView />
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
          if (FIXED_TABS.has(val)) {
            setFixedTab(val as FixedTab);
            setActiveFile(null, effectiveContextId || undefined);
          } else {
            setActiveFile(val, effectiveContextId || undefined);
            // Clear tab param when opening a file
            setUrlParams({ tab: null, wikiPage: null });
          }
        }}
        className="flex-1 flex flex-col gap-0 min-h-0 overflow-hidden"
      >
        {/* Top Tab Bar */}
        <TabsList
          variant="underline"
          className="h-10 w-full justify-start border-b border-sidebar-border px-0 bg-transparent overflow-hidden gap-0 items-stretch py-0! [&_[data-slot=tab-indicator]]:hidden"
        >
          {/* Overview Tab - Fixed, shown when workspace/project is selected */}
          {effectiveContextId && (
            <TabsTab
              value="overview"
              className="h-full! pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none border-0!"
            >
              <LayoutDashboard className="size-3.5" />
            </TabsTab>
          )}
          {effectiveContextId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTab
                  value="wiki"
                  className="group/wiki relative h-full! pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none border-0!"
                >
                  <span className="relative size-3.5">
                    <BookOpen
                      className={cn(
                        "size-3.5 absolute inset-0 transition-all duration-200",
                        activeValue === "wiki"
                          ? "group-hover/wiki:opacity-0 group-hover/wiki:scale-50 group-hover/wiki:rotate-[-30deg]"
                          : ""
                      )}
                    />
                    {activeValue === "wiki" && (
                      <RefreshCw
                        className={cn(
                          "size-3.5 absolute inset-0 transition-all duration-200",
                          "opacity-0 scale-50 rotate-60",
                          "group-hover/wiki:opacity-100 group-hover/wiki:scale-100 group-hover/wiki:rotate-0",
                          wikiRefreshing && "animate-spin"
                        )}
                      />
                    )}
                  </span>
                  {activeValue === "wiki" && (
                    <span
                      role="button"
                      aria-label="Refresh Wiki"
                      className="absolute inset-0 opacity-0 group-hover/wiki:opacity-100 pointer-events-none group-hover/wiki:pointer-events-auto cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setWikiRefreshing(true);
                        setWikiRefreshTrigger((k) => k + 1);
                        setTimeout(() => setWikiRefreshing(false), 600);
                      }}
                    />
                  )}
                </TabsTab>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {activeValue === "wiki" ? "Refresh Wiki" : "Project Wiki"}
              </TooltipContent>
            </Tooltip>
          )}

          <TabsTab
            value="terminal"
            className="group/terminal relative h-full! pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-0 grow-0 shrink-0 justify-start rounded-none border-0!"
          >
            <span className="relative size-3.5 shrink-0">
              <TerminalIcon
                className={cn(
                  "size-3.5 absolute inset-0 transition-all duration-200",
                  activeValue === "terminal"
                    ? "group-hover/terminal:opacity-0 group-hover/terminal:scale-50 group-hover/terminal:rotate-[-20deg]"
                    : ""
                )}
              />
            </span>
            <span
              ref={terminalLabelRef}
              className="text-[13px] font-medium text-pretty whitespace-nowrap origin-left"
              style={{
                opacity: 1,
                maxWidth: "72px",
                marginLeft: "10px",
                overflow: "hidden",
              }}
            >
              Terminal
            </span>

            <DropdownMenu open={agentDropdownOpen} onOpenChange={(open) => { if (!open) setAgentDropdownOpen(false); }} modal={false}>
              <DropdownMenuTrigger asChild>
                <div
                  role="button"
                  className={cn(
                    "absolute left-[13px] top-1/2 -translate-y-1/2 size-5 flex items-center justify-center rounded-sm hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-all",
                    activeValue === "terminal"
                      ? "opacity-0 scale-50 rotate-60 pointer-events-none group-hover/terminal:opacity-100 group-hover/terminal:scale-100 group-hover/terminal:rotate-0 group-hover/terminal:pointer-events-auto"
                      : "hidden"
                  )}
                  onClick={handleQuickAddDefaultAgent}
                  onMouseEnter={handleAgentDropdownEnter}
                  onMouseLeave={handleAgentDropdownLeave}
                >
                  <Plus className="size-4" />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-56"
                onMouseEnter={handleAgentDropdownEnter}
                onMouseLeave={handleAgentDropdownLeave}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                {AGENT_OPTIONS.map((opt) => (
                  <DropdownMenuItem key={opt.id} className="group/agent-item flex items-center" onClick={() => { handleAddAgent(opt.label); setAgentDropdownOpen(false); }}>
                    <AgentIcon registryId={opt.id} name={opt.label} size={16} />
                    <span className="flex-1">{opt.label}</span>
                    <button
                      className={cn(
                        "size-5 flex items-center justify-center rounded-sm shrink-0 transition-opacity",
                        defaultAgentId === opt.id
                          ? "opacity-100"
                          : "opacity-0 group-hover/agent-item:opacity-100 hover:bg-muted-foreground/20"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetDefaultAgent(opt.id);
                      }}
                    >
                      <Star className={cn("size-3.5", defaultAgentId === opt.id ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground")} />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </TabsTab>

          <div ref={scrollableTabsRef} className="flex min-w-0 flex-1 overflow-x-auto no-scrollbar">

          {/* Project Wiki Tab - shown when wiki gen runs or tmux window exists */}
          {effectiveContextId && projectWikiTabVisible && (
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTab
                  value="project-wiki"
                  className="group/pw !h-full pl-4 pr-1 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none !border-0"
                >
                  <TerminalIcon className="size-3.5 shrink-0" />
                  <span className="text-[13px] font-medium text-pretty">Project Wiki</span>
                  <span
                    role="button"
                    aria-label="Close Project Wiki tab"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjectWikiCloseConfirmOpen(true);
                    }}
                    className="size-4 flex items-center justify-center shrink-0 ml-0 rounded-sm opacity-0 group-hover/pw:opacity-100 hover:bg-muted-foreground/20 cursor-pointer transition-all ease-out duration-200"
                  >
                    <X className="size-3" />
                  </span>
                </TabsTab>
              </TooltipTrigger>
              <TooltipContent side="bottom">Project Wiki Terminal</TooltipContent>
            </Tooltip>
          )}

          {/* Code Review Tab - shown when code review runs or tmux window exists */}
          {effectiveContextId && codeReviewTabVisible && (
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTab
                  value="code-review"
                  className="group/cr !h-full pl-4 pr-1 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none !border-0"
                >
                  <TerminalIcon className="size-3.5 shrink-0 text-blue-500" />
                  <span className="text-[13px] font-medium text-pretty">Code Review</span>
                  <span
                    role="button"
                    aria-label="Close Code Review tab"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCodeReviewCloseConfirmOpen(true);
                    }}
                    className="size-4 flex items-center justify-center shrink-0 ml-0 rounded-sm opacity-0 group-hover/cr:opacity-100 hover:bg-muted-foreground/20 cursor-pointer transition-all ease-out duration-200"
                  >
                    <X className="size-3" />
                  </span>
                </TabsTab>
              </TooltipTrigger>
              <TooltipContent side="bottom">Code Review Terminal</TooltipContent>
            </Tooltip>
          )}

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
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveFile(file.path, effectiveContextId || undefined);
                      setTabContextMenu({ x: e.clientX, y: e.clientY, filePath: file.path });
                    }}
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
          </div>
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

        {/* Project Wiki Tab Content - Same TerminalGrid/Mosaic UI, separate panes from main Terminal */}
        {effectiveContextId && projectWikiTabVisible && (
          <div
            className={cn(
              "flex-1 min-h-0 min-w-0",
              activeValue !== "project-wiki" && "hidden"
            )}
          >
            <TerminalGrid
              ref={projectWikiTerminalGridRef}
              workspaceId={effectiveContextId}
              scope="project-wiki"
              toolbarActions={{ split: false, maximize: false, close: false }}
              className="h-full"
            />
          </div>
        )}

        {/* Code Review Tab Content - Same TerminalGrid/Mosaic UI, separate panes from main Terminal */}
        {effectiveContextId && codeReviewTabVisible && (
          <div
            className={cn(
              "flex-1 min-h-0 min-w-0",
              activeValue !== "code-review" && "hidden"
            )}
          >
            <TerminalGrid
              ref={codeReviewTerminalGridRef}
              workspaceId={effectiveContextId}
              scope="code-review"
              toolbarActions={{ split: false, maximize: false, close: false }}
              className="h-full"
            />
          </div>
        )}

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

        {/* Wiki Tab Content */}
        {effectiveContextId && (
          <div
            className={cn(
              "flex-1 min-h-0 min-w-0 overflow-hidden",
              activeValue !== "wiki" && "hidden"
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
                if (!effectiveContextId) return;
                projectWikiUserTriggeredRef.current = true;
                setProjectWikiPendingCommand(command);
                setProjectWikiVisibleMap(prev => ({ ...prev, [effectiveContextId]: true }));
                setFixedTab("project-wiki");
              }}
              onProjectWikiReplaceAndRun={async (command) => {
                if (!effectiveContextId) return;
                try {
                  await systemApi.killProjectWikiWindow(effectiveContextId);
                  projectWikiTerminalGridRef.current?.removeTerminalByTmuxWindowName(PROJECT_WIKI_WINDOW_NAME);
                  projectWikiUserTriggeredRef.current = true;
                  setProjectWikiPendingCommand(command);
                  setProjectWikiVisibleMap(prev => ({ ...prev, [effectiveContextId]: true }));
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

      <DropdownMenu
        open={!!tabContextMenu}
        onOpenChange={(open) => {
          if (!open) setTabContextMenu(null);
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-hidden
            className="fixed size-0 pointer-events-none"
            style={{
              left: tabContextMenu?.x ?? -9999,
              top: tabContextMenu?.y ?? -9999,
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4} className="w-52">
          {(() => {
            const target = openFiles.find((f) => f.path === tabContextMenu?.filePath);
            if (!target) return null;
            const targetIndex = openFiles.findIndex((f) => f.path === target.path);
            const leftFiles = openFiles.slice(0, targetIndex);
            const rightFiles = openFiles.slice(targetIndex + 1);
            const basePath = currentWorkspace?.localPath || currentProject?.mainFilePath;
            const relativePath = getRelativePath(target.path, basePath);

            return (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    handleCloseFile(target);
                    setTabContextMenu(null);
                  }}
                >
                  Close
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    closeFilesSafely(openFiles.filter((f) => f.path !== target.path));
                    setTabContextMenu(null);
                  }}
                  disabled={openFiles.length <= 1}
                >
                  Close Others
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    closeFilesSafely(leftFiles);
                    setTabContextMenu(null);
                  }}
                  disabled={leftFiles.length === 0}
                >
                  Close All Left
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    closeFilesSafely(rightFiles);
                    setTabContextMenu(null);
                  }}
                  disabled={rightFiles.length === 0}
                >
                  Close All Right
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    closeFilesSafely(openFiles);
                    setTabContextMenu(null);
                  }}
                  disabled={openFiles.length === 0}
                >
                  Close All
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await copyToClipboard(target.path, "Path copied");
                    setTabContextMenu(null);
                  }}
                >
                  Copy Path
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await copyToClipboard(relativePath, "Relative path copied");
                    setTabContextMenu(null);
                  }}
                >
                  Copy Relative Path
                </DropdownMenuItem>
              </>
            );
          })()}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Project Wiki Tab Close Confirmation */}
      <Dialog open={projectWikiCloseConfirmOpen} onOpenChange={(open) => !open && setProjectWikiCloseConfirmOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Project Wiki terminal?</DialogTitle>
            <DialogDescription>
              Any running wiki generation will be stopped. You can start a new generation from the Wiki tab.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-4">
            <Button variant="outline" className="cursor-pointer" onClick={() => setProjectWikiCloseConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              onClick={async () => {
                if (effectiveContextId) {
                  try {
                    await systemApi.killProjectWikiWindow(effectiveContextId);
                    projectWikiTerminalGridRef.current?.removeTerminalByTmuxWindowName(PROJECT_WIKI_WINDOW_NAME);
                    setProjectWikiVisibleMap(prev => ({ ...prev, [effectiveContextId]: false }));
                    setFixedTab("terminal");
                  } catch (err) {
                    toastManager.add({
                      title: "Failed to close terminal",
                      description: err instanceof Error ? err.message : "Unknown error",
                      type: "error",
                    });
                  }
                }
                setProjectWikiCloseConfirmOpen(false);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Code Review Close Confirm Dialog */}
      <Dialog open={codeReviewCloseConfirmOpen} onOpenChange={(open) => !open && setCodeReviewCloseConfirmOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Code Review terminal?</DialogTitle>
            <DialogDescription>
              Any running code review will be stopped. You can start a new review from the Changes panel.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-4">
            <Button variant="outline" className="cursor-pointer" onClick={() => setCodeReviewCloseConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              onClick={async () => {
                if (effectiveContextId) {
                  try {
                    await systemApi.killCodeReviewWindow(effectiveContextId);
                    codeReviewTerminalGridRef.current?.removeTerminalByTmuxWindowName(CODE_REVIEW_WINDOW_NAME);
                    setCodeReviewVisibleMap(prev => ({ ...prev, [effectiveContextId]: false }));
                    setFixedTab("terminal");
                  } catch (err) {
                    toastManager.add({
                      title: "Failed to close terminal",
                      description: err instanceof Error ? err.message : "Unknown error",
                      type: "error",
                    });
                  }
                }
                setCodeReviewCloseConfirmOpen(false);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Code Review Dialog */}
      {effectiveContextId && (
        <CodeReviewDialog
          open={isCodeReviewDialogOpen}
          onOpenChange={setCodeReviewDialogOpen}
          workspaceId={effectiveContextId}
          projectName={currentProject?.name}
          workspacePath={currentWorkspace?.localPath || currentProject?.mainFilePath || ""}
          projectMainPath={currentProject?.mainFilePath}
          currentBranch={currentBranch ?? undefined}
          onStartTerminalMode={(command) => {
            if (!effectiveContextId) return;
            codeReviewUserTriggeredRef.current = true;
            setCodeReviewPendingCommand(command);
            setCodeReviewVisibleMap(prev => ({ ...prev, [effectiveContextId]: true }));
            setFixedTab("code-review");
          }}
          onReplaceTerminalAndRun={async (command) => {
            if (!effectiveContextId) return;
            try {
              await systemApi.killCodeReviewWindow(effectiveContextId);
              codeReviewTerminalGridRef.current?.removeTerminalByTmuxWindowName(CODE_REVIEW_WINDOW_NAME);
              codeReviewUserTriggeredRef.current = true;
              setCodeReviewPendingCommand(command);
              setCodeReviewVisibleMap(prev => ({ ...prev, [effectiveContextId]: true }));
              setFixedTab("code-review");
              toastManager.add({
                title: "Code review started",
                description: "Switched to Code Review tab. Check progress there.",
                type: "info",
              });
            } catch (err) {
              setCodeReviewPendingCommand(null);
              toastManager.add({
                title: "Failed to close previous terminal",
                description: err instanceof Error ? err.message : "Unknown error",
                type: "error",
              });
            }
          }}
        />
      )}

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
