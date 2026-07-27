"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import "streamdown/styles.css";
import {
  Confirmation,
  ConfirmationActions,
  ConfirmationRequest,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  ShineBorder,
  cn,
} from "@workspace/ui";
import { ChevronDown, Loader2, MessageSquare, X } from "lucide-react";
import { useAgentChatLayoutStore } from "@/features/agent/store/agent-chat-layout-store";
import { DEFAULT_AGENT_CHAT_MODE, type AgentChatMode } from "@/features/agent/types/index";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import { useDesktopTrafficLightsPadding } from "@/shared/hooks/use-desktop-traffic-lights-padding";
import { SessionUsageBadge } from "./UsageBadges";
import { AgentActivityIndicator } from "./AgentActivityIndicator";
import { PermissionActionButton } from "./MessageQueueDock";
import { AgentPromptComposer } from "./AgentPromptComposer";
import { useAgentChatSession } from "../hooks/use-agent-chat-session";
import type { UseAgentChatSessionOptions } from "../hooks/use-agent-chat-session-types";
import { AgentChatHeader } from "./AgentChatHeader";
import { AgentAuthDialog } from "./AgentAuthDialog";
import { AgentMessageTimelineNav } from "./AgentMessageTimelineNav";
import { AgentChatHistorySidebar } from "./AgentChatHistorySidebar";
import {
  AgentChatHistorySidebarFrame,
  AgentChatHistorySidebarToggle,
} from "./AgentChatHistorySidebarFrame";
import { AgentChatEntryView } from "./AgentChatEntryView";
import { openAgentChatWindow } from "../lib/desktop-agent-chat-window";
import { useAgentChatHistorySidebarLayout } from "../hooks/use-agent-chat-history-sidebar-layout";
import {
  closeCurrentStandaloneWindow,
  closeStandaloneSurface,
  isStandaloneSurfaceOpen as readStandaloneSurfaceOpen,
  makeStandaloneSurfaceKey,
  markStandaloneSurfaceOpen,
  restoreStandaloneSurface,
  subscribeStandaloneSurface,
} from "@/shared/lib/standalone-window-handoff";

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
  /** Isolate session storage (canvas widgets: shape instance id). */
  instanceKey?: string | null;
  initialSessionBinding?: UseAgentChatSessionOptions["initialSessionBinding"];
  onSessionBindingChange?: UseAgentChatSessionOptions["onSessionBindingChange"];
}

const WIDE_HISTORY_LAYOUT_MIN_WIDTH = 900;

export function AgentChatPanel({
  variant = "modal",
  mode = DEFAULT_AGENT_CHAT_MODE,
  publishStatus = variant === "modal",
  active = true,
  allowFullscreen,
  contextOverride,
  transformPrompt,
  instanceKey = null,
  initialSessionBinding = null,
  onSessionBindingChange,
}: AgentChatPanelProps = {}) {
  const t = useTranslations("Agent.components.chatPanel");
  const canFullscreen = variant !== "standalone" && (allowFullscreen ?? true);
  const [fullscreenRequested, setFullscreenRequested] = useState(false);
  const [isStandaloneChatOpen, setIsStandaloneChatOpen] = useState(false);
  const isFullscreen = canFullscreen && fullscreenRequested;
  const isEmbeddedPausedForStandalone = variant !== "standalone" && isStandaloneChatOpen;
  const needsTrafficLightsPadding = useDesktopTrafficLightsPadding();
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  const showsWideHistoryLayout = panelWidth >= WIDE_HISTORY_LAYOUT_MIN_WIDTH;

  const session = useAgentChatSession({
    variant,
    mode,
    publishStatus,
    active: active && !isEmbeddedPausedForStandalone,
    historyListActive: showsWideHistoryLayout,
    contextOverride,
    transformPrompt,
    instanceKey,
    initialSessionBinding,
    onSessionBindingChange,
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
  const {
    historySidebarFrameRef,
    historySidebarWidth,
    historySidebarCollapsed,
    setHistorySidebarCollapsed,
    isHistorySidebarResizing,
    handleHistorySidebarResizeStart,
  } = useAgentChatHistorySidebarLayout({ panelWidth });

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
    persistHandoffSnapshot,
    restoreHandoffSnapshot,
    sendCancel,
  } = session;
  const standaloneSurfaceKey = useMemo(
    () => makeStandaloneSurfaceKey("agent-chat", sessionWorkspaceId, sessionProjectId),
    [sessionProjectId, sessionWorkspaceId],
  );

  useEffect(() => {
    if (variant === "standalone") {
      markStandaloneSurfaceOpen(standaloneSurfaceKey);
      const unsubscribe = subscribeStandaloneSurface(standaloneSurfaceKey, (_isOpen, event) => {
        if (event?.action === "restore" || event?.action === "close") {
          void (async () => {
            await persistHandoffSnapshot();
            await closeCurrentStandaloneWindow();
          })();
        }
      });
      const handleBeforeUnload = () => {
        void persistHandoffSnapshot();
        closeStandaloneSurface(standaloneSurfaceKey);
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
        unsubscribe();
      };
    }

    setIsStandaloneChatOpen(readStandaloneSurfaceOpen(standaloneSurfaceKey));
    return subscribeStandaloneSurface(standaloneSurfaceKey, (isOpen) => {
      if (!isOpen) {
        void restoreHandoffSnapshot();
      }
      setIsStandaloneChatOpen(isOpen);
    });
  }, [persistHandoffSnapshot, restoreHandoffSnapshot, standaloneSurfaceKey, variant]);

  const handleToggleFullscreen = useCallback(() => {
    setFullscreenRequested((current) => !current);
  }, []);

  const handleClosePanel = useCallback(() => {
    setFullscreenRequested(false);
    handleClose();
  }, [handleClose]);

  const handleOpenStandaloneWindow = useCallback(async () => {
    const handoffToken = await persistHandoffSnapshot();
    await openAgentChatWindow({
      agent: registryId || defaultRegistryId || null,
      session: acpSessionId,
      sessionCwd: sessionCwd ?? localPath,
      workspaceId: sessionWorkspaceId,
      projectId: sessionProjectId,
      handoffToken,
    });
    markStandaloneSurfaceOpen(standaloneSurfaceKey);
    setIsStandaloneChatOpen(true);
  }, [
    acpSessionId,
    defaultRegistryId,
    localPath,
    persistHandoffSnapshot,
    registryId,
    sessionCwd,
    sessionProjectId,
    sessionWorkspaceId,
    standaloneSurfaceKey,
  ]);

  const handleReturnChatToEmbedded = useCallback(() => {
    void restoreHandoffSnapshot();
    restoreStandaloneSurface(standaloneSurfaceKey);
    setIsStandaloneChatOpen(false);
  }, [restoreHandoffSnapshot, standaloneSurfaceKey]);

  const handleCloseStandaloneChatWindow = useCallback(async () => {
    await persistHandoffSnapshot();
    restoreStandaloneSurface(standaloneSurfaceKey);
    void closeCurrentStandaloneWindow();
  }, [persistHandoffSnapshot, standaloneSurfaceKey]);

  const historySidebarExpandLabel = t("history.expand");
  const historySidebarHideLabel = t("history.hide");
  const historySidebarToggle = (
    <AgentChatHistorySidebarToggle
      collapsed={historySidebarCollapsed}
      className="desktop-no-drag size-9 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
      expandLabel={historySidebarExpandLabel}
      hideLabel={historySidebarHideLabel}
      onToggle={() => setHistorySidebarCollapsed((current) => !current)}
    />
  );
  const trafficLightsHistorySidebarToggle = (
    <AgentChatHistorySidebarToggle
      collapsed={historySidebarCollapsed}
      // desktop-no-drag: must be a *descendant* of the header drag-region.
      // Sibling overlays with no-drag are still stolen by Electron app-region.
      className="desktop-no-drag size-7 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
      expandLabel={historySidebarExpandLabel}
      hideLabel={historySidebarHideLabel}
      iconClassName="size-4"
      onToggle={() => setHistorySidebarCollapsed((current) => !current)}
    />
  );
  // Wide standalone/fullscreen: when collapsed, put the expand control *inside*
  // AgentChatHeader (same pattern as main Header sidebar toggle). An absolute
  // sibling over a full-width desktop-drag-region is unclickable on Electron.
  const usesStandaloneTrafficChrome =
    showsWideHistoryLayout && (variant === "standalone" || isFullscreen);
  const insetHeaderForTrafficLights =
    needsTrafficLightsPadding &&
    (variant === "standalone" || isFullscreen) &&
    (!showsWideHistoryLayout || historySidebarCollapsed);
  const historySidebarControl = showsWideHistoryLayout
    ? usesStandaloneTrafficChrome
      ? historySidebarCollapsed
        ? trafficLightsHistorySidebarToggle
        : null
      : historySidebarToggle
    : null;
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

  const shouldMarkAsNativeSurfaceOverlay = variant === "modal" || isFullscreen;

  if (isEmbeddedPausedForStandalone) {
    return (
      <div
        ref={panelRef}
        data-atmos-native-surface-overlay={shouldMarkAsNativeSurfaceOverlay ? "true" : undefined}
        className={cn(
          "relative flex items-center justify-center overflow-hidden bg-background p-6 text-center",
          variant === "modal" && !isFullscreen && "fixed z-50 rounded-xl border border-border shadow-lg",
          variant === "sidebar" && !isFullscreen && "h-full min-h-0",
          isFullscreen && "fixed inset-0 z-50 h-dvh w-full",
        )}
        style={variant === "modal" && pos && !isFullscreen
          ? { left: pos.x, top: pos.y, width: layout.width, height: layout.height, opacity: layout.opacity / 100 }
          : undefined}
      >
        <div className="max-w-sm">
          <div className="text-sm font-medium text-foreground">
            {t("header.standaloneWindow.embeddedTitle")}
          </div>
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("header.standaloneWindow.embeddedDescription")}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
              onClick={handleReturnChatToEmbedded}
            >
              {t("header.standaloneWindow.returnHere")}
            </button>
            {variant === "modal" && (
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
                onClick={session.handleClose}
              >
                <X className="size-3.5" aria-hidden="true" />
                {t("header.standaloneWindow.closeModal")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      data-atmos-native-surface-overlay={shouldMarkAsNativeSurfaceOverlay ? "true" : undefined}
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
          expandLabel={historySidebarExpandLabel}
          showCollapsedExpandButton={false}
          width={historySidebarWidth}
          isResizing={isHistorySidebarResizing}
          onResizeStart={handleHistorySidebarResizeStart}
          onCollapsedExpand={() => setHistorySidebarCollapsed(false)}
        >
          <AgentChatHistorySidebar
            className="flex"
            // Expand control lives in the header when collapsed (not a floating
            // overlay). When expanded, only reserve top inset if traffic lights
            // are visible so New Session is not under the lights.
            reserveTrafficLightsInset={
              usesStandaloneTrafficChrome &&
              !historySidebarCollapsed &&
              needsTrafficLightsPadding
            }
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
            projects={session.projects}
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
          handleReturnToEmbeddedWindow={variant === "standalone" ? handleCloseStandaloneChatWindow : undefined}
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
          trafficLightsContentInset={insetHeaderForTrafficLights}
          loadHistorySessions={loadHistorySessions}
          handleSelectHistorySession={handleSelectHistorySession}
          historyTriggerClassName={showsWideHistoryLayout && !historySidebarCollapsed ? "hidden" : undefined}
          historySidebarControl={historySidebarControl}
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
                      ? t("loading")
                      : isResumingHistory
                        ? t("restoringSession")
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
                title={isResumedSession ? t("empty.resumedTitle") : t("empty.startTitle")}
                description={
                  isResumedSession
                    ? t("empty.resumedDescription")
                    : t("empty.startDescription")
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
                {t("bottom")}
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
                <span className="font-medium text-amber-500">{t("permissionRequested")}</span>
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
                      label={t("deny")}
                      variant="outline"
                      onClick={() => handlePermission("reject_once")}
                    />
                    <PermissionActionButton
                      label={t("allow")}
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
            instanceKey={instanceKey}
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
