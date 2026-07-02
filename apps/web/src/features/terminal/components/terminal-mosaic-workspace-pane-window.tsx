"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
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
import {
  TerminalAgentInputOverlay,
  type TerminalAgentInputOverlayHandle,
} from "./TerminalAgentInputOverlay";
import { TerminalTitleWithAgent } from "./terminal-title";
import type { TerminalPaneAgent, TerminalPaneProps } from "../types/index";
import { useTerminalToolbarTitle } from "../hooks/use-terminal-toolbar-title";
import { useTerminalSideChats } from "../hooks/use-terminal-side-chats";
import { resolveTerminalAgentSubmitMode } from "../lib/terminal-runtime-utils";
import {
  getAgentContextDragText,
  hasAgentContextDragData,
} from "@/shared/lib/agent-context-drag";

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
  agentInputOverlayRefsMap: React.MutableRefObject<Map<string, TerminalAgentInputOverlayHandle>>;
  readyPanesRef: React.MutableRefObject<Set<string>>;
  pendingCommandsRef: React.MutableRefObject<Map<string, string>>;
  markPaneAttached: (workspaceId: string, paneId: string, terminalTabId?: string) => void;
};

/** Center-grid terminal tile: shared title hook + mosaic chrome (default scope only). */
export function TerminalMosaicWorkspacePaneWindow(props: TerminalMosaicWorkspacePaneWindowProps) {
  const t = useTranslations("terminal.mosaicWorkspacePaneWindow");
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
    agentInputOverlayRefsMap,
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
  const [isTerminalReady, setIsTerminalReady] = React.useState(false);

  React.useEffect(() => {
    setIsTerminalReady(readyPanesRef.current.has(id));
  }, [id, pane.sessionId, readyPanesRef]);

  const activeProject = useMemo(
    () =>
      projects.find(
        (project) =>
          project.id === workspaceId ||
          project.mainFilePath === workspaceInfo?.localPath ||
          project.workspaces.some(
            (workspace) =>
              workspace.id === workspaceId ||
              workspace.localPath === workspaceInfo?.localPath,
          ),
      ) ?? null,
    [projects, workspaceId, workspaceInfo?.localPath],
  );

  const panePinKey = pane.tmuxWindowName
    ? buildCanvasTerminalPinKey(isProjectContext ? "project" : "workspace", workspaceId, pane.tmuxWindowName)
    : null;
  const isPanePinned = panePinKey ? pinnedPaneKeys.has(panePinKey) : false;
  const agentForSubmit = pane.agent ?? toolbarAgent;
  const agentSubmitMode = resolveTerminalAgentSubmitMode(agentForSubmit);
  const sideChatAgentOptions = useMemo(() => {
    const options = quickOpenAgents.map(({ agent, command }) => ({ ...agent, command }));
    if (agentForSubmit?.command?.trim() && !options.some((agent) => agent.id === agentForSubmit.id)) {
      options.unshift(agentForSubmit);
    }
    return options;
  }, [agentForSubmit, quickOpenAgents]);
  const {
    sideChatDots,
    sideChatLayer,
    startSideChat,
  } = useTerminalSideChats({
    workspaceId,
    projectName: workspaceInfo?.projectName ?? null,
    workspaceName: workspaceInfo?.workspaceName ?? null,
    localPath: workspaceInfo?.localPath ?? null,
    projectRootPath: activeProject?.mainFilePath ?? workspaceInfo?.localPath ?? null,
    sourcePaneId: pane.tmuxWindowName ? `${workspaceId}:${pane.tmuxWindowName}` : pane.sessionId,
    sourceSessionId: pane.sessionId,
    sourceSurfaceKind: "terminal_pane",
    sourceSurfaceRef: {
      paneId: id,
      scope: isProjectContext ? "project" : "workspace",
      terminalTabId,
    },
    sourceTmuxWindowName: pane.tmuxWindowName ?? null,
  });
  const pinButtonLabel = isPanePinned
    ? t.has("pin.alreadyPinnedTitle")
      ? t("pin.alreadyPinnedTitle")
      : "Already pinned to canvas"
    : t.has("pin.title")
      ? t("pin.title")
      : "Pin to canvas (⌘⇧P)";
  const splitHorizontalLabel = t.has("split.horizontalTitle")
    ? t("split.horizontalTitle")
    : "Split horizontally (⌘D)";
  const splitVerticalLabel = t.has("split.verticalTitle")
    ? t("split.verticalTitle")
    : "Split vertically (⌘⇧D)";
  const maximizeButtonLabel = maximizedId === id
    ? t.has("maximize.restoreTitle")
      ? t("maximize.restoreTitle")
      : "Restore"
    : t.has("maximize.title")
      ? t("maximize.title")
      : "Maximize";
  const closeButtonLabel = t.has("close.title")
    ? t("close.title")
    : "Close (⌘W)";

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
                  title={pinButtonLabel}
                  aria-label={pinButtonLabel}
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
                            title={splitHorizontalLabel}
                            aria-label={splitHorizontalLabel}
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
                            title={splitVerticalLabel}
                            aria-label={splitVerticalLabel}
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
                          title={maximizeButtonLabel}
                          aria-label={maximizeButtonLabel}
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
                          title={closeButtonLabel}
                          aria-label={closeButtonLabel}
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
        onDragOver={(event) => {
          if (!hasAgentContextDragData(event.dataTransfer)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          const text = getAgentContextDragText(event.dataTransfer);
          if (!text) return;
          event.preventDefault();
          event.stopPropagation();
          setActivePaneId(id);
          const terminalRef = terminalRefsMap.current.get(id);
          terminalRef?.focus();
          terminalRef?.sendText(`${text} `);
        }}
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
          projectRootPath={activeProject?.mainFilePath}
          onTitleChange={onTitleChange}
          onSessionReady={() => {
            readyPanesRef.current.add(id);
            setIsTerminalReady(true);
            markPaneAttached(workspaceId, id, terminalTabId);
            const cmd = pendingCommandsRef.current.get(id);
            if (cmd) {
              pendingCommandsRef.current.delete(id);
              terminalRefsMap.current.get(id)?.sendText(cmd);
            }
          }}
          onSessionClose={() => {
            readyPanesRef.current.delete(id);
            setIsTerminalReady(false);
          }}
          onSessionError={() => {
            readyPanesRef.current.delete(id);
            setIsTerminalReady(false);
          }}
        />
        <TerminalAgentInputOverlay
          ref={(overlayRef) => {
            if (overlayRef) {
              agentInputOverlayRefsMap.current.set(id, overlayRef);
            } else {
              agentInputOverlayRefsMap.current.delete(id);
            }
          }}
          activeProjectId={activeProject?.id ?? null}
          getTerminalCursorClientPoint={() =>
            terminalRefsMap.current.get(id)?.getCursorClientPoint() ?? null
          }
          isTerminalReady={isTerminalReady}
          localPath={workspaceInfo?.localPath}
          onStartSideChat={startSideChat}
          onSendEnter={() => {
            terminalRefsMap.current.get(id)?.sendEnter();
          }}
          onSendText={(text) => {
            setActivePaneId(id);
            const terminalRef = terminalRefsMap.current.get(id);
            terminalRef?.focus();
            terminalRef?.sendText(text);
          }}
          sideChatAgent={agentForSubmit ?? null}
          sideChatAgentOptions={sideChatAgentOptions}
          sideChatDots={sideChatDots}
          submitMode={agentSubmitMode}
        />
        {sideChatLayer}
      </div>
    </MosaicWindow>
  );
}
