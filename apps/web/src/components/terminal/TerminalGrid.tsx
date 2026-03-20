"use client";

// Suppress React 19 ref warnings from react-mosaic-component
// This must be imported before react-mosaic-component
import "@/lib/suppress-react19-ref-warning";

import React, { useCallback, useEffect } from "react";
import {
  Mosaic,
  MosaicWindow,
  MosaicNode,
  MosaicPath,
} from "react-mosaic-component";
import {
  X,
  Columns,
  Rows,
  Terminal as TerminalIcon,
  Loader2,
  Plus,
  Folder,
  ChevronDown,
  Maximize2,
  Bot,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Terminal, TerminalRef } from "./Terminal";
import { useTerminalStore, PROJECT_WIKI_WINDOW_NAME } from "@/hooks/use-terminal-store";
import { useProjectStore } from "@/hooks/use-project-store";

import "react-mosaic-component/react-mosaic-component.css";
import "./terminal-grid.css";

type TerminalGridScope = "default" | "project-wiki" | "code-review";

/** Control which toolbar action buttons to show. Omitted or true = show, false = hide. */
export interface TerminalToolbarActions {
  /** Split horizontal/vertical buttons */
  split?: boolean;
  /** Maximize/restore button */
  maximize?: boolean;
  /** Close pane button */
  close?: boolean;
}

interface TerminalGridProps {
  workspaceId: string;
  className?: string;
  /** When "project-wiki", uses separate panes/layout (does not affect main Terminal tab) */
  scope?: TerminalGridScope;
  /** Which toolbar action buttons to show. Default: all true. Use e.g. { split: false, maximize: false, close: false } for Project Wiki. */
  toolbarActions?: TerminalToolbarActions;
  /** When true, workspaceId refers to a project ID (use project layout API). When false, it's a workspace ID. */
  isProjectContext?: boolean;
}

export interface TerminalGridHandle {
  addTerminal: (title?: string) => void;
  /** Create a new terminal tab and run command after session is ready */
  createAndRunTerminal: (options: { title: string; command: string }) => Promise<void>;
  /** Create or focus terminal by title (e.g. "Generate Project Wiki") and run command. Reuses existing pane if found. */
  createOrFocusAndRunTerminal: (options: { title: string; command: string }) => Promise<void>;
  /** Remove terminal pane by tmux window name. Used when killing backend tmux window before replace. */
  removeTerminalByTmuxWindowName: (tmuxWindowName: string) => void;
}

const DEFAULT_TOOLBAR_ACTIONS: Required<TerminalToolbarActions> = {
  split: true,
  maximize: true,
  close: true,
};

export const TerminalGrid = React.forwardRef<TerminalGridHandle, TerminalGridProps>(({ workspaceId, className, scope = "default", toolbarActions, isProjectContext = false }, ref) => {
  // Track terminal refs for each pane to call destroy on close
  const terminalRefsMap = React.useRef<Map<string, TerminalRef>>(new Map());
  // Pending commands to send when terminal session becomes ready (createAndRunTerminal flow)
  const pendingCommandsRef = React.useRef<Map<string, string>>(new Map());

  const isProjectWiki = scope === "project-wiki";
  const isCodeReview = scope === "code-review";
  const actions = { ...DEFAULT_TOOLBAR_ACTIONS, ...toolbarActions };

  const {
    getPanes,
    getLayout,
    setLayout,
    initWorkspace,
    isWorkspaceReady,
    addTerminal: addTerminalToStore,
    removeTerminal: removeTerminalFromStore,
    getPaneIdByTmuxWindowName,
    splitTerminal: splitTerminalInStore,
    toggleMaximize,
    workspaceMaximizedIds,
    setDynamicTitle,
    getProjectWikiPanes,
    getProjectWikiLayout,
    setProjectWikiLayout,
    addProjectWikiTerminal,
    removeProjectWikiTerminal,
    splitProjectWikiTerminal,
    initProjectWikiWorkspace,
    getProjectWikiPaneIdByTmuxWindowName,
    setProjectWikiDynamicTitle,
    toggleProjectWikiMaximize,
    isProjectWikiReady,
    projectWikiMaximizedIds,
    getCodeReviewPanes,
    getCodeReviewLayout,
    setCodeReviewLayout,
    addCodeReviewTerminal,
    removeCodeReviewTerminal,
    splitCodeReviewTerminal,
    initCodeReviewWorkspace,
    getCodeReviewPaneIdByTmuxWindowName,
    setCodeReviewDynamicTitle,
    toggleCodeReviewMaximize,
    isCodeReviewReady,
    codeReviewMaximizedIds,
  } = useTerminalStore();

  const panes = isCodeReview
    ? getCodeReviewPanes(workspaceId)
    : isProjectWiki
    ? getProjectWikiPanes(workspaceId)
    : getPanes(workspaceId);
  const layout = isCodeReview
    ? getCodeReviewLayout(workspaceId)
    : isProjectWiki
    ? getProjectWikiLayout(workspaceId)
    : getLayout(workspaceId);
  const workspaceReady = isCodeReview
    ? isCodeReviewReady(workspaceId)
    : isProjectWiki
    ? isProjectWikiReady(workspaceId)
    : isWorkspaceReady(workspaceId);
  const maximizedIds = isCodeReview
    ? codeReviewMaximizedIds
    : isProjectWiki
    ? projectWikiMaximizedIds
    : workspaceMaximizedIds;

  const projects = useProjectStore(s => s.projects);
  const isProjectsLoading = useProjectStore(s => s.isLoading);

  // Look up project and workspace info for human-readable naming
  const workspaceInfo = (() => {
    for (const project of projects) {
      if (project.id === workspaceId) {
        return {
          projectName: project.name,
          workspaceName: "Main",
          localPath: project.mainFilePath,
        };
      }
      const workspace = project.workspaces.find(w => w.id === workspaceId);
      if (workspace) {
        return {
          projectName: project.name,
          workspaceName: workspace.name,
          localPath: workspace.localPath,
        };
      }
    }
    return null;
  })();

  const workspaceExists = !!workspaceInfo;

  useEffect(() => {
    if (workspaceExists) {
      if (isCodeReview) {
        initCodeReviewWorkspace(workspaceId);
      } else if (isProjectWiki) {
        initProjectWikiWorkspace(workspaceId);
      } else {
        initWorkspace(workspaceId, isProjectContext);
      }
    }
  }, [workspaceId, workspaceExists, initWorkspace, initProjectWikiWorkspace, initCodeReviewWorkspace, isProjectWiki, isCodeReview, isProjectContext]);

  const hasPanes = Object.keys(panes).length > 0;

  const getPaneId = isCodeReview
    ? getCodeReviewPaneIdByTmuxWindowName
    : isProjectWiki
    ? getProjectWikiPaneIdByTmuxWindowName
    : getPaneIdByTmuxWindowName;
  const addTerminal = isCodeReview
    ? (title?: string) => addCodeReviewTerminal(workspaceId, title)
    : isProjectWiki
    ? (title?: string) => addProjectWikiTerminal(workspaceId, title)
    : (title?: string) => addTerminalToStore(workspaceId, title);
  const removeTerminalFromScope = isCodeReview
    ? (id: string) => removeCodeReviewTerminal(workspaceId, id)
    : isProjectWiki
    ? (id: string) => removeProjectWikiTerminal(workspaceId, id)
    : (id: string) => removeTerminalFromStore(workspaceId, id);

  React.useImperativeHandle(ref, () => ({
    addTerminal: (title?: string) => addTerminal(title),
    createAndRunTerminal: async ({ title, command }) => {
      const paneId = addTerminal(title);
      pendingCommandsRef.current.set(paneId, command + "\r");
    },
    createOrFocusAndRunTerminal: async ({ title, command }) => {
      const existingPaneId = getPaneId(workspaceId, title);
      const cmd = command.trim() + "\r";
      if (existingPaneId) {
        const termRef = terminalRefsMap.current.get(existingPaneId);
        if (termRef) {
          termRef.sendText(cmd);
        } else {
          pendingCommandsRef.current.set(existingPaneId, cmd);
        }
        return;
      }
      const paneId = addTerminal(title);
      pendingCommandsRef.current.set(paneId, cmd);
    },
    removeTerminalByTmuxWindowName: (tmuxWindowName: string) => {
      const paneId = getPaneId(workspaceId, tmuxWindowName);
      if (!paneId) return;
      const terminalRef = terminalRefsMap.current.get(paneId);
      if (terminalRef) {
        terminalRef.destroy();
        terminalRefsMap.current.delete(paneId);
      }
      removeTerminalFromScope(paneId);
    },
  }), [workspaceId, addTerminal, getPaneId, removeTerminalFromScope]);

  const setLayoutForScope = isCodeReview
    ? setCodeReviewLayout
    : isProjectWiki
    ? setProjectWikiLayout
    : setLayout;
  const splitTerminalForScope = isCodeReview
    ? splitCodeReviewTerminal
    : isProjectWiki
    ? splitProjectWikiTerminal
    : splitTerminalInStore;
  const toggleMaximizeForScope = isCodeReview
    ? toggleCodeReviewMaximize
    : isProjectWiki
    ? toggleProjectWikiMaximize
    : toggleMaximize;
  const setDynamicTitleForScope = isCodeReview
    ? setCodeReviewDynamicTitle
    : isProjectWiki
    ? setProjectWikiDynamicTitle
    : setDynamicTitle;

  const onChange = useCallback((newLayout: MosaicNode<string> | null) => {
    setLayoutForScope(workspaceId, newLayout);
  }, [workspaceId, setLayoutForScope]);

  const removeTerminal = useCallback((id: string) => {
    const terminalRef = terminalRefsMap.current.get(id);
    if (terminalRef) {
      terminalRef.destroy();
      terminalRefsMap.current.delete(id);
    }
    removeTerminalFromScope(id);
  }, [workspaceId, removeTerminalFromScope]);

  const splitTerminal = useCallback((id: string, direction: "row" | "column") => {
    splitTerminalForScope(workspaceId, id, direction);
  }, [workspaceId, splitTerminalForScope]);

  const onToggleMaximize = useCallback((id: string) => {
    toggleMaximizeForScope(workspaceId, id);
  }, [workspaceId, toggleMaximizeForScope]);

  const renderTile = useCallback((id: string, path: MosaicPath) => {
    const pane = panes[id];
    if (!pane) return <div className="p-4 text-xs text-muted-foreground">Pane not found: {id}</div>;

    // Display dynamic title (from shell shim) if available, otherwise the static title
    const displayTitle = pane.dynamicTitle || pane.title;

    return (
      <MosaicWindow<string>
        path={path}
        title={displayTitle}
        className={maximizedIds[workspaceId] === id ? "is-maximized" : ""}
        renderToolbar={() => {
          const isClaude = pane.title.toLowerCase().includes("claude");
          const statusColor = isClaude ? "bg-yellow-500" : "bg-emerald-500";

          return (
            <div className="terminal-mosaic-toolbar group/toolbar">
              <div className="terminal-mosaic-toolbar-left">
                {/* Status Dot */}
                <div className={cn("size-2 rounded-full", statusColor)} />

                {/* Title — shows dynamic title (command name / cwd) when available */}
                <span className="terminal-mosaic-title flex items-center gap-1.5 ml-1">
                  {displayTitle}
                </span>
              </div>

              {(actions.split || actions.maximize || actions.close) && (
              <div className="terminal-mosaic-toolbar-right">
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/toolbar:opacity-100 transition-opacity">
                    {actions.split && (
                      <>
                        <button
                          className="terminal-mosaic-btn"
                          onClick={() => splitTerminal(id, "row")}
                          title="Split Horizontal"
                        >
                          <Columns size={12} />
                        </button>
                        <button
                          className="terminal-mosaic-btn"
                          onClick={() => splitTerminal(id, "column")}
                          title="Split Vertical"
                        >
                          <Rows size={12} />
                        </button>
                      </>
                    )}
                    {actions.maximize && (
                      <button
                        className={cn(
                          "terminal-mosaic-btn",
                          maximizedIds[workspaceId] === id && "text-primary"
                        )}
                        onClick={() => onToggleMaximize(id)}
                        title={maximizedIds[workspaceId] === id ? "Restore" : "Maximize"}
                      >
                        {maximizedIds[workspaceId] === id ? (
                          <div className="relative size-3 flex items-center justify-center">
                            <Maximize2 size={11} className="scale-75 opacity-70" />
                            <div className="absolute inset-0 border-[1.5px] border-current rounded-[1px] scale-50 translate-x-0.5 -translate-y-0.5" />
                          </div>
                        ) : (
                          <Maximize2 size={11} />
                        )}
                      </button>
                    )}
                    {actions.close && (
                      <button
                        className="terminal-mosaic-btn terminal-mosaic-btn-close ml-1"
                        onClick={() => removeTerminal(id)}
                        title="Close"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
              </div>
              )}
            </div>
          );
        }}
      >
        <div className="terminal-mosaic-content" data-pane-id={id}>
          <Terminal
            ref={(termRef) => {
              if (termRef) {
                terminalRefsMap.current.set(id, termRef);
              } else {
                terminalRefsMap.current.delete(id);
              }
            }}
            sessionId={pane.sessionId}
            workspaceId={pane.workspaceId}
            tmuxWindowName={pane.tmuxWindowName}
            projectName={workspaceInfo?.projectName}
            workspaceName={workspaceInfo?.workspaceName}
            isNewPane={pane.isNewPane}
            cwd={workspaceInfo?.localPath}
            projectRootPath={projects.find((project) =>
              project.id === workspaceId || project.workspaces.some((workspace) => workspace.id === workspaceId)
            )?.mainFilePath}
            onTitleChange={(title) => setDynamicTitleForScope(workspaceId, id, title)}
            onSessionReady={() => {
              const cmd = pendingCommandsRef.current.get(id);
              if (cmd) {
                pendingCommandsRef.current.delete(id);
                terminalRefsMap.current.get(id)?.sendText(cmd);
              }
            }}
          />
        </div>
      </MosaicWindow>
    );
  }, [panes, splitTerminal, removeTerminal, workspaceInfo, maximizedIds, workspaceId, onToggleMaximize, setDynamicTitleForScope, actions, projects]);

  // Wait for workspace to be ready before rendering any Terminal components
  // This prevents duplicate tmux window creation during initialization
  if (isProjectsLoading || !workspaceExists || !workspaceReady) {
    return (
      <div className={cn("terminal-grid-container flex items-center justify-center", className)}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading workspace...</span>
        </div>
      </div>
    );
  }

  if (!hasPanes || !layout) {
    const emptyTitle = isProjectWiki ? "Generate Project Wiki" : undefined;
    const emptyLabel = isProjectWiki ? "Add Project Wiki Terminal" : "Initialize Workspace";
    const emptyHint = isProjectWiki ? "Run wiki generation from the Wiki tab" : "Click to add your first terminal session";
    return (
      <div className={cn("terminal-grid-container flex items-center justify-center", className)}>
        <button
          className="flex flex-col items-center gap-4 hover:text-foreground transition-all duration-300 group"
          onClick={() => addTerminal(emptyTitle)}
        >
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full scale-0 group-hover:scale-150 transition-transform duration-500" />
            <div className="relative size-14 rounded-2xl bg-sidebar border border-border flex items-center justify-center group-hover:border-primary/50 group-hover:shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)] transition-all duration-300">
              <Plus className="size-6 text-muted-foreground group-hover:text-primary group-hover:rotate-90 transition-all duration-500" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-semibold tracking-tight text-muted-foreground group-hover:text-foreground transition-colors">
              {emptyLabel}
            </span>
            <span className="text-[11px] text-muted-foreground/60">
              {emptyHint}
            </span>
          </div>
        </button>
      </div>
    );
  }

  const maximizedId = maximizedIds[workspaceId];

  return (
    <div
      className={cn("terminal-mosaic-container", className)}
      data-maximized-id={maximizedId || undefined}
    >
      <Mosaic<string>
        renderTile={renderTile}
        value={layout}
        onChange={onChange}
        className="atmos-mosaic-theme"
      />
    </div>
  );
});

TerminalGrid.displayName = "TerminalGrid";
