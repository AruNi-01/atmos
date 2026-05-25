"use client";

import React, { useMemo } from "react";
import { MosaicWindow, type MosaicPath } from "react-mosaic-component";
import { Bot, Columns, Maximize2, Pin, Rows, X } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@workspace/ui";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { AgentHookStatusIndicator } from "@/features/agent/components/AgentHookStatusIndicator";
import { buildCanvasTerminalPinKey } from "@/features/canvas/lib/canvas-terminal-shape";
import { AGENT_STATE, useAgentHooksStore } from "@/features/agent/store/agent-hooks-store";
import type { Project } from "@/shared/types/domain";
import { Terminal, type TerminalRef } from "./Terminal";
import { TerminalTitleWithAgent } from "./terminal-title";
import type { TerminalPaneAgent, TerminalPaneProps } from "../types/index";
import { useTerminalToolbarTitle } from "../hooks/use-terminal-toolbar-title";

type MosaicToolbarActions = {
  split: boolean;
  maximize: boolean;
  close: boolean;
};

type QuickOpenAgent = {
  agent: TerminalPaneAgent;
  command: string;
};

export function TerminalPaneAgentStatus({ paneId }: { paneId: string; contextId: string }) {
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

type TerminalMosaicWorkspacePaneWindowProps = {
  id: string;
  path: MosaicPath;
  pane: TerminalPaneProps;
  workspaceId: string;
  terminalTabId: string;
  workspaceInfo: { projectName: string; workspaceName: string; localPath: string } | null | undefined;
  projects: Project[];
  configuredAgents: TerminalPaneAgent[];
  isProjectContext: boolean;
  pinnedPaneKeys: Set<string>;
  maximizedId: string | null;
  effectiveActivePaneId: string | null;
  hasMultiplePanes: boolean;
  actions: MosaicToolbarActions;
  quickOpenAgents: QuickOpenAgent[];
  splitMenuKey: string | null;
  setSplitMenuKey: React.Dispatch<React.SetStateAction<string | null>>;
  onSplitPane: (id: string, direction: "row" | "column") => void;
  splitAndRunAgent: (id: string, direction: "row" | "column", command: string, agent: TerminalPaneAgent) => void;
  handleSplitMenuEnter: (key: string) => void;
  handleSplitMenuLeave: () => void;
  pinPaneToCanvas: (id?: string | null) => void;
  onToggleMaximize: (id: string) => void;
  requestCloseTerminal: (id?: string | null) => void;
  setActivePaneId: (id: string | null) => void;
  setIsPaneDragging: (v: boolean) => void;
  terminalRefsMap: React.MutableRefObject<Map<string, TerminalRef>>;
  readyPanesRef: React.MutableRefObject<Set<string>>;
  pendingCommandsRef: React.MutableRefObject<Map<string, string>>;
  markPaneAttached: (workspaceId: string, paneId: string, terminalTabId?: string) => void;
};

/** Center-grid terminal tile: shared title hook + mosaic chrome (default scope only). */
export function TerminalMosaicWorkspacePaneWindow(props: TerminalMosaicWorkspacePaneWindowProps) {
  const {
    id,
    path,
    pane,
    workspaceId,
    terminalTabId,
    workspaceInfo,
    projects,
    configuredAgents,
    isProjectContext,
    pinnedPaneKeys,
    maximizedId,
    effectiveActivePaneId,
    hasMultiplePanes,
    actions,
    quickOpenAgents,
    splitMenuKey,
    setSplitMenuKey,
    onSplitPane,
    splitAndRunAgent,
    handleSplitMenuEnter,
    handleSplitMenuLeave,
    pinPaneToCanvas,
    onToggleMaximize,
    requestCloseTerminal,
    setActivePaneId,
    setIsPaneDragging,
    terminalRefsMap,
    readyPanesRef,
    pendingCommandsRef,
    markPaneAttached,
  } = props;

  const storeWrite = useMemo(
    () =>
      ({
        kind: "mosaic-pane" as const,
        workspaceId,
        paneId: id,
        terminalTabId,
      }),
    [workspaceId, id, terminalTabId],
  );

  const { displayTitle, toolbarAgent, onTitleChange } = useTerminalToolbarTitle({
    baseTitle: pane.label,
    configuredAgents,
    storeWrite,
  });

  const panePinKey = pane.tmuxWindowName
    ? buildCanvasTerminalPinKey(isProjectContext ? "project" : "workspace", workspaceId, pane.tmuxWindowName)
    : null;
  const isPanePinned = panePinKey ? pinnedPaneKeys.has(panePinKey) : false;

  return (
    <MosaicWindow<string>
      path={path}
      title={displayTitle ?? ""}
      className={cn(
        maximizedId === id && "is-maximized",
        hasMultiplePanes && (effectiveActivePaneId === id ? "is-active-pane" : "is-inactive-pane"),
      )}
      onDragStart={() => setIsPaneDragging(true)}
      onDragEnd={() => setIsPaneDragging(false)}
      renderToolbar={() => {
        return (
          <div className="terminal-mosaic-toolbar group/toolbar">
            <div className="terminal-mosaic-toolbar-left">
              {displayTitle ? (
                <TerminalTitleWithAgent
                  displayTitle={displayTitle}
                  toolbarAgent={toolbarAgent}
                  className="terminal-mosaic-title gap-1.5"
                />
              ) : null}
              <TerminalPaneAgentStatus paneId={pane.tmuxWindowName ? `${workspaceId}:${pane.tmuxWindowName}` : pane.sessionId} contextId={workspaceId} />
            </div>

            {(actions.split || actions.maximize || actions.close) && (
              <div className="terminal-mosaic-toolbar-right">
                <button
                  type="button"
                  className={cn(
                    "terminal-mosaic-btn transition-opacity opacity-0 group-hover/toolbar:opacity-100",
                    isPanePinned && "cursor-default text-primary hover:text-primary",
                  )}
                  onClick={() => {
                    if (isPanePinned) return;
                    void pinPaneToCanvas(id);
                  }}
                  title={isPanePinned ? "Already pinned to Canvas" : "Pin to Canvas (⌘⇧P)"}
                  aria-disabled={isPanePinned}
                  aria-pressed={isPanePinned}
                >
                  <Pin size={12} className={cn(!isPanePinned && "rotate-45")} />
                </button>
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
                            type="button"
                            className="terminal-mosaic-btn"
                            onClick={() => onSplitPane(id, "row")}
                            onMouseEnter={() => handleSplitMenuEnter(`${id}:row`)}
                            onMouseLeave={handleSplitMenuLeave}
                            title="Split Horizontal (⌘D)"
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
                            {quickOpenAgents.map(({ agent, command }) => (
                              <DropdownMenuItem key={`row-${agent.id}`} onSelect={() => splitAndRunAgent(id, "row", command, agent)}>
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
                            type="button"
                            className="terminal-mosaic-btn"
                            onClick={() => onSplitPane(id, "column")}
                            onMouseEnter={() => handleSplitMenuEnter(`${id}:column`)}
                            onMouseLeave={handleSplitMenuLeave}
                            title="Split Vertical (⌘⇧D)"
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
                            {quickOpenAgents.map(({ agent, command }) => (
                              <DropdownMenuItem key={`column-${agent.id}`} onSelect={() => splitAndRunAgent(id, "column", command, agent)}>
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
                    <div
                      className={cn(
                        "flex items-center gap-0.5 transition-opacity",
                        maximizedId === id ? "opacity-100" : "opacity-0 group-hover/toolbar:opacity-100",
                      )}
                    >
                      {actions.maximize && (
                        <button
                          type="button"
                          className={cn("terminal-mosaic-btn", maximizedId === id && "text-primary")}
                          onClick={() => onToggleMaximize(id)}
                          title={maximizedId === id ? "Restore" : "Maximize"}
                        >
                          {maximizedId === id ? (
                            <div className="relative flex size-3 items-center justify-center">
                              <Maximize2 size={11} className="scale-75 opacity-70" />
                              <div className="absolute inset-0 translate-x-0.5 -translate-y-0.5 scale-50 rounded-[1px] border-[1.5px] border-current" />
                            </div>
                          ) : (
                            <Maximize2 size={11} />
                          )}
                        </button>
                      )}
                      {actions.close && (
                        <button
                          type="button"
                          className="terminal-mosaic-btn terminal-mosaic-btn-close ml-1"
                          onClick={() => requestCloseTerminal(id)}
                          title="Close (⌘W)"
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
      <div
        className="terminal-mosaic-content"
        data-pane-id={id}
        onMouseDownCapture={() => setActivePaneId(id)}
        onFocusCapture={() => setActivePaneId(id)}
      >
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
            project.id === workspaceId || project.workspaces.some((workspace) => workspace.id === workspaceId),
          )?.mainFilePath}
          onTitleChange={onTitleChange}
          onSessionReady={() => {
            readyPanesRef.current.add(id);
            markPaneAttached(workspaceId, id, terminalTabId);
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
}
