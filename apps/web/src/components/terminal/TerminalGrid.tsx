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
  Bot,
  Loader2,
  Plus,
  Maximize2,
} from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, cn } from "@workspace/ui";
import { Terminal, TerminalRef } from "./Terminal";
import { useTerminalStore } from "@/hooks/use-terminal-store";
import { useProjectStore } from "@/hooks/use-project-store";
import { AgentIcon } from "@/components/agent/AgentIcon";
import { AGENT_OPTIONS } from "@/components/wiki/AgentSelect";
import { AGENT_STATE, useAgentHooksStore } from "@/hooks/use-agent-hooks-store";
import { AgentHookStatusIndicator } from "@/components/agent/AgentHookStatusIndicator";

import "react-mosaic-component/react-mosaic-component.css";
import "./terminal-grid.css";

// Hash map: normalized string → registry ID for O(1) lookup.
// Covers both agent labels (pane.title from createAndRunTerminal) and
// process names (pane.dynamicTitle from shell shim CMD_START sequences).
const PANE_TITLE_TO_REGISTRY_ID: Record<string, string> = {
  // Labels — set as pane.title when launching an agent terminal
  ...Object.fromEntries(AGENT_OPTIONS.map((a) => [a.label.toLowerCase(), a.id])),
  // Primary commands — reported by the shim as CMD_START when the agent runs
  ...Object.fromEntries(AGENT_OPTIONS.map((a) => [a.cmd.toLowerCase(), a.id])),
  // Additional command aliases not captured above
  "cursor-agent": "cursor",
};

// Strip the "-N" uniqueness suffix added by getUniqueAgentName (e.g. "Claude Code-2" → "Claude Code")
function getBasePaneTitle(title: string): string {
  return title.replace(/-\d+$/, "");
}

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
  terminalTabId?: string;
  quickOpenAgents?: Array<{
    id: string;
    label: string;
    command: string;
    iconType: "built-in" | "custom";
  }>;
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
  /** Create a new terminal and pre-fill command text without executing it */
  prefillTerminal: (options: { title: string; command: string }) => void;
  destroyAllTerminals: () => void;
}

const DEFAULT_TOOLBAR_ACTIONS: Required<TerminalToolbarActions> = {
  split: true,
  maximize: true,
  close: true,
};

function TerminalPaneAgentStatus({ paneId }: { paneId: string; contextId: string }) {
  // Only show status for this specific pane – do NOT fall back to context-level
  // state, which would cause all windows in the same workspace to show RUNNING
  // whenever any one of them has an agent active.
  const paneState = useAgentHooksStore((s) => s.getAgentStateForPaneId(paneId));

  if (paneState === AGENT_STATE.IDLE) return null;

  return (
    <AgentHookStatusIndicator
      state={paneState}
      variant="full"
      className="ml-2"
    />
  );
}

export const TerminalGrid = React.forwardRef<TerminalGridHandle, TerminalGridProps>(({ workspaceId, className, terminalTabId, quickOpenAgents = [], scope = "default", toolbarActions, isProjectContext = false }, ref) => {
  // Track terminal refs for each pane to call destroy on close
  const terminalRefsMap = React.useRef<Map<string, TerminalRef>>(new Map());
  // Pending commands to send when terminal session becomes ready (createAndRunTerminal flow)
  const pendingCommandsRef = React.useRef<Map<string, string>>(new Map());
  const [splitMenuKey, setSplitMenuKey] = React.useState<string | null>(null);
  const [isPaneDragging, setIsPaneDragging] = React.useState(false);
  const splitMenuTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
    getMaximizedTerminalId,
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
    : getPanes(workspaceId, terminalTabId);
  const layout = isCodeReview
    ? getCodeReviewLayout(workspaceId)
    : isProjectWiki
    ? getProjectWikiLayout(workspaceId)
    : getLayout(workspaceId, terminalTabId);
  const workspaceReady = isCodeReview
    ? isCodeReviewReady(workspaceId)
    : isProjectWiki
    ? isProjectWikiReady(workspaceId)
    : isWorkspaceReady(workspaceId, terminalTabId);
  const maximizedId = isCodeReview
    ? codeReviewMaximizedIds[workspaceId]
    : isProjectWiki
    ? projectWikiMaximizedIds[workspaceId]
    : getMaximizedTerminalId(workspaceId, terminalTabId);

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
        initWorkspace(workspaceId, isProjectContext, terminalTabId);
      }
    }
  }, [workspaceId, workspaceExists, initWorkspace, initProjectWikiWorkspace, initCodeReviewWorkspace, isProjectWiki, isCodeReview, isProjectContext, terminalTabId]);

  const hasPanes = Object.keys(panes).length > 0;

  const getPaneId = isCodeReview
    ? getCodeReviewPaneIdByTmuxWindowName
    : isProjectWiki
    ? getProjectWikiPaneIdByTmuxWindowName
    : (ctxWorkspaceId: string, tmuxWindowName: string) =>
        getPaneIdByTmuxWindowName(ctxWorkspaceId, tmuxWindowName, terminalTabId);
  const addTerminal = isCodeReview
    ? (title?: string) => addCodeReviewTerminal(workspaceId, title)
    : isProjectWiki
    ? (title?: string) => addProjectWikiTerminal(workspaceId, title)
    : (title?: string) => addTerminalToStore(workspaceId, title, terminalTabId);
  const removeTerminalFromScope = isCodeReview
    ? (id: string) => removeCodeReviewTerminal(workspaceId, id)
    : isProjectWiki
    ? (id: string) => removeProjectWikiTerminal(workspaceId, id)
    : (id: string) => removeTerminalFromStore(workspaceId, id, terminalTabId);

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
    prefillTerminal: ({ title, command }) => {
      const paneId = addTerminal(title);
      // Pre-fill without \r so the command is typed but not executed
      pendingCommandsRef.current.set(paneId, command);
    },
    destroyAllTerminals: () => {
      for (const terminalRef of terminalRefsMap.current.values()) {
        terminalRef.destroy();
      }
      terminalRefsMap.current.clear();
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
    if (isCodeReview || isProjectWiki) {
      setLayoutForScope(workspaceId, newLayout);
      return;
    }
    setLayoutForScope(workspaceId, newLayout, terminalTabId);
  }, [workspaceId, setLayoutForScope, isCodeReview, isProjectWiki, terminalTabId]);

  const removeTerminal = useCallback((id: string) => {
    const terminalRef = terminalRefsMap.current.get(id);
    if (terminalRef) {
      terminalRef.destroy();
      terminalRefsMap.current.delete(id);
    }
    removeTerminalFromScope(id);
  }, [workspaceId, removeTerminalFromScope]);

  const splitTerminal = useCallback((id: string, direction: "row" | "column") => {
    if (isCodeReview || isProjectWiki) {
      return splitTerminalForScope(workspaceId, id, direction);
    }
    return splitTerminalForScope(workspaceId, id, direction, terminalTabId);
  }, [workspaceId, splitTerminalForScope, isCodeReview, isProjectWiki, terminalTabId]);

  const splitAndRunAgent = useCallback((id: string, direction: "row" | "column", command: string) => {
    const newPaneId = splitTerminal(id, direction);
    if (!newPaneId) return;
    pendingCommandsRef.current.set(newPaneId, command.trim() + "\r");
    setSplitMenuKey(null);
  }, [splitTerminal]);

  const handleSplitMenuEnter = useCallback((key: string) => {
    if (splitMenuTimeoutRef.current) {
      clearTimeout(splitMenuTimeoutRef.current);
    }
    setSplitMenuKey(key);
  }, []);

  const handleSplitMenuLeave = useCallback(() => {
    splitMenuTimeoutRef.current = setTimeout(() => {
      setSplitMenuKey(null);
    }, 120);
  }, []);

  const onToggleMaximize = useCallback((id: string) => {
    if (isCodeReview || isProjectWiki) {
      toggleMaximizeForScope(workspaceId, id);
      return;
    }
    toggleMaximizeForScope(workspaceId, id, terminalTabId);
  }, [workspaceId, toggleMaximizeForScope, isCodeReview, isProjectWiki, terminalTabId]);

  const renderTile = useCallback((id: string, path: MosaicPath) => {
    const pane = panes[id];
    if (!pane) return <div className="p-4 text-xs text-muted-foreground">Pane not found: {id}</div>;

    const displayTitle = pane.dynamicTitle || pane.title;

    return (
      <MosaicWindow<string>
        path={path}
        title={displayTitle}
        className={maximizedId === id ? "is-maximized" : ""}
        onDragStart={() => setIsPaneDragging(true)}
        onDragEnd={() => setIsPaneDragging(false)}
        renderToolbar={() => {
          // Check displayTitle first (reflects active process name from shim CMD_START),
          // then fall back to pane.title (the static label set when the pane was created).
          const agentRegistryId =
            PANE_TITLE_TO_REGISTRY_ID[getBasePaneTitle(displayTitle).toLowerCase()] ??
            PANE_TITLE_TO_REGISTRY_ID[getBasePaneTitle(pane.title).toLowerCase()];

          return (
            <div className="terminal-mosaic-toolbar group/toolbar">
              <div className="terminal-mosaic-toolbar-left">
                {agentRegistryId ? (
                  <AgentIcon registryId={agentRegistryId} name={pane.title} size={14} />
                ) : (
                  <div className="size-2 rounded-full bg-emerald-500" />
                )}

                <span className="terminal-mosaic-title flex items-center gap-1.5 ml-1">
                  {displayTitle}
                </span>
                <TerminalPaneAgentStatus paneId={pane.tmuxWindowName ? `${workspaceId}:${pane.tmuxWindowName}` : pane.sessionId} contextId={workspaceId} />
              </div>

              {(actions.split || actions.maximize || actions.close) && (
              <div className="terminal-mosaic-toolbar-right">
                  <div className="flex items-center gap-0.5">
                    {actions.split && (
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/toolbar:opacity-100">
                        <DropdownMenu
                          open={splitMenuKey === `${id}:row`}
                          onOpenChange={(open) => setSplitMenuKey(open ? `${id}:row` : null)}
                          modal={false}
                        >
                          <DropdownMenuTrigger asChild>
                            <button
                              className="terminal-mosaic-btn"
                              onClick={() => splitTerminal(id, "row")}
                              onMouseEnter={() => handleSplitMenuEnter(`${id}:row`)}
                              onMouseLeave={handleSplitMenuLeave}
                              title="Split Horizontal"
                            >
                              <Columns size={12} />
                            </button>
                          </DropdownMenuTrigger>
                          {quickOpenAgents.length > 0 && (
                            <DropdownMenuContent
                              align="start"
                              onMouseEnter={() => handleSplitMenuEnter(`${id}:row`)}
                              onMouseLeave={handleSplitMenuLeave}
                              onCloseAutoFocus={(e) => e.preventDefault()}
                            >
                              {quickOpenAgents.map((agent) => (
                                <DropdownMenuItem key={`row-${agent.id}`} onClick={() => splitAndRunAgent(id, "row", agent.command)}>
                                  {agent.iconType === "built-in" ? (
                                    <AgentIcon registryId={agent.id} name={agent.label} size={16} />
                                  ) : (
                                    <Bot className="size-4 text-muted-foreground" />
                                  )}
                                  <span>{agent.label}</span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          )}
                        </DropdownMenu>
                        <DropdownMenu
                          open={splitMenuKey === `${id}:column`}
                          onOpenChange={(open) => setSplitMenuKey(open ? `${id}:column` : null)}
                          modal={false}
                        >
                          <DropdownMenuTrigger asChild>
                            <button
                              className="terminal-mosaic-btn"
                              onClick={() => splitTerminal(id, "column")}
                              onMouseEnter={() => handleSplitMenuEnter(`${id}:column`)}
                              onMouseLeave={handleSplitMenuLeave}
                              title="Split Vertical"
                            >
                              <Rows size={12} />
                            </button>
                          </DropdownMenuTrigger>
                          {quickOpenAgents.length > 0 && (
                            <DropdownMenuContent
                              align="start"
                              onMouseEnter={() => handleSplitMenuEnter(`${id}:column`)}
                              onMouseLeave={handleSplitMenuLeave}
                              onCloseAutoFocus={(e) => e.preventDefault()}
                            >
                              {quickOpenAgents.map((agent) => (
                                <DropdownMenuItem key={`column-${agent.id}`} onClick={() => splitAndRunAgent(id, "column", agent.command)}>
                                  {agent.iconType === "built-in" ? (
                                    <AgentIcon registryId={agent.id} name={agent.label} size={16} />
                                  ) : (
                                    <Bot className="size-4 text-muted-foreground" />
                                  )}
                                  <span>{agent.label}</span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          )}
                        </DropdownMenu>
                      </div>
                    )}
                    {(actions.maximize || actions.close) && (
                      <div className={cn("flex items-center gap-0.5 transition-opacity", maximizedId === id ? "opacity-100" : "opacity-0 group-hover/toolbar:opacity-100")}>
                    {actions.maximize && (
                      <button
                        className={cn(
                          "terminal-mosaic-btn",
                          maximizedId === id && "text-primary"
                        )}
                        onClick={() => onToggleMaximize(id)}
                        title={maximizedId === id ? "Restore" : "Maximize"}
                      >
                        {maximizedId === id ? (
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
            onTitleChange={(title) => {
              if (isCodeReview || isProjectWiki) {
                setDynamicTitleForScope(workspaceId, id, title);
                return;
              }
              setDynamicTitleForScope(workspaceId, id, title, terminalTabId);
            }}
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
  }, [
    panes,
    splitTerminal,
    splitAndRunAgent,
    removeTerminal,
    workspaceInfo,
    maximizedId,
    workspaceId,
    onToggleMaximize,
    setDynamicTitleForScope,
    actions,
    projects,
    isCodeReview,
    isProjectWiki,
    terminalTabId,
    splitMenuKey,
    quickOpenAgents,
    handleSplitMenuEnter,
    handleSplitMenuLeave,
  ]);

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

  return (
    <div
      className={cn("terminal-mosaic-container", className)}
      data-maximized-id={maximizedId || undefined}
      data-pane-dragging={isPaneDragging ? "true" : undefined}
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
