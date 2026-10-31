"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import {
  ActivityIndicator,
  ActivityIndicatorGroup,
  Conversation,
  ConversationContent,
  cn,
  pickActivityIndicatorStyle,
} from "@workspace/ui";
import { Minimize2, Pin, Plus } from "lucide-react";
import "../md-live-agent-overlay.css";
import { AgentAuthDialog } from "@/features/agent/components/AgentAuthDialog";
import { AgentChatOwnSendRefsProvider } from "@/features/agent/components/agent-chat-own-send-context";
import { AgentChatCwdProvider } from "@/features/agent/components/agent-chat-cwd-context";
import { AgentChatEdgeFades } from "@/features/agent/components/AgentChatEdgeFades";
import { AgentChatTranscriptList } from "@/features/agent/components/AgentChatTranscriptList";
import {
  AgentActivityIndicator,
  AgentActivityStatusText,
} from "@/features/agent/components/AgentActivityIndicator";
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
import { formatWorkDuration } from "@/features/agent/lib/agent-chat-timing";
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
  MD_LIVE_AGENT_CHAT_SOURCE,
  MD_LIVE_AGENT_PANEL_CLASS,
  MD_LIVE_AGENT_STACK_CLASS,
  MD_LIVE_AGENT_THREAD_MAX_CLASS,
  MD_LIVE_BAR_MORPH_S,
  MD_LIVE_INVITE_HAIRLINE_HEIGHT_PX,
  MD_LIVE_INVITE_HAIRLINE_WIDTH_PX,
  MD_LIVE_INVITE_LAYOUT_ID,
  MD_LIVE_POPOVER_WIDTH,
  isMdLiveAgentOverlayDismissTarget,
  isMdLiveBarHoverZone,
  mdLiveAgentChatInstanceKey,
  mdLiveOverlayTitle,
  mdLiveRewritePrompt,
  mdLiveSelectionPopoverStyle,
  mdLiveBarSurface,
  mdLiveIdleWorkedMs,
  mdLiveInviteMorphs,
  mdLiveShowThreadCard,
  mdLiveShowWorkingPill,
  mdLiveSummarizePrompt,
  nextMdLiveBarMode,
  transformMdLivePrompt,
  type MdLiveAgentPlacement,
} from "../lib/md-live-agent-chat";

const BAR_EASE = [0.22, 1, 0.36, 1] as const;

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
  const chatPanelT = useTranslations("Agent.components.chatPanel");
  const reduceMotion = Boolean(useReducedMotion());
  const barMorphMotion = reduceMotion
    ? { duration: 0 }
    : { duration: MD_LIVE_BAR_MORPH_S, ease: BAR_EASE };
  const instanceKey = mdLiveAgentChatInstanceKey(filePath);
  const chatId = chatIdProp || "";
  const [selectedSubagentId, setSelectedSubagentId] = useState<string | null>(null);
  const { clientId } = useMdLiveAgentBridge(filePath);
  const [invokeUrl, setInvokeUrl] = useState("");
  const [placement, setPlacement] = useState<MdLiveAgentPlacement>("bottom");
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [anchorRect, setAnchorRect] = useState<MdLiveViewportRect | null>(null);
  const [workingGlyphStyle] = useState(() =>
    pickActivityIndicatorStyle([ActivityIndicatorGroup.Lattice]),
  );
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
    chatSource: MD_LIVE_AGENT_CHAT_SOURCE,
    transformPrompt,
    chatId,
  });

  const working = session.agentActivity.busy;
  const handleSubmitRef = useRef(session.handleSubmit);
  handleSubmitRef.current = session.handleSubmit;
  const popover = placement === "popover";
  const hasThread =
    session.messages.length > 0 ||
    working ||
    Boolean(session.pendingPermission) ||
    Boolean(session.pendingSessionOp);
  const barMode = nextMdLiveBarMode({
    popover,
    hover,
    focused,
    hasDraft,
    expanded: expanded && !popover,
    working,
    hasThread,
    reviewPending,
  });
  const barSurface = mdLiveBarSurface(barMode, popover);
  const showInvite = barSurface === "invite";
  const showComposer = barSurface === "composer";
  const showThreadCard = mdLiveShowThreadCard({
    popover,
    barExpanded: barMode === "expanded",
    messageCount: session.messages.length,
  });
  const showWorkingPill = mdLiveShowWorkingPill({
    showThreadCard,
    busy: working,
    messageCount: session.messages.length,
  });
  const hasComposerChrome = !showThreadCard && (reviewPending || showWorkingPill);
  const morphEntry = mdLiveInviteMorphs(barSurface, {
    showThreadCard,
    hasComposerChrome,
  });
  const idleWorkedMs = mdLiveIdleWorkedMs(session.elapsedMs, session.messages);

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

  const minimizeToBar = useCallback(() => {
    setPlacement("bottom");
    setExpanded(false);
  }, []);

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
      if (event.key === "Escape") minimizeToBar();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (pinned) return;
      if (!isMdLiveAgentOverlayDismissTarget(event.target, hostRef.current)) return;
      minimizeToBar();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [minimizeToBar, pinned, popover]);

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

  const expandThread = useCallback(() => {
    setPlacement("bottom");
    setExpanded(true);
    setFocused(true);
  }, []);

  useEffect(() => {
    if (!showComposer) return;
    const root = hostRef.current;
    if (!root) return;
    const id = window.requestAnimationFrame(() => {
      root
        .querySelector<HTMLElement>(
          "[data-prompt-input] [contenteditable], [data-prompt-input] textarea",
        )
        ?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [showComposer]);

  const barChrome = (
    <>
      {showWorkingPill ? (
        <button
          type="button"
          data-md-live-working-pill=""
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-2.5 text-muted-foreground shadow-sm hover:text-foreground"
          aria-label={t("expandChat")}
          onClick={expandThread}
        >
          {session.agentActivity.busy ? (
            <>
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                <ActivityIndicator
                  style={session.agentActivity.kind === "thinking" ? "stars" : workingGlyphStyle}
                  size={14}
                />
              </span>
              <AgentActivityStatusText activity={session.agentActivity} />
            </>
          ) : (
            <span className="text-xs whitespace-nowrap">
              {chatPanelT("workedFor", { duration: formatWorkDuration(idleWorkedMs) })}
            </span>
          )}
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
    </>
  );

  const panelHeader = showThreadCard ? (
    <div
      data-md-live-agent-header=""
      className="sticky top-0 z-10 flex shrink-0 items-center gap-1.5 bg-popover px-3 py-1.5"
    >
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          data-md-live-minimize=""
          className={chromeButtonClass}
          aria-label={t("minimize")}
          onClick={popover ? minimizeToBar : () => setExpanded(false)}
        >
          <Minimize2 className="size-3.5" />
        </button>
        {popover ? (
          <button
            type="button"
            data-md-live-pin=""
            className={cn(chromeButtonClass, pinned && "text-foreground")}
            aria-label={pinned ? t("unpin") : t("pin")}
            aria-pressed={pinned}
            onClick={() => setPinned((current) => !current)}
          >
            <Pin className={cn("size-3.5", pinned && "fill-current")} />
          </button>
        ) : null}
      </div>
      {sessionTitle ? (
        <span className="min-w-0 flex-1 truncate text-sm">{sessionTitle}</span>
      ) : (
        <span className="min-w-0 flex-1" />
      )}
      <button
        type="button"
        data-md-live-new-session=""
        className={chromeButtonClass}
        aria-label={t("newChat")}
        onClick={() => void session.handleCreateNewSession()}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  ) : null;

  const thread = showThreadCard ? (
    <div
      ref={session.transcriptRef}
      data-md-live-agent-thread=""
      className="relative min-h-0 min-w-0 overflow-hidden"
    >
      <AgentChatOwnSendRefsProvider>
        <AgentChatCwdProvider cwd={session.sessionCwd} projectOrWorkspacePath={session.localPath}>
          <Conversation
            className="max-h-[min(62vh,28rem)] min-h-0 overflow-hidden"
            initial="smooth"
          >
            <ConversationContent
              className="gap-3 px-3 py-3"
              scrollClassName={AGENT_CHAT_SCROLL_CLASS}
            >
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
              <div ref={session.bottomRef} className="h-px" />
            </ConversationContent>
          </Conversation>
        </AgentChatCwdProvider>
      </AgentChatOwnSendRefsProvider>
      <AgentChatEdgeFades
        rootRef={session.transcriptRef}
        resetKey={session.chatId || instanceKey}
      />
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
      catalogModelsLoading={session.catalogModelsLoading}
      catalogModelsReloading={session.catalogModelsReloading}
      onEmptyModelsOpen={session.refreshEmptyCatalog}
      onLoadModels={session.reloadEmptyCatalog}
      onProviderChange={session.setProviderId}
      authRequiredAgentIds={session.authRequiredAgentIds}
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

  const overlayLayers = (
    <>
      {showThreadCard ? (
        <div
          data-md-live-agent-thread-card=""
          className={cn(MD_LIVE_AGENT_PANEL_CLASS, MD_LIVE_AGENT_THREAD_MAX_CLASS)}
        >
          {panelHeader}
          {thread}
        </div>
      ) : hasComposerChrome ? (
        <div
          data-md-live-agent-chrome=""
          className="flex min-h-6 min-w-0 flex-wrap items-center gap-1.5 px-1"
        >
          {barChrome}
        </div>
      ) : null}
      {showComposer ? composer : null}
    </>
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
          if (hasDraft || working || reviewPending || session.messages.length > 0) return;
          setExpanded(false);
        }}
      >
        {popover ? (
          <div
            data-md-live-agent-popover=""
            className={cn(
              "pointer-events-auto absolute w-[min(100%,26.25rem)]",
              MD_LIVE_AGENT_STACK_CLASS,
            )}
            style={{
              ...popoverStyle,
              position: "fixed",
              width: MD_LIVE_POPOVER_WIDTH,
              transition: "top 180ms ease, left 180ms ease",
            }}
          >
            {overlayLayers}
          </div>
        ) : (
          <LayoutGroup id={`${instanceKey}:invite`}>
            <div
              data-md-live-agent-bar=""
              className={cn(
                "pointer-events-none absolute inset-x-0",
                morphEntry
                  ? "bottom-0 w-full"
                  : cn("bottom-3 mx-auto w-[min(100%-1.5rem,42rem)]", MD_LIVE_AGENT_STACK_CLASS),
              )}
            >
              {morphEntry && barSurface === "hidden" ? (
                <div className="flex justify-center pb-3">
                  <motion.div
                    layout
                    layoutId={MD_LIVE_INVITE_LAYOUT_ID}
                    data-md-live-invite-hairline=""
                    className="max-w-[calc(100%-1.5rem)] rounded-full"
                    style={{
                      width: MD_LIVE_INVITE_HAIRLINE_WIDTH_PX,
                      height: MD_LIVE_INVITE_HAIRLINE_HEIGHT_PX,
                    }}
                    transition={barMorphMotion}
                  />
                </div>
              ) : morphEntry && showInvite ? (
                <div className="flex justify-center pb-3">
                  <motion.button
                    type="button"
                    layout
                    layoutId={MD_LIVE_INVITE_LAYOUT_ID}
                    data-md-live-message-agent=""
                    className="pointer-events-auto inline-flex h-9 items-center rounded-full border border-border/70 px-4 text-sm text-muted-foreground shadow-sm hover:text-foreground"
                    transition={barMorphMotion}
                    onClick={expandThread}
                  >
                    {t("messageAgent")}
                  </motion.button>
                </div>
              ) : morphEntry && showComposer ? (
                <motion.div
                  layout
                  layoutId={MD_LIVE_INVITE_LAYOUT_ID}
                  className="pointer-events-auto mx-auto mb-3 w-[min(100%-1.5rem,42rem)] overflow-hidden rounded-2xl"
                  transition={barMorphMotion}
                >
                  {composer}
                </motion.div>
              ) : (
                <div className="pointer-events-auto">{overlayLayers}</div>
              )}
            </div>
          </LayoutGroup>
        )}
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
