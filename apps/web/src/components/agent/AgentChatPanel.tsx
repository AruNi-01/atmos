"use client";

import React, { useCallback, useEffect, useRef } from "react";
import "streamdown/styles.css";
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Confirmation,
  ConfirmationActions,
  ConfirmationRequest,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageContent,
  Button,
  TextShimmer,
  ShineBorder,
  cn,
} from "@workspace/ui";
import { BookOpen, ChevronDown, ChevronUp, Loader2, MessageSquare } from "lucide-react";
import { useAgentChatLayout } from "@/hooks/use-agent-chat-layout";
import { getAssistantCopyText } from "@/lib/agent/thread";
import { DEFAULT_AGENT_CHAT_MODE, type AgentChatMode } from "@/types/agent-chat";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";
import { MessageCopyButton } from "./CopyButtons";
import { SessionUsageBadge, MessageTurnUsageBadge } from "./UsageBadges";
import { AgentActivityIndicator } from "./AgentActivityIndicator";
import { PermissionActionButton } from "./MessageQueueDock";
import { AssistantTurnView } from "./AssistantTurnView";
import { AgentPromptComposer } from "./AgentPromptComposer";
import { useAgentChatSession } from "./use-agent-chat-session";
import { AgentChatHeader } from "./AgentChatHeader";
import { AgentAuthDialog } from "./AgentAuthDialog";

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

interface AgentChatPanelProps {
  variant?: "modal" | "sidebar";
  mode?: AgentChatMode;
  publishStatus?: boolean;
}

export function AgentChatPanel({
  variant = "modal",
  mode = DEFAULT_AGENT_CHAT_MODE,
  publishStatus = variant === "modal",
}: AgentChatPanelProps = {}) {
  const session = useAgentChatSession({ variant, mode, publishStatus });

  // ---------------------------------------------------------------------------
  // Draggable & Resizable layout (UI-only, stays in component)
  // ---------------------------------------------------------------------------
  const { layout, updateLayout, loaded: layoutLoaded, loadLayout } = useAgentChatLayout();

  useEffect(() => {
    if (variant === "modal") {
      loadLayout();
    }
  }, [loadLayout, variant]);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const dragAbortController = useRef<AbortController | null>(null);
  const resizeState = useRef<{ startX: number; startY: number; origW: number; origH: number; origX: number; origY: number; edge: string } | null>(null);
  const resizeAbortController = useRef<AbortController | null>(null);

  const resolvePosition = useCallback(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const h = typeof window !== 'undefined' ? window.innerHeight : 1080;
    return {
      x: layout.x < 0 ? w - layout.width - 24 : layout.x,
      y: layout.y < 0 ? h - layout.height - 24 : layout.y,
    };
  }, [layout]);

  const clamp = useCallback((x: number, y: number, w: number, h: number) => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
    return {
      x: Math.max(0, Math.min(x, vw - w)),
      y: Math.max(0, Math.min(y, vh - h)),
    };
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, [role="button"], [data-radix-popper-content-wrapper]')) return;
    e.preventDefault();
    const pos = resolvePosition();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };

    const handleMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      const clamped = clamp(dragState.current.origX + dx, dragState.current.origY + dy, layout.width, layout.height);
      updateLayout({ x: clamped.x, y: clamped.y });
    };
    const handleUp = () => {
      dragState.current = null;
      dragAbortController.current?.abort();
      dragAbortController.current = null;
    };

    dragAbortController.current = new AbortController();
    const { signal } = dragAbortController.current;
    document.addEventListener('mousemove', handleMove, { signal });
    document.addEventListener('mouseup', handleUp, { signal });
  }, [resolvePosition, clamp, layout.width, layout.height, updateLayout]);

  const MIN_W = 320;
  const MIN_H = 300;
  const handleResizeStart = useCallback((edge: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = resolvePosition();
    resizeState.current = { startX: e.clientX, startY: e.clientY, origW: layout.width, origH: layout.height, origX: pos.x, origY: pos.y, edge };

    const handleMove = (ev: MouseEvent) => {
      if (!resizeState.current) return;
      const s = resizeState.current;
      const dx = ev.clientX - s.startX;
      const dy = ev.clientY - s.startY;
      let newW = s.origW;
      let newH = s.origH;
      let newX = s.origX;
      let newY = s.origY;

      if (s.edge.includes('e')) newW = Math.max(MIN_W, s.origW + dx);
      if (s.edge.includes('w')) { newW = Math.max(MIN_W, s.origW - dx); newX = s.origX + s.origW - newW; }
      if (s.edge.includes('s')) newH = Math.max(MIN_H, s.origH + dy);
      if (s.edge.includes('n')) { newH = Math.max(MIN_H, s.origH - dy); newY = s.origY + s.origH - newH; }

      const clamped = clamp(newX, newY, newW, newH);
      updateLayout({ width: newW, height: newH, x: clamped.x, y: clamped.y });
    };
    const handleUp = () => {
      resizeState.current = null;
      resizeAbortController.current?.abort();
      resizeAbortController.current = null;
    };

    resizeAbortController.current = new AbortController();
    const { signal } = resizeAbortController.current;
    document.addEventListener('mousemove', handleMove, { signal });
    document.addEventListener('mouseup', handleUp, { signal });
  }, [resolvePosition, clamp, layout.width, layout.height, updateLayout]);

  useEffect(() => {
    return () => {
      dragAbortController.current?.abort();
      dragAbortController.current = null;
      resizeAbortController.current?.abort();
      resizeAbortController.current = null;
    };
  }, []);

  useEffect(() => {
    const handleWindowResize = () => {
      if (layout.x < 0 && layout.y < 0) return;
      const clamped = clamp(layout.x, layout.y, layout.width, layout.height);
      if (clamped.x !== layout.x || clamped.y !== layout.y) {
        updateLayout(clamped);
      }
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [layout, clamp, updateLayout]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!session.isPanelOpen || (variant === "modal" && !layoutLoaded)) return null;

  const pos = variant === "modal" ? resolvePosition() : null;

  const {
    isConnected,
    isConnecting,
    error,
    sessionId,
    sessionCwd,
    entries,
    setEntries,
    currentPlan,
    pendingPermission,
    pendingPermissionMarkdown,
    agentActivity,
    setWaitingForResponse,
    stoppedRef,
    isResumingHistory,
    isResumedSession,
    isManualLoadingMessages,
    installedAgents,
    setInstalledAgents,
    activeAgent,
    registryId,
    defaultRegistryId,
    loadingAgents,
    configOptions,
    setConfigOption,
    setAgentDefaultConfig,
    sessionUsage,
    historyOpen,
    setHistoryOpen,
    historySessions,
    historyHasMore,
    historyLoading,
    historyCursor,
    loadHistorySessions,
    displaySessionTitle,
    sessionTitleSource,
    isAutoGeneratingTitle,
    shouldScrambleAutoTitle,
    setShouldScrambleAutoTitle,
    isEditingTitle,
    editingTitleValue,
    setEditingTitleValue,
    chatMode,
    localPath,
    wikiPath,
    sessionWorkspaceId,
    sessionProjectId,
    canUseCurrentMode,
    wikiAskAvailability,
    panelLabel,
    panelTitle,
    connectionPhaseLabel,
    queueKey,
    queuedPrompts,
    removeQueuedAgentChatPrompt,
    updateQueuedAgentChatPrompt,
    moveQueuedAgentChatPrompt,
    newSessionAgentsOpen,
    setNewSessionAgentsOpen,
    headerHovered,
    setHeaderHovered,
    bottomRef,
    conversationRef,
    titleInputRef,
    authRequest,
    selectedAuthMethodId,
    setSelectedAuthMethodId,
    clearAuthRequest,
    startSession,
    exportableMessages,
    userEntryIndices,
    messageNavIndex,
    handleSubmit,
    handleClose,
    handlePermission,
    handleCreateNewSession,
    handleSelectHistorySession,
    handleManualLoadMessages,
    handleStartEditTitle,
    handleFinishEditTitle,
    handleTitleKeyDown,
    handlePrevMessage,
    handleNextMessage,
    handleSetDefaultAgent,
    handleOpenNewSessionAgentsMenu,
    handleScheduleCloseNewSessionAgentsMenu,
    handleExportConversation,
    sendCancel,
  } = session;

  return (
    <div
      ref={panelRef}
      className={cn(
        "flex flex-col overflow-hidden bg-background",
        variant === "modal" && "fixed z-50 rounded-xl border border-border shadow-lg",
        variant === "sidebar" && "h-full min-h-0"
      )}
      style={variant === "modal" && pos
        ? { left: pos.x, top: pos.y, width: layout.width, height: layout.height }
        : undefined}
    >
      {variant === "modal" && (
        <>
          <div className="absolute -top-1 left-2 right-2 h-2 cursor-n-resize z-10" onMouseDown={handleResizeStart("n")} />
          <div className="absolute -bottom-1 left-2 right-2 h-2 cursor-s-resize z-10" onMouseDown={handleResizeStart("s")} />
          <div className="absolute -left-1 top-2 bottom-2 w-2 cursor-w-resize z-10" onMouseDown={handleResizeStart("w")} />
          <div className="absolute -right-1 top-2 bottom-2 w-2 cursor-e-resize z-10" onMouseDown={handleResizeStart("e")} />
          <div className="absolute -top-1 -left-1 h-3 w-3 cursor-nw-resize z-20" onMouseDown={handleResizeStart("nw")} />
          <div className="absolute -top-1 -right-1 h-3 w-3 cursor-ne-resize z-20" onMouseDown={handleResizeStart("ne")} />
          <div className="absolute -bottom-1 -left-1 h-3 w-3 cursor-sw-resize z-20" onMouseDown={handleResizeStart("sw")} />
          <div className="absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize z-20" onMouseDown={handleResizeStart("se")} />
        </>
      )}

      <AgentChatHeader
        variant={variant}
        handleDragStart={variant === "modal" ? handleDragStart : undefined}
        headerHovered={headerHovered}
        setHeaderHovered={setHeaderHovered}
        isConnected={isConnected}
        isConnecting={isConnecting}
        activeAgent={activeAgent}
        installedAgents={installedAgents}
        defaultRegistryId={defaultRegistryId}
        registryId={registryId}
        newSessionAgentsOpen={newSessionAgentsOpen}
        setNewSessionAgentsOpen={setNewSessionAgentsOpen}
        handleCreateNewSession={handleCreateNewSession}
        handleOpenNewSessionAgentsMenu={handleOpenNewSessionAgentsMenu}
        handleScheduleCloseNewSessionAgentsMenu={handleScheduleCloseNewSessionAgentsMenu}
        handleSetDefaultAgent={handleSetDefaultAgent}
        panelLabel={panelLabel}
        panelTitle={panelTitle}
        localPath={localPath}
        sessionCwd={sessionCwd}
        exportableMessages={exportableMessages}
        handleExportConversation={handleExportConversation}
        historyOpen={historyOpen}
        setHistoryOpen={setHistoryOpen}
        historySessions={historySessions}
        historyHasMore={historyHasMore}
        historyLoading={historyLoading}
        historyCursor={historyCursor}
        loadHistorySessions={loadHistorySessions}
        handleSelectHistorySession={handleSelectHistorySession}
        chatMode={chatMode}
        sessionWorkspaceId={sessionWorkspaceId}
        sessionProjectId={sessionProjectId}
        wikiPath={wikiPath}
        handleClose={handleClose}
        displaySessionTitle={displaySessionTitle}
        isAutoGeneratingTitle={isAutoGeneratingTitle}
        shouldScrambleAutoTitle={shouldScrambleAutoTitle}
        setShouldScrambleAutoTitle={setShouldScrambleAutoTitle}
        sessionTitleSource={sessionTitleSource}
        sessionId={sessionId}
        isEditingTitle={isEditingTitle}
        editingTitleValue={editingTitleValue}
        setEditingTitleValue={setEditingTitleValue}
        handleStartEditTitle={handleStartEditTitle}
        handleFinishEditTitle={handleFinishEditTitle}
        handleTitleKeyDown={handleTitleKeyDown}
        titleInputRef={titleInputRef}
      />

      <div ref={conversationRef} className="min-h-0 flex-1 overflow-hidden">
        <Conversation className="min-h-0 h-full overflow-hidden">
          <ConversationContent className="gap-3 p-4!">
            {((loadingAgents && !isConnected && !isConnecting) || isConnecting || isResumingHistory) && (
              <div className="flex items-center justify-center py-6">
                <TextShimmer duration={1.5}>
                  {loadingAgents && !isConnecting && !isResumingHistory
                    ? "Loading..."
                    : isResumingHistory
                      ? "Restoring session..."
                      : connectionPhaseLabel}
                </TextShimmer>
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {isConnected && entries.length === 0 && !isConnecting && !error && sessionId && isResumedSession && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleManualLoadMessages}
                  disabled={isManualLoadingMessages || isResumingHistory}
                  className="h-8 text-xs text-muted-foreground"
                >
                  {(isManualLoadingMessages || isResumingHistory) && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                  {isManualLoadingMessages || isResumingHistory ? "Loading messages..." : "Load messages"}
                </Button>
              </div>
            )}
            {!canUseCurrentMode && entries.length === 0 && !isConnecting && !error && (
              <ConversationEmptyState
                icon={<BookOpen className="size-12" />}
                title="Wiki Ask unavailable"
                description={wikiAskAvailability.reason ?? "Generate the project wiki first to use Wiki Ask."}
              />
            )}
            {canUseCurrentMode && isConnected && entries.length === 0 && !isConnecting && !error && (
              <ConversationEmptyState
                icon={
                  chatMode === "wiki_ask"
                    ? <BookOpen className="size-12" />
                    : <MessageSquare className="size-12" />
                }
                title={chatMode === "wiki_ask" ? "Ask your project wiki" : "Start a conversation"}
                description={
                  chatMode === "wiki_ask"
                    ? "Type a question about the generated wiki content"
                    : "Type a message below to begin chatting"
                }
              />
            )}
            {entries.map((entry, i) => (
              <div key={i} data-entry-index={i} className="w-full min-w-0">
                {entry.role === "user" ? (
                  <div className="group relative">
                    <MessageCopyButton
                      text={entry.content}
                      ariaLabel="Copy user message"
                      title="Copy message"
                      className="absolute right-1 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background/80 p-0 text-muted-foreground opacity-0 transition-all hover:text-foreground group-hover:opacity-100"
                    />
                    <Message from="user">
                      <MessageContent>
                        {entry.files && entry.files.length > 0 && (
                          <Attachments variant="inline" className="mb-2">
                            {entry.files.map((f) => (
                              <Attachment key={f.id} data={f}>
                                <AttachmentPreview />
                                <AttachmentRemove />
                              </Attachment>
                            ))}
                          </Attachments>
                        )}
                        <div className="whitespace-pre-wrap" style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}>{entry.content}</div>
                      </MessageContent>
                    </Message>
                  </div>
                ) : (
                  <Message from="assistant">
                    <MessageContent>
                      <AssistantTurnView entry={entry} registryId={registryId} />
                      {!entry.isStreaming && (
                        <div className="mt-2 flex items-center gap-2">
                          <MessageCopyButton
                            text={getAssistantCopyText(entry)}
                            ariaLabel="Copy current turn message"
                            title="Copy turn"
                            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          />
                          {entry.usage && (
                            <MessageTurnUsageBadge usage={entry.usage} />
                          )}
                        </div>
                      )}
                    </MessageContent>
                  </Message>
                )}
              </div>
            ))}
            {agentActivity.busy && (
              <AgentActivityIndicator activity={agentActivity} />
            )}
            <div ref={bottomRef} className="h-10" />
          </ConversationContent>
          <ConversationScrollButton className="group absolute right-3 bottom-1 left-auto z-10 inline-flex h-8 w-8 translate-x-0 items-center justify-center gap-0 overflow-hidden rounded-sm border border-dashed border-border/70 bg-background px-0 text-foreground shadow-md transition-[width,padding,gap] duration-300 ease-out [transform-origin:right_center] hover:w-24 hover:px-2 hover:gap-1">
            <span className="inline-flex size-4 shrink-0 items-center justify-center">
              <ChevronDown className="size-4" />
            </span>
            <span className="max-w-0 whitespace-nowrap text-[11px] text-foreground opacity-0 transition-[max-width,opacity] duration-300 ease-out group-hover:max-w-16 group-hover:opacity-100">
              Bottom
            </span>
          </ConversationScrollButton>
          {sessionUsage && (
            <SessionUsageBadge usage={sessionUsage} />
          )}
          {userEntryIndices.length >= 2 && (
            <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-0.5 rounded-sm border border-border/50 bg-background/80 py-1 shadow-sm backdrop-blur-sm dark:bg-background/60">
              <button
                type="button"
                onClick={handlePrevMessage}
                disabled={
                  userEntryIndices.length > 0 &&
                  userEntryIndices.indexOf(messageNavIndex) === 0
                }
                className="flex items-center justify-center rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                aria-label="Previous message"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMessage}
                disabled={
                  userEntryIndices.length > 0 &&
                  userEntryIndices.indexOf(messageNavIndex) >=
                  userEntryIndices.length - 1
                }
                className="flex items-center justify-center rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                aria-label="Next message"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
          )}
        </Conversation>
      </div>

      <div className="flex min-h-0 shrink flex-col overflow-y-auto overscroll-contain">
        {pendingPermission && (
          <div className="shrink-0 border-t border-border p-3">
            <Confirmation
              approval={{ id: pendingPermission.request_id }}
              state="approval-requested"
              className="relative overflow-hidden border-foreground/20 bg-background"
            >
              <ShineBorder
                duration={7}
                borderWidth={1}
                shineColor={["#d97706", "#b45309"]}
              />
              <ConfirmationRequest>
                <span className="font-medium text-amber-500">Permission requested</span>
                <p className="mt-1 text-sm text-muted-foreground break-all max-w-full">
                  {pendingPermission.description}
                </p>
                {pendingPermissionMarkdown ? (
                  <div className="mt-2 min-w-0 max-w-full overflow-hidden rounded-md border border-border bg-muted/20">
                    <div className="max-h-[45vh] min-w-0 max-w-full overflow-auto px-3 py-1.5 text-sm">
                      <MarkdownRenderer className="prose-sm min-w-0 max-w-full overflow-hidden [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_.not-prose]:max-w-full [&_.not-prose]:overflow-x-auto">
                      {pendingPermissionMarkdown}
                      </MarkdownRenderer>
                    </div>
                  </div>
                ) : null}
              </ConfirmationRequest>
              <ConfirmationActions className="mt-1 w-full min-w-0 flex-nowrap justify-start self-stretch overflow-hidden">
                {pendingPermission.options.length > 0 ? (
                  pendingPermission.options.map((opt) => (
                    <PermissionActionButton
                      key={opt.option_id}
                      label={opt.name}
                      variant={opt.kind.startsWith("allow") ? "default" : "outline"}
                      onClick={() => handlePermission(opt.kind)}
                    />
                  ))
                ) : (
                  <>
                    <PermissionActionButton
                      label="Deny"
                      variant="outline"
                      onClick={() => handlePermission("reject_once")}
                    />
                    <PermissionActionButton
                      label="Allow"
                      onClick={() => handlePermission("allow_once")}
                    />
                  </>
                )}
              </ConfirmationActions>
            </Confirmation>
          </div>
        )}

        <AgentPromptComposer
          key={queueKey}
          currentPlan={currentPlan}
          isResumedSession={isResumedSession}
          queuedPrompts={queuedPrompts}
          onRemoveQueuedPrompt={removeQueuedAgentChatPrompt}
          onUpdateQueuedPrompt={(id, prompt) => updateQueuedAgentChatPrompt(id, { prompt })}
          onMoveQueuedPrompt={moveQueuedAgentChatPrompt}
          onSubmit={handleSubmit}
          canUseCurrentMode={canUseCurrentMode}
          wikiAskAvailability={wikiAskAvailability}
          isConnected={isConnected}
          chatMode={chatMode}
          sessionWorkspaceId={sessionWorkspaceId}
          sessionProjectId={sessionProjectId}
          loadingAgents={loadingAgents}
          isConnecting={isConnecting}
          isResumingHistory={isResumingHistory}
          installedAgents={installedAgents}
          configOptions={configOptions}
          registryId={registryId}
          activeAgent={activeAgent}
          setConfigOption={setConfigOption}
          setAgentDefaultConfig={setAgentDefaultConfig}
          setInstalledAgents={setInstalledAgents}
          agentActivity={agentActivity}
          sendCancel={sendCancel}
          setWaitingForResponse={setWaitingForResponse}
          setEntries={setEntries}
          stoppedRef={stoppedRef}
        />
      </div>
      <AgentAuthDialog
        authRequest={authRequest}
        clearAuthRequest={clearAuthRequest}
        selectedAuthMethodId={selectedAuthMethodId}
        setSelectedAuthMethodId={setSelectedAuthMethodId}
        startSession={startSession}
        isConnecting={isConnecting}
      />
    </div>
  );
}
