"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Bot, Columns, Maximize2, Pin, Rows, X } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@workspace/ui";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { attentionBorderClass } from "@/features/agent/components/AgentAttentionIndicator";
import { useAgentAttentionStore } from "@/features/agent/store/agent-attention-store";
import { buildCanvasTerminalPinKey } from "@/features/canvas/lib/canvas-terminal-shape";
import type { Project } from "@/shared/types/domain";
import { Terminal, type TerminalRef } from "./Terminal";
import {
  TerminalAgentInputOverlay,
  type TerminalAgentInputOverlayHandle,
} from "./TerminalAgentInputOverlay";
import { TerminalPaneDragHandle } from "./terminal-pane-dnd";
import {
  getTerminalDisplayMeta,
  resolveAgentForTitle,
  TerminalTitleWithAgent,
} from "./terminal-title";
import type { TerminalPaneAgent, TerminalPaneProps } from "../types/index";
import { useContestedCliOwners } from "../hooks/use-contested-cli-owners";
import { useTerminalSideChats } from "../hooks/use-terminal-side-chats";
import { useToolbarHoverExpand } from "../hooks/use-toolbar-hover-expand";
import type { PendingTerminalRun } from "../lib/terminal-agent-run-delivery";
import { resolveTerminalAgentSubmitMode } from "../lib/terminal-runtime-utils";
import { TerminalPaneAgentStatus } from "./TerminalPaneAgentStatus";
import {
  getAgentContextDragText,
  hasAgentContextDragData,
} from "@/shared/lib/agent-context-drag";
import { useTerminalRichInputSettingsStore } from "@/features/settings/store/terminal-rich-input-settings-store";
import { hostIdFromCenterKey } from "@/app-shell/center-space/center-space";

type TerminalPaneToolbarActions = {
  split: boolean;
  maximize: boolean;
  close: boolean;
};

type QuickOpenAgent = {
  agent: TerminalPaneAgent;
  command: string;
};

type ScopedPaneWindowProps = {
  id: string;
  pane: TerminalPaneProps;
  workspaceId: string;
  workspaceInfo: { projectName: string; workspaceName: string; localPath: string } | null | undefined;
  projects: Project[];
  configuredAgents: TerminalPaneAgent[];
  isProjectContext: boolean;
  pinnedPaneKeys: Set<string>;
  maximizedId: string | null;
  effectiveActivePaneId: string | null;
  hasMultiplePanes: boolean;
  actions: TerminalPaneToolbarActions;
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
  terminalRefsMap: React.MutableRefObject<Map<string, TerminalRef>>;
  agentInputOverlayRefsMap: React.MutableRefObject<Map<string, TerminalAgentInputOverlayHandle>>;
  readyPanesRef: React.MutableRefObject<Set<string>>;
  pendingRunsRef: React.MutableRefObject<Map<string, PendingTerminalRun>>;
  deliverPendingRunForPane: (paneId: string) => void;
  setDynamicTitle: (workspaceId: string, paneId: string, title: string) => void;
  setOscTitle: (workspaceId: string, paneId: string, title: string | undefined) => void;
  setPaneAgent: (workspaceId: string, paneId: string, agent: TerminalPaneAgent) => void;
  markPaneAttached: (workspaceId: string, paneId: string) => void;
  surfaceActive?: boolean;
};

export function TerminalScopedPane({
  id,
  pane,
  workspaceId,
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
  terminalRefsMap,
  agentInputOverlayRefsMap,
  readyPanesRef,
  pendingRunsRef,
  deliverPendingRunForPane,
  setDynamicTitle,
  setOscTitle,
  setPaneAgent,
  markPaneAttached,
  surfaceActive = true,
}: ScopedPaneWindowProps) {
  const t = useTranslations("Terminal.chrome");
  const contestedOwners = useContestedCliOwners();
  const richInputActive = useTerminalRichInputSettingsStore(
    (s) => s.loaded && s.enabled,
  );
  const { toolbarHovered, onToolbarMouseEnter, onToolbarMouseLeave } = useToolbarHoverExpand(400);
  const splitMenuOpenForPane =
    splitMenuKey === `${id}:row` || splitMenuKey === `${id}:column`;
  const toolbarExpanded =
    maximizedId === id || toolbarHovered || splitMenuOpenForPane;
  const { displayTitle, primaryTitle, oscSuffix, toolbarAgent } = getTerminalDisplayMeta({
    baseTitle: pane.label,
    dynamicTitle: pane.dynamicTitle,
    configuredAgents,
    agent: pane.agent,
    contestedOwners,
    oscTitle: pane.oscTitle,
    suppressOscTitle: !!pane.customLabel?.trim(),
  });
  const [isTerminalReady, setIsTerminalReady] = React.useState(false);

  React.useEffect(() => {
    setIsTerminalReady(readyPanesRef.current.has(id));
  }, [id, pane.sessionId, readyPanesRef]);

  const hostWorkspaceId = hostIdFromCenterKey(workspaceId);
  const activeProject = React.useMemo(
    () =>
      projects.find(
        (project) =>
          project.id === hostWorkspaceId ||
          project.mainFilePath === workspaceInfo?.localPath ||
          project.workspaces.some(
            (workspace) =>
              workspace.id === hostWorkspaceId ||
              workspace.localPath === workspaceInfo?.localPath,
          ),
      ) ?? null,
    [projects, hostWorkspaceId, workspaceInfo?.localPath],
  );
  const panePinKey = pane.tmuxWindowName
    ? buildCanvasTerminalPinKey(isProjectContext ? "project" : "workspace", workspaceId, pane.tmuxWindowName)
    : null;
  const isPanePinned = panePinKey ? pinnedPaneKeys.has(panePinKey) : false;
  const agentForSubmit = pane.agent ?? toolbarAgent;
  const agentSubmitMode = resolveTerminalAgentSubmitMode(agentForSubmit);
  const skillsContext = React.useMemo(() => {
    if (!workspaceInfo?.localPath) return null;
    if (isProjectContext) {
      if (!activeProject) return null;
      return {
        mode: "project" as const,
        id: activeProject.id,
        name: activeProject.name,
        path: activeProject.mainFilePath || workspaceInfo.localPath,
      };
    }
    return {
      mode: "workspace" as const,
      id: hostWorkspaceId,
      name: workspaceInfo.workspaceName || workspaceInfo.projectName || hostWorkspaceId,
      path: workspaceInfo.localPath,
    };
  }, [activeProject, hostWorkspaceId, isProjectContext, workspaceInfo]);
  const sideChatAgentOptions = React.useMemo(() => {
    const options = quickOpenAgents.map(({ agent, command }) => ({ ...agent, command }));
    if (agentForSubmit?.command?.trim() && !options.some((agent) => agent.id === agentForSubmit.id)) {
      options.unshift(agentForSubmit);
    }
    return options;
  }, [agentForSubmit, quickOpenAgents]);
  const {
    getSideChatFlyTargetClientPoint,
    sideChatDots,
    sideChatLayer,
    startSideChat,
  } = useTerminalSideChats({
    workspaceId,
    projectId: activeProject?.id ?? null,
    projectName: workspaceInfo?.projectName ?? null,
    workspaceName: workspaceInfo?.workspaceName ?? null,
    localPath: workspaceInfo?.localPath ?? null,
    projectRootPath: activeProject?.mainFilePath ?? workspaceInfo?.localPath ?? null,
    sourcePaneId: pane.tmuxWindowName
      ? `${hostWorkspaceId}:${pane.tmuxWindowName}`
      : pane.sessionId,
    sourceSessionId: pane.sessionId,
    sourceSurfaceKind: "terminal_pane",
    sourceSurfaceRef: { paneId: id, scope: isProjectContext ? "project" : "workspace" },
    sourceTmuxWindowName: pane.tmuxWindowName ?? null,
  });

  const stablePaneId = pane.tmuxWindowName
    ? `${hostWorkspaceId}:${pane.tmuxWindowName}`
    : pane.sessionId;
  const attentionReason = useAgentAttentionStore(
    (s) => s.panes.get(stablePaneId)?.reason ?? null,
  );

  return (
    <div
      className={cn(
        "terminal-pane relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background",
        maximizedId === id && "is-maximized",
        hasMultiplePanes && (effectiveActivePaneId === id ? "is-active-pane" : "is-inactive-pane"),
        attentionBorderClass(attentionReason),
      )}
    >
          <div
            className={cn(
              "terminal-pane-toolbar group/toolbar",
              toolbarExpanded && "is-toolbar-expanded",
            )}
            onMouseEnter={onToolbarMouseEnter}
            onMouseLeave={onToolbarMouseLeave}
          >
            <TerminalPaneDragHandle
              className="terminal-pane-toolbar-left"
              label={t("paneToolbar.dragHandle")}
            >
              {displayTitle ? (
                <TerminalTitleWithAgent
                  displayTitle={displayTitle}
                  primaryTitle={primaryTitle}
                  oscSuffix={oscSuffix}
                  toolbarAgent={toolbarAgent}
                  className="terminal-pane-title gap-1.5"
                />
              ) : null}
            </TerminalPaneDragHandle>

            <div className="terminal-pane-toolbar-end">
              <TerminalPaneAgentStatus paneId={stablePaneId} contextId={workspaceId} />
              {(actions.split || actions.maximize || actions.close) && (
              <div className="terminal-pane-toolbar-right">
                <button
                  type="button"
                  className={cn(
                    "terminal-pane-btn",
                    isPanePinned && "cursor-default text-primary hover:text-primary",
                  )}
                  onClick={() => {
                    if (isPanePinned) return;
                    void pinPaneToCanvas(id);
                  }}
                  title={isPanePinned ? t("paneToolbar.pinAlreadyPinned") : t("paneToolbar.pin")}
                  aria-disabled={isPanePinned}
                  aria-pressed={isPanePinned}
                >
                  <Pin size={12} className={cn(!isPanePinned && "rotate-45")} />
                </button>
                <div className="flex items-center gap-0.5">
                  {actions.split && (
                    <div className="flex items-center gap-0.5">
                      <DropdownMenu
                        open={splitMenuKey === `${id}:row`}
                        onOpenChange={(open) => setSplitMenuKey(open ? `${id}:row` : null)}
                        modal={false}
                      >
                        <DropdownMenuTrigger asChild>
                          <button
                            className="terminal-pane-btn"
                            onClick={() => onSplitPane(id, "row")}
                            onMouseEnter={() => handleSplitMenuEnter(`${id}:row`)}
                            onMouseLeave={handleSplitMenuLeave}
                            title={t("paneToolbar.splitHorizontal")}
                          >
                            <Columns size={12} />
                          </button>
                        </DropdownMenuTrigger>
                        {quickOpenAgents.length > 0 && (
                          <DropdownMenuContent
                            align="start"
                            onMouseEnter={() => handleSplitMenuEnter(`${id}:row`)}
                            onMouseLeave={handleSplitMenuLeave}
                            onCloseAutoFocus={(event) => event.preventDefault()}
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
                            className="terminal-pane-btn"
                            onClick={() => onSplitPane(id, "column")}
                            onMouseEnter={() => handleSplitMenuEnter(`${id}:column`)}
                            onMouseLeave={handleSplitMenuLeave}
                            title={t("paneToolbar.splitVertical")}
                          >
                            <Rows size={12} />
                          </button>
                        </DropdownMenuTrigger>
                        {quickOpenAgents.length > 0 && (
                          <DropdownMenuContent
                            align="start"
                            onMouseEnter={() => handleSplitMenuEnter(`${id}:column`)}
                            onMouseLeave={handleSplitMenuLeave}
                            onCloseAutoFocus={(event) => event.preventDefault()}
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
                    <div className="flex items-center gap-0.5">
                      {actions.maximize && (
                        <button
                          className={cn(
                            "terminal-pane-btn",
                            maximizedId === id && "text-primary",
                          )}
                          onClick={() => onToggleMaximize(id)}
                          title={maximizedId === id ? t("paneToolbar.restore") : t("paneToolbar.maximize")}
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
                          className="terminal-pane-btn terminal-pane-btn-close ml-1"
                          onClick={() => requestCloseTerminal(id)}
                          title={t("paneToolbar.close")}
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
          </div>

      <div
        className="terminal-pane-content min-h-0 flex-1"
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
          surfaceActive={surfaceActive}
          onAddSelectionAsContext={
            richInputActive
              ? (snapshot) => {
                  setActivePaneId(id);
                  agentInputOverlayRefsMap.current.get(id)?.addTerminalSelectionContext(snapshot);
                }
              : undefined
          }
          onStartSideChatForSelection={
            richInputActive
              ? (snapshot) => {
                  setActivePaneId(id);
                  agentInputOverlayRefsMap.current.get(id)?.startSideChatForTerminalSelection(snapshot);
                }
              : undefined
          }
          onTitleChange={(title) => {
            const detectedAgent = resolveAgentForTitle(title, configuredAgents, {
              contestedOwners,
            });
            setDynamicTitle(workspaceId, id, title);
            if (detectedAgent) {
              setPaneAgent(workspaceId, id, detectedAgent);
            }
          }}
          onOscTitleChange={(title) => {
            setOscTitle(workspaceId, id, title);
          }}
          onSessionReady={() => {
            readyPanesRef.current.add(id);
            setIsTerminalReady(true);
            markPaneAttached(workspaceId, id);
            if (pendingRunsRef.current.has(id)) {
              deliverPendingRunForPane(id);
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
          agent={agentForSubmit ?? null}
          stablePaneId={stablePaneId}
          getTerminalCursorClientPoint={() =>
            terminalRefsMap.current.get(id)?.getCursorClientPoint() ?? null
          }
          getSideChatFlyTargetClientPoint={getSideChatFlyTargetClientPoint}
          isTerminalReady={isTerminalReady}
          localPath={workspaceInfo?.localPath}
          skillsContext={skillsContext}
          surfaceActive={surfaceActive}
          onHide={() => {
            terminalRefsMap.current.get(id)?.focus();
          }}
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
    </div>
  );
}
