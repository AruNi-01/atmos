"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { Conversation, ConversationContent, cn } from "@workspace/ui";
import { Maximize2, Minimize2, Sparkles, X } from "lucide-react";
import "../md-live-agent-overlay.css";
import { AgentAuthDialog } from "@/features/agent/components/AgentAuthDialog";
import { AgentChatOwnSendRefsProvider } from "@/features/agent/components/agent-chat-own-send-context";
import { AgentChatCwdProvider } from "@/features/agent/components/agent-chat-cwd-context";
import { AgentChatTranscriptList } from "@/features/agent/components/AgentChatTranscriptList";
import { AgentActivityIndicator } from "@/features/agent/components/AgentActivityIndicator";
import {
  AgentPermissionCard,
  isPlanExitPermission,
  resolvePlanExitFilePath,
} from "@/features/agent/components/AgentPermissionCard";
import { AgentPromptComposer } from "@/features/agent/components/AgentPromptComposer";
import { AgentSessionOpCard } from "@/features/agent/components/AgentSessionOpCard";
import { SubagentOverlayProvider } from "@/features/agent/components/subagent-overlay-context";
import { useAgentChatSession } from "@/features/agent/hooks/use-agent-chat-session";
import { DEFAULT_AGENT_CHAT_MODE } from "@/features/agent/types/index";
import { AGENT_CHAT_SCROLL_CLASS } from "@/features/agent/lib/agent-chat-transcript-window";
import { prependMdLiveComposerContext } from "@/features/agent/lib/agent/active-composer";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { getRuntimeApiConfig, httpBase } from "@/shared/lib/desktop-runtime";
import { MD_LIVE_HIDE_SELECTION_TOOLBAR_EVENT, type MdLiveViewportRect } from "@atmos/md-live/ui";
import { getMdLiveEditor, subscribeMdLiveEditorEvents } from "../lib/md-live-editor-registry";
import { useMdLiveAgentBridge } from "../hooks/use-md-live-agent-bridge";
import { finishMdLiveEditReview } from "../lib/md-live-edit-host";
import { restoreAndUnlockMdLiveStream, useMdLiveStreamLocked } from "../lib/md-live-stream-lock";
import {
  MD_LIVE_AGENT_PANEL_CLASS,
  MD_LIVE_POPOVER_WIDTH,
  isMdLiveBarHoverZone,
  mdLiveAgentChatInstanceKey,
  mdLiveOverlayTitle,
  mdLiveRewritePrompt,
  mdLiveSelectionPopoverStyle,
  mdLiveSummarizePrompt,
  nextMdLiveBarMode,
  transformMdLivePrompt,
  type MdLiveAgentPlacement,
} from "../lib/md-live-agent-chat";

export function MdLiveAgentChat({
  filePath,
  scopeRef,
  className,
  chatId: chatIdProp = null,
}: {
  filePath: string;
  scopeRef?: RefObject<HTMLElement | null>;
  className?: string;
  chatId?: string | null;
}) {
  const t = useTranslations("mdLive");
  const instanceKey = mdLiveAgentChatInstanceKey(filePath);
  const chatId = chatIdProp || "";
  const [selectedSubagentId, setSelectedSubagentId] = useState<string | null>(null);
  const { clientId } = useMdLiveAgentBridge(filePath);
  const [invokeUrl, setInvokeUrl] = useState("");
  const [placement, setPlacement] = useState<MdLiveAgentPlacement>("bottom");
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [anchorRect, setAnchorRect] = useState<MdLiveViewportRect | null>(null);
  const selectionRef = useRef("");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const reviewPending = useMdLiveStreamLocked(filePath);

  useEffect(() => {
    void getRuntimeApiConfig().then((cfg) => {
      setInvokeUrl(`${httpBase(cfg)}/api/md-live/agent/invoke`);
    });
  }, []);

  const transformPrompt = useCallback(
    (prompt: string) =>
      transformMdLivePrompt({
        prompt,
        filePath,
        invokeUrl: invokeUrl || "/api/md-live/agent/invoke",
        clientId,
        selection: selectionRef.current,
      }),
    [clientId, filePath, invokeUrl],
  );

  const session = useAgentChatSession({
    variant: "sidebar",
    mode: DEFAULT_AGENT_CHAT_MODE,
    publishStatus: false,
    active: true,
    instanceKey,
    transformPrompt,
    chatId,
  });

  const working = session.agentActivity.busy;
  const handleSubmitRef = useRef(session.handleSubmit);
  handleSubmitRef.current = session.handleSubmit;
  const popover = placement === "popover";
  const barMode = nextMdLiveBarMode({
    popover,
    hover,
    focused,
    hasDraft,
    expanded: expanded && !popover,
    working,
  });
  const hasThread =
    session.messages.length > 0 ||
    working ||
    Boolean(session.pendingPermission) ||
    Boolean(session.pendingSessionOp);
  const showThread = (popover || barMode === "expanded") && hasThread;
  const showBar = popover || barMode !== "hidden";
  const canExpandThread = hasThread && !popover && !showThread;
  const hasComposerChrome = !showThread && (popover || reviewPending || working || canExpandThread);

  const openPopover = useCallback(
    (selection: string) => {
      selectionRef.current = selection;
      const rect = getMdLiveEditor(filePath)?.getSelectionViewportRect() ?? null;
      setAnchorRect(rect);
      setPlacement("popover");
      setExpanded(true);
      window.dispatchEvent(new Event(MD_LIVE_HIDE_SELECTION_TOOLBAR_EVENT));
    },
    [filePath],
  );

  const closePopover = useCallback(() => {
    setPlacement("bottom");
    if (!hasThread) setExpanded(false);
  }, [hasThread]);

  useEffect(() => {
    return subscribeMdLiveEditorEvents(filePath, (event) => {
      if (event.type === "stream-aborted") {
        restoreAndUnlockMdLiveStream(filePath, (content) => {
          useEditorStore.getState().updateFileContent(filePath, content);
        });
        return;
      }
      if (event.type !== "ai-action") return;
      openPopover(event.selection);
      window.setTimeout(() => {
        prependMdLiveComposerContext(instanceKey, filePath, event.selection);
        if (event.kind === "ask") return;
        const prompt = event.kind === "rewrite" ? mdLiveRewritePrompt() : mdLiveSummarizePrompt();
        void handleSubmitRef.current({ text: prompt });
      }, 40);
    });
  }, [filePath, instanceKey, openPopover]);

  useEffect(() => {
    if (!popover && !working) return;
    const tick = () => {
      const rect = getMdLiveEditor(filePath)?.getSelectionViewportRect();
      if (rect) setAnchorRect(rect);
    };
    tick();
    const id = window.setInterval(tick, 80);
    return () => window.clearInterval(id);
  }, [filePath, popover, working]);

  useEffect(() => {
    const host = scopeRef?.current;
    if (!host) return;
    const onMove = (event: PointerEvent) => {
      const box = host.getBoundingClientRect();
      const overBar = hostRef.current?.contains(event.target as Node) ?? false;
      setHover(overBar || isMdLiveBarHoverZone(event.clientY, box.bottom));
    };
    const onLeave = (event: PointerEvent) => {
      if (host.contains(event.relatedTarget as Node)) return;
      if (hostRef.current?.contains(event.relatedTarget as Node)) return;
      setHover(false);
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [scopeRef]);

  useEffect(() => {
    if (!popover) return;
    window.dispatchEvent(new Event(MD_LIVE_HIDE_SELECTION_TOOLBAR_EVENT));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePopover();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePopover, popover]);

  const popoverStyle = useMemo(() => {
    if (!anchorRect) return { bottom: 16, right: 16, left: "auto", top: "auto" } as const;
    const next = mdLiveSelectionPopoverStyle(anchorRect, MD_LIVE_POPOVER_WIDTH);
    return { top: next.top, left: next.left, right: "auto", bottom: "auto" } as const;
  }, [anchorRect]);

  const placeholder =
    working || session.messages.length > 0 ? t("followUpPlaceholder") : t("askPlaceholder");
  const sessionTitle = mdLiveOverlayTitle(session.displaySessionTitle, "");
  const chromeButtonClass =
    "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground";
  const chromePillClass =
    "inline-flex h-6 shrink-0 items-center rounded-full border bg-muted px-2 text-xs hover:bg-muted/80";

  const chrome = (
    <>
      {working && !popover ? (
        <button
          type="button"
          data-md-live-working-pill=""
          className={`${chromePillClass} gap-1 text-muted-foreground hover:text-foreground`}
          aria-label={t("expandChat")}
          onClick={() => setExpanded(true)}
        >
          <Sparkles className="size-3" />
          {t("working")}
        </button>
      ) : null}
      {canExpandThread && !working ? (
        <button
          type="button"
          data-md-live-expand=""
          className={chromeButtonClass}
          aria-label={t("expandChat")}
          onClick={() => setExpanded(true)}
        >
          <Maximize2 className="size-3.5" />
        </button>
      ) : null}
      {reviewPending ? (
        <>
          <button
            type="button"
            data-md-live-accept=""
            className={chromePillClass}
            onClick={() => finishMdLiveEditReview({ filePath, accept: true })}
          >
            {t("accept")}
          </button>
          <button
            type="button"
            data-md-live-reject=""
            className={chromePillClass}
            onClick={() =>
              finishMdLiveEditReview({
                filePath,
                accept: false,
                write: (content) => useEditorStore.getState().updateFileContent(filePath, content),
              })
            }
          >
            {t("reject")}
          </button>
        </>
      ) : null}
      {showThread ? (
        <button
          type="button"
          className={chromePillClass}
          aria-label={t("newChat")}
          onClick={() => void session.handleCreateNewSession()}
        >
          {t("newChat")}
        </button>
      ) : null}
      {showThread && !popover ? (
        <button
          type="button"
          data-md-live-minimize=""
          className={chromeButtonClass}
          aria-label={t("minimize")}
          onClick={() => setExpanded(false)}
        >
          <Minimize2 className="size-3.5" />
        </button>
      ) : null}
      {popover ? (
        <button
          type="button"
          className={chromeButtonClass}
          aria-label={t("closeChat")}
          onClick={closePopover}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </>
  );

  const panelHeader = showThread ? (
    <div
      data-md-live-agent-header=""
      className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5"
    >
      {sessionTitle ? (
        <span className="min-w-0 flex-1 truncate text-sm">{sessionTitle}</span>
      ) : (
        <span className="min-w-0 flex-1" />
      )}
      <div className="flex shrink-0 items-center gap-0.5">{chrome}</div>
    </div>
  ) : null;

  const thread = showThread ? (
    <div
      data-md-live-agent-thread=""
      className="flex min-h-[12rem] min-w-0 flex-1 flex-col overflow-hidden"
    >
      <AgentChatOwnSendRefsProvider>
        <AgentChatCwdProvider cwd={session.sessionCwd} projectOrWorkspacePath={session.localPath}>
          <Conversation className="min-h-0 flex-1 overflow-hidden" initial="smooth">
            <ConversationContent
              className="gap-3 px-3 py-3"
              scrollClassName={AGENT_CHAT_SCROLL_CLASS}
            >
              {session.messages.length > 0 ? (
                <AgentChatTranscriptList
                  messages={session.messages}
                  registryId={session.registryId}
                  transcriptRef={session.transcriptRef}
                  userMessageIndices={session.userMessageIndices}
                  onActiveUserMessage={session.setMessageNavIndex}
                  scrollToIndexRef={session.scrollToIndexRef}
                  activityStatus={
                    session.agentActivity.busy ? (
                      <AgentActivityIndicator
                        activity={session.agentActivity}
                        elapsedMs={session.elapsedMs}
                      />
                    ) : null
                  }
                />
              ) : null}
              <div ref={session.bottomRef} className="h-px" />
            </ConversationContent>
          </Conversation>
        </AgentChatCwdProvider>
      </AgentChatOwnSendRefsProvider>
    </div>
  ) : null;

  const composer = (
    <AgentPromptComposer
      currentPlan={session.currentPlan}
      isResumedSession={session.isResumedSession}
      backgroundTools={session.backgroundTools}
      subagentTasks={session.subagentTasks}
      grokGoal={session.grokGoal}
      grokWorkflow={session.grokWorkflow}
      queuedPrompts={session.queuedPrompts}
      onRemoveQueuedPrompt={session.removeQueuedAgentChatPrompt}
      onUpdateQueuedPrompt={(id, prompt) => session.updateQueuedAgentChatPrompt(id, { prompt })}
      onMoveQueuedPrompt={session.moveQueuedAgentChatPrompt}
      onSubmit={session.handleSubmit}
      canUseCurrentMode={session.canUseCurrentMode}
      isConnected={session.isConnected}
      chatMode={session.chatMode}
      instanceKey={instanceKey}
      sessionWorkspaceId={session.sessionWorkspaceId}
      sessionProjectId={session.sessionProjectId}
      loadingAgents={session.loadingAgents}
      isConnecting={session.isConnecting}
      isResumingHistory={session.isResumingHistory}
      chatId={session.chatId}
      runtimeStatus={session.runtimeStatus}
      hasPersistenceHandle={session.hasPersistenceHandle}
      installedAgents={session.installedAgents}
      configOptions={session.configOptions}
      modelsLocked={session.modelsLocked}
      modesLocked={session.modesLocked}
      registryId={session.registryId}
      activeAgent={session.activeAgent}
      setConfigOption={session.setConfigOption}
      agentActivity={session.agentActivity}
      sendCancel={session.sendCancel}
      setWaitingForResponse={session.setWaitingForResponse}
      setMessages={session.setMessages}
      stoppedRef={session.stoppedRef}
      projectPath={session.sessionCwd ?? session.localPath}
      sessionUsage={session.sessionUsage}
      messages={session.messages}
      placeholderOverride={placeholder}
      leadingChrome={hasComposerChrome ? chrome : null}
      promptClassName="bg-popover"
      onDraftChange={setHasDraft}
      aboveInputOverlay={
        session.pendingPermission || session.pendingSessionOp ? (
          <div className="min-h-0 w-full min-w-0 overflow-hidden">
            {session.pendingPermission ? (
              <AgentPermissionCard
                permission={session.pendingPermission}
                markdown={session.pendingPermissionMarkdown}
                planIntent={
                  isPlanExitPermission(session.pendingPermission) ? session.currentPlan : null
                }
                planFilePath={
                  isPlanExitPermission(session.pendingPermission)
                    ? resolvePlanExitFilePath(session.pendingPermission, session.messages)
                    : null
                }
                onRespond={session.handlePermission}
              />
            ) : session.pendingSessionOp ? (
              <AgentSessionOpCard
                request={session.pendingSessionOp}
                onRespond={session.handleSessionOp}
              />
            ) : null}
          </div>
        ) : null
      }
    />
  );

  return (
    <SubagentOverlayProvider selectedId={selectedSubagentId} onSelect={setSelectedSubagentId}>
      <div
        ref={hostRef}
        data-md-live-agent-chat=""
        data-md-live-agent-placement={placement}
        data-md-live-bar-mode={barMode}
        className={cn("pointer-events-none absolute inset-0 z-[60]", className)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (hostRef.current?.contains(event.relatedTarget as Node)) return;
          setFocused(false);
        }}
      >
        {popover ? (
          <div
            data-md-live-agent-popover=""
            className={cn(
              "pointer-events-auto absolute w-[min(100%,26.25rem)]",
              MD_LIVE_AGENT_PANEL_CLASS,
              showThread && "max-h-[min(70vh,32rem)] min-h-[min(48vh,20rem)]",
            )}
            style={{
              ...popoverStyle,
              position: "fixed",
              width: MD_LIVE_POPOVER_WIDTH,
              backgroundColor: "var(--popover)",
              color: "var(--popover-foreground)",
              transition: "top 180ms ease, left 180ms ease",
            }}
          >
            {panelHeader}
            {thread}
            {composer}
          </div>
        ) : showBar ? (
          <div
            data-md-live-agent-bar=""
            className={cn(
              "pointer-events-auto absolute inset-x-0 bottom-3 mx-auto w-[min(100%-1.5rem,42rem)]",
              MD_LIVE_AGENT_PANEL_CLASS,
              showThread && "max-h-[min(70vh,32rem)] min-h-[min(48vh,20rem)]",
            )}
            style={{
              backgroundColor: "var(--popover)",
              color: "var(--popover-foreground)",
            }}
          >
            {panelHeader}
            {thread}
            {composer}
          </div>
        ) : null}
      </div>
      <AgentAuthDialog
        authRequest={session.authRequest}
        clearAuthRequest={session.clearAuthRequest}
        selectedAuthMethodId={session.selectedAuthMethodId}
        setSelectedAuthMethodId={session.setSelectedAuthMethodId}
        startSession={session.startSession}
        refreshSelectedAgentAfterAuth={session.refreshSelectedAgentAfterAuth}
        isConnecting={session.isConnecting}
      />
    </SubagentOverlayProvider>
  );
}
