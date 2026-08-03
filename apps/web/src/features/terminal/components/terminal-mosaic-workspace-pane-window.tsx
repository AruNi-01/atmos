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
import { AgentAttentionIndicator, attentionBorderClass } from "@/features/agent/components/AgentAttentionIndicator";
import { AgentHookStatusIndicator } from "@/features/agent/components/AgentHookStatusIndicator";
import { buildCanvasTerminalPinKey } from "@/features/canvas/lib/canvas-terminal-shape";
import { useAgentAttentionStore } from "@/features/agent/store/agent-attention-store";
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
import { useToolbarHoverExpand } from "../hooks/use-toolbar-hover-expand";
import { useTerminalSideChats, type SpawnTerminalRequest } from "../hooks/use-terminal-side-chats";
import type { PendingTerminalRun } from "../lib/terminal-agent-run-delivery";
import { resolveTerminalAgentSubmitMode } from "../lib/terminal-runtime-utils";
import {
  getAgentContextDragText,
  hasAgentContextDragData,
} from "@/shared/lib/agent-context-drag";
import { useTerminalRichInputSettingsStore } from "@/features/settings/store/terminal-rich-input-settings-store";

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
  const attentionReason = useAgentAttentionStore((s) => s.panes.get(paneId)?.reason ?? null);

  if (paneState !== AGENT_STATE.IDLE) {
    return (
      <AgentHookStatusIndicator
        state={paneState}
        variant="full"
        className="shrink-0"
      />
    );
  }

  if (attentionReason) {
    return <AgentAttentionIndicator reason={attentionReason} className="shrink-0" size={14} />;
  }

  return null;
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
  pendingRunsRef: React.MutableRefObject<Map<string, PendingTerminalRun>>;
  deliverPendingRunForPane: (paneId: string) => void;
  markPaneAttached: (workspaceId: string, paneId: string, terminalTabId?: string) => void;
  spawnTerminalWithRun: (request: SpawnTerminalRequest) => void;
  /** False when host frame/tab is off-screen (warm keep-alive). */
  surfaceActive?: boolean;
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
    pendingRunsRef,
    deliverPendingRunForPane,
    markPaneAttached,
    spawnTerminalWithRun,
    surfaceActive = true,
  } = props;

  const { toolbarHovered, onToolbarMouseEnter, onToolbarMouseLeave } = useToolbarHoverExpand(400);
  const richInputActive = useTerminalRichInputSettingsStore(
    (s) => s.loaded && s.enabled,
  );
  const splitMenuOpenForPane =
    splitMenuKey === `${id}:row` || splitMenuKey === `${id}:column`;
  const toolbarExpanded =
    maximizedId === id || toolbarHovered || splitMenuOpenForPane;

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

  const { displayTitle, primaryTitle, oscSuffix, toolbarAgent, onTitleChange, onOscTitleChange } =
    useTerminalToolbarTitle({
      baseTitle: pane.label,
      configuredAgents,
      storeWrite,
      customLabel: pane.customLabel,
      keepAgentName: pane.keepAgentName,
      keepCwd: pane.keepCwd,
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
  const skillsContext = useMemo(() => {
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
      id: workspaceId,
      name: workspaceInfo.workspaceName || workspaceInfo.projectName || workspaceId,
      path: workspaceInfo.localPath,
    };
  }, [activeProject, isProjectContext, workspaceId, workspaceInfo]);
  const sideChatAgentOptions = useMemo(() => {
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
    startSpawn,
  } = useTerminalSideChats({
    workspaceId,
    projectId: activeProject?.id ?? null,
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
    onSpawnTerminal: spawnTerminalWithRun,
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

  const stablePaneId = pane.tmuxWindowName
    ? `${workspaceId}:${pane.tmuxWindowName}`
    : pane.sessionId;
  const attentionReason = useAgentAttentionStore(
    (s) => s.panes.get(stablePaneId)?.reason ?? null,
  );

  return (
    <MosaicWindow<string>
      path={path}
      title={displayTitle ?? ""}
      className={cn(
        maximizedId === id && "is-maximized",
        hasMultiplePanes && (effectiveActivePaneId === id ? "is-active-pane" : "is-inactive-pane"),
        attentionBorderClass(attentionReason),
      )}
      onDragStart={() => setIsPaneDragging(true)}
      onDragEnd={() => setIsPaneDragging(false)}
      renderToolbar={() => {
        return (
          <div
            className={cn(
              "terminal-mosaic-toolbar group/toolbar",
              toolbarExpanded && "is-toolbar-expanded",
            )}
            onMouseEnter={onToolbarMouseEnter}
            onMouseLeave={onToolbarMouseLeave}
          >
            <div className="terminal-mosaic-toolbar-left">
              {displayTitle ? (
                <TerminalTitleWithAgent
                  displayTitle={displayTitle}
                  primaryTitle={primaryTitle}
                  oscSuffix={oscSuffix}
                  toolbarAgent={toolbarAgent}
                  className="terminal-mosaic-title gap-1.5"
                />
              ) : null}
            </div>

            <div className="terminal-mosaic-toolbar-end">
              <TerminalPaneAgentStatus paneId={stablePaneId} contextId={workspaceId} />
              {(actions.split || actions.maximize || actions.close) && (
              <div className="terminal-mosaic-toolbar-right">
                <button
                  type="button"
                  className={cn(
                    "terminal-mosaic-btn",
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
                    <div className="flex items-center gap-0.5">
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
                    <div className="flex items-center gap-0.5">
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
          surfaceActive={surfaceActive}
          onTitleChange={onTitleChange}
          onOscTitleChange={onOscTitleChange}
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
          onSessionReady={() => {
            readyPanesRef.current.add(id);
            setIsTerminalReady(true);
            markPaneAttached(workspaceId, id, terminalTabId);
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
          getTerminalCursorClientPoint={() =>
            terminalRefsMap.current.get(id)?.getCursorClientPoint() ?? null
          }
          getSideChatFlyTargetClientPoint={getSideChatFlyTargetClientPoint}
          isTerminalReady={isTerminalReady}
          localPath={workspaceInfo?.localPath}
          skillsContext={skillsContext}
          onHide={() => {
            terminalRefsMap.current.get(id)?.focus();
          }}
          onStartSideChat={startSideChat}
          onSpawn={startSpawn}
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
