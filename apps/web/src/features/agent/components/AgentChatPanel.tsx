"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
  ShineBorder,
  cn,
} from "@workspace/ui";
import { ChevronDown, Loader2, MessageSquare, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAgentChatLayoutStore } from "@/features/agent/store/agent-chat-layout-store";
import { getAssistantCopyText, type ThreadEntry } from "@/features/agent/lib/agent/thread";
import { DEFAULT_AGENT_CHAT_MODE, type AgentChatMode } from "@/features/agent/types/index";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import { MessageCopyButton } from "./CopyButtons";
import { SessionUsageBadge, MessageTurnUsageBadge } from "./UsageBadges";
import { AgentActivityIndicator } from "./AgentActivityIndicator";
import { PermissionActionButton } from "./MessageQueueDock";
import { AssistantTurnView } from "./AssistantTurnView";
import { AgentPromptComposer } from "./AgentPromptComposer";
import { useAgentChatSession } from "../hooks/use-agent-chat-session";
import type { UseAgentChatSessionOptions } from "../hooks/use-agent-chat-session-types";
import { AgentChatHeader } from "./AgentChatHeader";
import { AgentAuthDialog } from "./AgentAuthDialog";
import { AgentMessageTimelineNav } from "./AgentMessageTimelineNav";
import { AgentChatHistorySidebar } from "./AgentChatHistorySidebar";
import { openAgentChatWindow } from "../lib/desktop-agent-chat-window";

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

interface AgentChatPanelProps {
  variant?: "modal" | "sidebar" | "standalone";
  mode?: AgentChatMode;
  publishStatus?: boolean;
  active?: boolean;
  allowFullscreen?: boolean;
  contextOverride?: UseAgentChatSessionOptions["contextOverride"];
  transformPrompt?: (prompt: string) => string;
}

const WIDE_HISTORY_LAYOUT_MIN_WIDTH = 900;
const HISTORY_SIDEBAR_DEFAULT_WIDTH = 320;
const HISTORY_SIDEBAR_MIN_WIDTH = 248;
const HISTORY_SIDEBAR_MAX_WIDTH = 440;
const HISTORY_SIDEBAR_WIDTH_STORAGE_KEY = "atmos:agent-chat-history-sidebar-width";
const HISTORY_SIDEBAR_COLLAPSED_STORAGE_KEY = "atmos:agent-chat-history-sidebar-collapsed";

export function AgentChatPanel({
  variant = "modal",
  mode = DEFAULT_AGENT_CHAT_MODE,
  publishStatus = variant === "modal",
  active = true,
  allowFullscreen,
  contextOverride,
  transformPrompt,
}: AgentChatPanelProps = {}) {
  const canFullscreen = variant !== "standalone" && (allowFullscreen ?? true);
  const [fullscreenRequested, setFullscreenRequested] = useState(false);
  const isFullscreen = canFullscreen && fullscreenRequested;
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  const showsWideHistoryLayout = panelWidth >= WIDE_HISTORY_LAYOUT_MIN_WIDTH;
  const [historySidebarWidth, setHistorySidebarWidth] = useState(readStoredHistorySidebarWidth);
  const [historySidebarCollapsed, setHistorySidebarCollapsed] = useState(readStoredHistorySidebarCollapsed);

  const session = useAgentChatSession({
    variant,
    mode,
    publishStatus,
    active,
    historyListActive: showsWideHistoryLayout,
    contextOverride,
    transformPrompt,
  });

  // ---------------------------------------------------------------------------
  // Draggable & Resizable layout (UI-only, stays in component)
  // ---------------------------------------------------------------------------
  const { layout, updateLayout, loaded: layoutLoaded, loadLayout } = useAgentChatLayoutStore();

  useEffect(() => {
    if (!session.isPanelOpen) {
      setFullscreenRequested(false);
    }
  }, [session.isPanelOpen]);

  useEffect(() => {
    if (variant === "modal") {
      loadLayout();
    }
  }, [loadLayout, variant]);

  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const dragAbortController = useRef<AbortController | null>(null);
  const resizeState = useRef<{ startX: number; startY: number; origW: number; origH: number; origX: number; origY: number; edge: string } | null>(null);
  const resizeAbortController = useRef<AbortController | null>(null);
  const historySidebarFrameRef = useRef<HTMLDivElement>(null);
  const historyResizeState = useRef<{
    startX: number;
    startWidth: number;
    currentWidth: number;
    frame: HTMLDivElement | null;
  } | null>(null);
  const historyResizeAbortController = useRef<AbortController | null>(null);
  const historyResizeAnimationFrame = useRef<number | null>(null);
  const [isHistorySidebarResizing, setIsHistorySidebarResizing] = useState(false);

  const shouldMeasurePanel = session.isPanelOpen && (variant !== "modal" || layoutLoaded);

  useEffect(() => {
    if (!shouldMeasurePanel) {
      setPanelWidth(0);
      return;
    }

    const node = panelRef.current;
    if (!node) {
      setPanelWidth(0);
      return;
    }

    const updateWidth = (width = node.getBoundingClientRect().width) => {
      const nextWidth = Math.round(width);
      setPanelWidth((current) => (current === nextWidth ? current : nextWidth));
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      const handleWindowResize = () => updateWidth();
      window.addEventListener("resize", handleWindowResize);
      return () => window.removeEventListener("resize", handleWindowResize);
    }

    const observer = new ResizeObserver((entries) => {
      updateWidth(entries[0]?.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldMeasurePanel]);

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

  const clampHistorySidebarWidth = useCallback((width: number) => {
    const panelBoundedMax = panelWidth > 0
      ? Math.max(HISTORY_SIDEBAR_MIN_WIDTH, Math.min(HISTORY_SIDEBAR_MAX_WIDTH, panelWidth - 520))
      : HISTORY_SIDEBAR_MAX_WIDTH;
    return Math.round(Math.min(panelBoundedMax, Math.max(HISTORY_SIDEBAR_MIN_WIDTH, width)));
  }, [panelWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HISTORY_SIDEBAR_WIDTH_STORAGE_KEY, String(historySidebarWidth));
  }, [historySidebarWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      HISTORY_SIDEBAR_COLLAPSED_STORAGE_KEY,
      historySidebarCollapsed ? "true" : "false",
    );
  }, [historySidebarCollapsed]);

  useEffect(() => {
    setHistorySidebarWidth((current) => clampHistorySidebarWidth(current));
  }, [clampHistorySidebarWidth]);

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

  const handleHistorySidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const frame = historySidebarFrameRef.current;
    const startWidth = clampHistorySidebarWidth(
      frame?.getBoundingClientRect().width ?? historySidebarWidth,
    );
    historyResizeState.current = {
      startX: e.clientX,
      startWidth,
      currentWidth: startWidth,
      frame,
    };
    setIsHistorySidebarResizing(true);
    if (frame) {
      frame.style.width = `${startWidth}px`;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    let restoredDocumentInteraction = false;
    const restoreDocumentInteraction = () => {
      if (restoredDocumentInteraction) return;
      restoredDocumentInteraction = true;
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };

    const handleMove = (ev: MouseEvent) => {
      const state = historyResizeState.current;
      if (!state) return;
      const dx = ev.clientX - state.startX;
      state.currentWidth = clampHistorySidebarWidth(state.startWidth + dx);
      if (historyResizeAnimationFrame.current !== null) return;

      historyResizeAnimationFrame.current = window.requestAnimationFrame(() => {
        historyResizeAnimationFrame.current = null;
        const latestState = historyResizeState.current;
        if (!latestState?.frame) return;
        latestState.frame.style.width = `${latestState.currentWidth}px`;
      });
    };

    const handleUp = () => {
      const finalWidth = historyResizeState.current?.currentWidth ?? historySidebarWidth;
      if (historyResizeAnimationFrame.current !== null) {
        window.cancelAnimationFrame(historyResizeAnimationFrame.current);
        historyResizeAnimationFrame.current = null;
      }
      if (historyResizeState.current?.frame) {
        historyResizeState.current.frame.style.width = `${finalWidth}px`;
      }
      historyResizeState.current = null;
      setHistorySidebarWidth(finalWidth);
      setIsHistorySidebarResizing(false);
      restoreDocumentInteraction();
      historyResizeAbortController.current?.abort();
      historyResizeAbortController.current = null;
    };

    historyResizeAbortController.current = new AbortController();
    const { signal } = historyResizeAbortController.current;
    signal.addEventListener("abort", restoreDocumentInteraction, { once: true });
    document.addEventListener("mousemove", handleMove, { signal });
    document.addEventListener("mouseup", handleUp, { signal });
  }, [clampHistorySidebarWidth, historySidebarWidth]);

  useEffect(() => {
    return () => {
      dragAbortController.current?.abort();
      dragAbortController.current = null;
      resizeAbortController.current?.abort();
      resizeAbortController.current = null;
      if (historyResizeAnimationFrame.current !== null) {
        window.cancelAnimationFrame(historyResizeAnimationFrame.current);
        historyResizeAnimationFrame.current = null;
      }
      historyResizeAbortController.current?.abort();
      historyResizeAbortController.current = null;
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

  const pos = variant === "modal" ? resolvePosition() : null;

  const {
    isConnected,
    isConnecting,
    error,
    sessionId,
    acpSessionId,
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
    installedAgents,
    setInstalledAgents,
    activeAgent,
    registryId,
    defaultRegistryId,
    loadingAgents,
    agentInfo,
    capabilities,
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
    historyResumeUnsupportedReason,
    historyUnsupportedReason,
    loadHistorySessions,
    displaySessionTitle,
    sessionTitleSource,
    isAutoGeneratingTitle,
    shouldScrambleAutoTitle,
    setShouldScrambleAutoTitle,
    chatMode,
    localPath,
    sessionWorkspaceId,
    sessionProjectId,
    canUseCurrentMode,
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
    handleLogoutAgent,
    handlePermission,
    handleCreateNewSession,
    handleSelectHistorySession,
    handleSelectMessage,
    handleSetDefaultAgent,
    handleOpenNewSessionAgentsMenu,
    handleScheduleCloseNewSessionAgentsMenu,
    handleExportConversation,
    sendCancel,
  } = session;

  const handleToggleFullscreen = useCallback(() => {
    setFullscreenRequested((current) => !current);
  }, []);

  const handleClosePanel = useCallback(() => {
    setFullscreenRequested(false);
    handleClose();
  }, [handleClose]);

  const handleOpenStandaloneWindow = useCallback(async () => {
    await openAgentChatWindow({
      agent: registryId || defaultRegistryId || null,
      session: acpSessionId,
      sessionCwd: sessionCwd ?? localPath,
      workspaceId: sessionWorkspaceId,
      projectId: sessionProjectId,
    });
    if (variant === "modal") {
      handleClosePanel();
    }
  }, [
    acpSessionId,
    defaultRegistryId,
    handleClosePanel,
    localPath,
    registryId,
    sessionCwd,
    sessionProjectId,
    sessionWorkspaceId,
    variant,
  ]);

  const historySidebarToggle = (
    <button
      type="button"
      onClick={() => setHistorySidebarCollapsed((current) => !current)}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={historySidebarCollapsed ? "Expand history sidebar" : "Hide history sidebar"}
      title={historySidebarCollapsed ? "Expand history sidebar" : "Hide history sidebar"}
    >
      {historySidebarCollapsed ? (
        <PanelLeftOpen className="size-[18px]" />
      ) : (
        <PanelLeftClose className="size-[18px]" />
      )}
    </button>
  );
  const wideContentClassName = showsWideHistoryLayout
    ? "mx-auto w-full max-w-4xl"
    : "w-full";
  const floatingControlRailClassName = showsWideHistoryLayout
    ? "left-1/2 w-full max-w-4xl -translate-x-1/2 px-3"
    : "inset-x-0 px-3";
  const wasResumingHistoryRef = useRef(false);

  useEffect(() => {
    if (isResumingHistory) {
      wasResumingHistoryRef.current = true;
      return;
    }

    if (!wasResumingHistoryRef.current || entries.length === 0) return;
    wasResumingHistoryRef.current = false;

    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) {
        window.cancelAnimationFrame(secondFrame);
      }
    };
  }, [bottomRef, entries.length, isResumingHistory]);

  if (!session.isPanelOpen || (variant === "modal" && !layoutLoaded)) return null;

  return (
    <div
      ref={panelRef}
      className={cn(
        "relative flex overflow-hidden bg-background",
        showsWideHistoryLayout && "bg-muted/20",
        !showsWideHistoryLayout && "flex-col",
        variant === "modal" && !isFullscreen && "fixed z-50 rounded-xl border border-border shadow-lg",
        variant === "sidebar" && !isFullscreen && "h-full min-h-0",
        variant === "standalone" && "h-dvh min-h-0 w-full",
        isFullscreen && "fixed inset-0 z-50 h-dvh w-full"
      )}
      style={variant === "modal" && pos && !isFullscreen
        ? { left: pos.x, top: pos.y, width: layout.width, height: layout.height, opacity: layout.opacity / 100 }
        : undefined}
    >
      {variant === "modal" && !isFullscreen && (
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

      {showsWideHistoryLayout && (
        <AgentChatHistorySidebarFrame
          frameRef={historySidebarFrameRef}
          collapsed={historySidebarCollapsed}
          width={
            isHistorySidebarResizing
              ? (historyResizeState.current?.currentWidth ?? historySidebarWidth)
              : historySidebarWidth
          }
          isResizing={isHistorySidebarResizing}
          onResizeStart={handleHistorySidebarResizeStart}
        >
          <AgentChatHistorySidebar
            className="flex"
            historySessions={historySessions}
            historyHasMore={historyHasMore}
            historyLoading={historyLoading}
            historyCursor={historyCursor}
            historyResumeUnsupportedReason={historyResumeUnsupportedReason}
            historyUnsupportedReason={historyUnsupportedReason}
            loadHistorySessions={loadHistorySessions}
            handleSelectHistorySession={handleSelectHistorySession}
            handleCreateNewSession={handleCreateNewSession}
            isConnecting={isConnecting}
            installedAgents={installedAgents}
            defaultRegistryId={defaultRegistryId}
            activeRegistryId={registryId}
            activeAcpSessionId={acpSessionId}
            activeAgentName={
              activeAgent ? (agentInfo?.title ?? agentInfo?.name ?? activeAgent.name) : null
            }
            canCreateNewSession={canUseCurrentMode}
            sidebarControl={historySidebarToggle}
          />
        </AgentChatHistorySidebarFrame>
      )}

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden bg-background transition-[border-radius] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          showsWideHistoryLayout && !historySidebarCollapsed && "rounded-l-xl",
        )}
      >
        <AgentChatHeader
          variant={variant}
          handleDragStart={variant === "modal" && !isFullscreen ? handleDragStart : undefined}
          handleOpenStandaloneWindow={variant === "modal" ? handleOpenStandaloneWindow : undefined}
          handleToggleFullscreen={canFullscreen ? handleToggleFullscreen : undefined}
          isFullscreen={isFullscreen}
          headerHovered={headerHovered}
          setHeaderHovered={setHeaderHovered}
          isConnected={isConnected}
          isConnecting={isConnecting}
          activeAgent={activeAgent}
          agentInfo={agentInfo}
          capabilities={capabilities}
          installedAgents={installedAgents}
          defaultRegistryId={defaultRegistryId}
          registryId={registryId}
          newSessionAgentsOpen={newSessionAgentsOpen}
          setNewSessionAgentsOpen={setNewSessionAgentsOpen}
          handleCreateNewSession={handleCreateNewSession}
          handleOpenNewSessionAgentsMenu={handleOpenNewSessionAgentsMenu}
          handleScheduleCloseNewSessionAgentsMenu={handleScheduleCloseNewSessionAgentsMenu}
          handleSetDefaultAgent={handleSetDefaultAgent}
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
          historyResumeUnsupportedReason={historyResumeUnsupportedReason}
          historyUnsupportedReason={historyUnsupportedReason}
          loadHistorySessions={loadHistorySessions}
          handleSelectHistorySession={handleSelectHistorySession}
          historyTriggerClassName={showsWideHistoryLayout ? "hidden" : undefined}
          handleClose={handleClosePanel}
          handleLogoutAgent={handleLogoutAgent}
          displaySessionTitle={displaySessionTitle}
          isAutoGeneratingTitle={isAutoGeneratingTitle}
          shouldScrambleAutoTitle={shouldScrambleAutoTitle}
          setShouldScrambleAutoTitle={setShouldScrambleAutoTitle}
          sessionTitleSource={sessionTitleSource}
          sessionId={sessionId}
        />

      <div ref={conversationRef} className="min-h-0 flex-1 overflow-hidden">
        <Conversation
          key={isResumingHistory ? "restoring-history" : "live-chat"}
          className="min-h-0 h-full overflow-hidden"
          initial={isResumingHistory ? false : "smooth"}
          resize={isResumingHistory ? "instant" : "smooth"}
        >
          <ConversationContent
            data-canvas-selectable-text="true"
            className={cn("gap-3 p-4!", wideContentClassName)}
            scrollClassName="agent-chat-scroll"
          >
            {((loadingAgents && !isConnected && !isConnecting) || isConnecting || isResumingHistory) && (
              <div className="desktop-loading-clean flex items-center justify-center py-6">
                <span className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-background/80 px-3 py-1.5 text-sm text-muted-foreground shadow-sm">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>
                    {loadingAgents && !isConnecting && !isResumingHistory
                      ? "Loading..."
                      : isResumingHistory
                        ? "Restoring session..."
                        : connectionPhaseLabel}
                  </span>
                </span>
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {canUseCurrentMode && isConnected && entries.length === 0 && !isConnecting && !error && (
              <ConversationEmptyState
                icon={<MessageSquare className="size-12" />}
                title={isResumedSession ? "Session resumed" : "Start a conversation"}
                description={
                  isResumedSession
                    ? "This agent restored the session context. Send a message to continue."
                    : "Type a message below to begin chatting"
                }
              />
            )}
            {entries.map((entry, i) => (
              <AgentChatEntryView
                key={i}
                entry={entry}
                entryIndex={i}
                registryId={registryId}
              />
            ))}
            {agentActivity.busy && (
              <AgentActivityIndicator activity={agentActivity} />
            )}
            <div ref={bottomRef} className="h-10" />
          </ConversationContent>
          <div
            className={cn(
              "pointer-events-none absolute bottom-1 z-10 flex items-center justify-between",
              floatingControlRailClassName,
            )}
          >
            <div className="pointer-events-auto">
              {sessionUsage ? (
                <SessionUsageBadge usage={sessionUsage} className="static" />
              ) : null}
            </div>
            <ConversationScrollButton className="group static left-auto bottom-auto right-auto pointer-events-auto inline-flex h-8 w-8 translate-x-0 items-center justify-center gap-0 overflow-hidden rounded-sm border border-dashed border-border/70 bg-background px-0 text-foreground shadow-md transition-[width,padding,gap] duration-300 ease-out [transform-origin:right_center] hover:w-24 hover:px-2 hover:gap-1">
              <span className="inline-flex size-4 shrink-0 items-center justify-center">
                <ChevronDown className="size-4" />
              </span>
              <span className="max-w-0 whitespace-nowrap text-[11px] text-foreground opacity-0 transition-[max-width,opacity] duration-300 ease-out group-hover:max-w-16 group-hover:opacity-100">
                Bottom
              </span>
            </ConversationScrollButton>
          </div>
          {!isResumingHistory && (
            <AgentMessageTimelineNav
              activeAgent={activeAgent}
              entries={entries}
              userEntryIndices={userEntryIndices}
              activeEntryIndex={messageNavIndex}
              onSelectEntry={handleSelectMessage}
            />
          )}
        </Conversation>
      </div>

      <div className="flex min-h-0 shrink flex-col overflow-y-auto overscroll-contain">
        {pendingPermission && (
          <div className={cn("shrink-0 border-t border-border p-3", wideContentClassName)}>
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

        <div className={wideContentClassName}>
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
    </div>
  );
}

const entryVisibilityStyle = {
  contentVisibility: "auto",
  containIntrinsicSize: "0 240px",
} as React.CSSProperties;

const AgentChatEntryView = React.memo(function AgentChatEntryView({
  entry,
  entryIndex,
  registryId,
}: {
  entry: ThreadEntry;
  entryIndex: number;
  registryId: string;
}) {
  return (
    <div
      data-entry-index={entryIndex}
      className="w-full min-w-0"
      style={entryVisibilityStyle}
    >
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
              <div
                className="whitespace-pre-wrap"
                style={{ overflowWrap: "break-word", wordBreak: "normal" }}
              >
                {entry.content}
              </div>
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
  );
});

function readStoredHistorySidebarWidth() {
  if (typeof window === "undefined") return HISTORY_SIDEBAR_DEFAULT_WIDTH;
  const stored = Number(window.localStorage.getItem(HISTORY_SIDEBAR_WIDTH_STORAGE_KEY));
  if (!Number.isFinite(stored)) return HISTORY_SIDEBAR_DEFAULT_WIDTH;
  return Math.min(
    HISTORY_SIDEBAR_MAX_WIDTH,
    Math.max(HISTORY_SIDEBAR_MIN_WIDTH, stored),
  );
}

function readStoredHistorySidebarCollapsed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(HISTORY_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
}

function AgentChatHistorySidebarFrame({
  frameRef,
  collapsed,
  width,
  isResizing,
  onResizeStart,
  children,
}: {
  frameRef: React.RefObject<HTMLDivElement | null>;
  collapsed: boolean;
  width: number;
  isResizing: boolean;
  onResizeStart: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        ref={frameRef}
        className={cn(
          "relative h-full min-h-0 shrink-0",
          !isResizing && "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          collapsed ? "overflow-visible" : "overflow-hidden",
        )}
        style={{
          width: collapsed ? 0 : width,
          willChange: isResizing ? "width" : undefined,
        }}
      >
        {collapsed ? (
          <AgentChatHistoryPeekShell width={width}>
            {children}
          </AgentChatHistoryPeekShell>
        ) : (
          <div className="h-full min-h-0 overflow-hidden">
            {children}
          </div>
        )}
      </div>
      {!collapsed ? (
        <div
          role="separator"
          aria-orientation="vertical"
          className={cn(
            "group relative flex h-full w-px shrink-0 cursor-col-resize items-center justify-center bg-transparent touch-none",
            "before:absolute before:inset-y-0 before:left-1/2 before:w-2 before:-translate-x-1/2",
          )}
          onMouseDown={onResizeStart}
        >
          <div className="pointer-events-none h-full w-px bg-border/80 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
        </div>
      ) : null}
    </>
  );
}

function AgentChatHistoryPeekShell({
  width,
  children,
}: {
  width: number;
  children: React.ReactNode;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const showPeek = useCallback(() => {
    clearCloseTimer();
    setIsVisible(true);
  }, [clearCloseTimer]);

  const scheduleHide = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      if (
        triggerRef.current?.matches(":hover") ||
        panelRef.current?.matches(":hover") ||
        document.querySelector(AGENT_CHAT_HISTORY_PEEK_KEEP_OPEN_SELECTOR)
      ) {
        closeTimerRef.current = null;
        return;
      }

      setIsVisible(false);
      closeTimerRef.current = null;
    }, 160);
  }, [clearCloseTimer]);

  const handlePointerLeave = useCallback(
    (relatedTarget: EventTarget | null) => {
      if (isAgentChatHistoryPeekKeepOpenTarget(relatedTarget)) {
        clearCloseTimer();
        return;
      }
      scheduleHide();
    },
    [clearCloseTimer, scheduleHide],
  );

  useEffect(() => {
    if (!isVisible) return;

    const handlePointerOver = (event: PointerEvent) => {
      const target = event.target;
      if (
        isNodeInsideRef(target, triggerRef) ||
        isNodeInsideRef(target, panelRef) ||
        isAgentChatHistoryPeekKeepOpenTarget(target)
      ) {
        clearCloseTimer();
        return;
      }
      scheduleHide();
    };

    document.addEventListener("pointerover", handlePointerOver, true);
    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
    };
  }, [clearCloseTimer, isVisible, scheduleHide]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  return (
    <>
      <div
        ref={triggerRef}
        aria-hidden="true"
        className="peer absolute inset-y-0 left-0 z-50 bg-transparent"
        style={{ width: 5 }}
        onPointerEnter={showPeek}
        onPointerLeave={(event) => handlePointerLeave(event.relatedTarget)}
        onMouseEnter={showPeek}
        onMouseLeave={(event) => handlePointerLeave(event.relatedTarget)}
      />
      <div
        ref={panelRef}
        className={cn(
          "absolute inset-y-0 left-0 z-40 min-w-0 overflow-hidden bg-muted/20 text-foreground shadow-2xl ring-1 ring-border/80 backdrop-blur-md",
          "transition-[translate,opacity,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[translate,opacity]",
          isVisible
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none -translate-x-full opacity-0 peer-hover:pointer-events-auto peer-hover:translate-x-0 peer-hover:opacity-100 hover:pointer-events-auto hover:translate-x-0 hover:opacity-100",
          "rounded-r-xl",
        )}
        style={{ width }}
        onFocusCapture={showPeek}
        onPointerEnter={showPeek}
        onPointerLeave={(event) => handlePointerLeave(event.relatedTarget)}
        onMouseEnter={showPeek}
        onMouseLeave={(event) => handlePointerLeave(event.relatedTarget)}
      >
        {children}
      </div>
    </>
  );
}

const AGENT_CHAT_HISTORY_PEEK_KEEP_OPEN_SELECTOR = [
  "[data-radix-popper-content-wrapper]:hover",
  "[data-slot='popover-content']:hover",
  "[data-slot='hover-card-content']:hover",
  "[data-slot='tooltip-content']:hover",
  "[data-slot='dropdown-menu-content']:hover",
  "[data-slot='dropdown-menu-sub-content']:hover",
].join(", ");

const AGENT_CHAT_HISTORY_PEEK_KEEP_OPEN_TARGET_SELECTOR = [
  "[data-radix-popper-content-wrapper]",
  "[data-slot='popover-content']",
  "[data-slot='hover-card-content']",
  "[data-slot='tooltip-content']",
  "[data-slot='dropdown-menu-content']",
  "[data-slot='dropdown-menu-sub-content']",
].join(", ");

function isNodeInsideRef(
  target: EventTarget | null,
  ref: React.RefObject<HTMLElement | null>,
) {
  return target instanceof Node && ref.current?.contains(target);
}

function isAgentChatHistoryPeekKeepOpenTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest(AGENT_CHAT_HISTORY_PEEK_KEEP_OPEN_TARGET_SELECTOR))
  );
}
