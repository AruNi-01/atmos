"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import "streamdown/styles.css";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  cn,
} from "@workspace/ui";
import LogoSvg from "@workspace/ui/components/logo-svg";
import { ChevronDown, Loader2, MessageSquare, X } from "lucide-react";
import { useAgentChatLayoutStore } from "@/features/agent/store/agent-chat-layout-store";
import { DEFAULT_AGENT_CHAT_MODE, type AgentChatMode } from "@/features/agent/types/index";
import { useDesktopTrafficLightsPadding } from "@/shared/hooks/use-desktop-traffic-lights-padding";
import { AgentActivityIndicator } from "./AgentActivityIndicator";
import {
  AgentPermissionCard,
  isPlanExitPermission,
  resolvePlanExitFilePath,
} from "./AgentPermissionCard";
import { planDocumentIntentFromMessages } from "../lib/plan-document-intent";
import { AgentSessionOpCard } from "./AgentSessionOpCard";
import { AgentPromptComposer } from "./AgentPromptComposer";
import { useAgentChatSession } from "../hooks/use-agent-chat-session";
import type { AgentChatSurfaceVariant, UseAgentChatSessionOptions } from "../hooks/use-agent-chat-session-types";
import { AgentChatHeader } from "./AgentChatHeader";
import { AgentAuthDialog } from "./AgentAuthDialog";
import { AgentMessageTimelineNav } from "./AgentMessageTimelineNav";
import { AgentChatHistorySidebar } from "./AgentChatHistorySidebar";
import {
  AgentChatHistorySidebarFrame,
  AgentChatHistorySidebarToggle,
} from "./AgentChatHistorySidebarFrame";
import { AgentChatTranscriptList } from "./AgentChatTranscriptList";
import { AgentChatCwdProvider } from "./agent-chat-cwd-context";
import { openAgentChatWindow } from "../lib/desktop-agent-chat-window";
import { ackAgentChatAttention } from "../lib/agent-status-ack";
import { isAgentNewChatLanding } from "../lib/agent-composer-placeholder";
import { useReducedMotion } from "motion/react";
import {
  AGENT_CHAT_OVERLAY_PAD_SHRINK_MS,
  AGENT_CHAT_SCROLL_CLASS,
  findAgentChatScrollElement,
  transcriptBottomPadPx,
  transcriptBottomPadStyle,
} from "../lib/agent-chat-transcript-window";
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
  variant?: AgentChatSurfaceVariant;
  mode?: AgentChatMode;
  publishStatus?: boolean;
  active?: boolean;
  allowFullscreen?: boolean;
  contextOverride?: UseAgentChatSessionOptions["contextOverride"];
  transformPrompt?: (prompt: string) => string;
  instanceKey?: string | null;
  paintContextId?: string | null;
  chatId?: string | null;
  onChatStarted?: (id: string, meta?: {
    title?: string | null;
    cwd?: string;
    providerId?: string | null;
    hasMessages?: boolean;
  }) => void;
  onChatUpdated?: (id: string, meta: {
    title?: string | null;
    providerId?: string | null;
    cwd?: string;
    hasMessages?: boolean;
  }) => void;
  onOpenChat?: (id: string) => void;
  onClose?: () => void;
  resumeTranscript?: boolean;
}

const WIDE_HISTORY_LAYOUT_MIN_WIDTH = 900;
const MODAL_MIN_WIDTH = 320;
const MODAL_MIN_HEIGHT = 300;

type ModalFrame = { x: number; y: number; width: number; height: number };

function writeModalFrame(node: HTMLElement | null, frame: ModalFrame) {
  if (!node) return;
  node.style.transform = `translate3d(${frame.x}px, ${frame.y}px, 0)`;
  node.style.width = `${frame.width}px`;
  node.style.height = `${frame.height}px`;
}

function modalFrameStyle(frame: ModalFrame, opacity: number): React.CSSProperties {
  return {
    left: 0,
    top: 0,
    width: frame.width,
    height: frame.height,
    opacity: opacity / 100,
    transform: `translate3d(${frame.x}px, ${frame.y}px, 0)`,
    willChange: "transform",
  };
}

export function AgentChatPanel({
  variant = "sidebar",
  mode = DEFAULT_AGENT_CHAT_MODE,
  publishStatus = variant === "modal",
  active = true,
  allowFullscreen,
  contextOverride,
  transformPrompt,
  instanceKey = null,
  paintContextId = null,
  chatId: chatIdProp = null,
  resumeTranscript: resumeTranscriptProp,
  onChatStarted,
  onChatUpdated,
  onOpenChat,
  onClose,
}: AgentChatPanelProps = {}) {
  const t = useTranslations("Agent.components.chatPanel");
  const canFullscreen = variant !== "standalone" && variant !== "center" && (allowFullscreen ?? true);
  const canOpenStandaloneWindow = variant !== "standalone";
  const [fullscreenRequested, setFullscreenRequested] = useState(false);
  const [isStandaloneChatOpen, setIsStandaloneChatOpen] = useState(false);
  const isFullscreen = canFullscreen && fullscreenRequested;
  const isEmbeddedPausedForStandalone = variant !== "standalone" && isStandaloneChatOpen;
  const needsTrafficLightsPadding = useDesktopTrafficLightsPadding();
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  const showHistoryChrome = variant === "standalone" || variant === "modal";
  const showsWideHistoryLayout =
    variant === "standalone" && panelWidth >= WIDE_HISTORY_LAYOUT_MIN_WIDTH;
  const chatId = chatIdProp || "";
  const resumeTranscript = resumeTranscriptProp ?? variant !== "center";

  const session = useAgentChatSession({
    variant,
    mode,
    publishStatus,
    active: active && !isEmbeddedPausedForStandalone,
    contextOverride,
    transformPrompt,
    instanceKey,
    paintContextId,
    chatId,
    resumeTranscript,
    onChatStarted,
    onChatUpdated,
    onOpenChat,
  });

  // ---------------------------------------------------------------------------
  // Draggable & Resizable layout (UI-only, stays in component)
  // ---------------------------------------------------------------------------
  const { layout, updateLayout, loaded: layoutLoaded, loadLayout } = useAgentChatLayoutStore();

  useEffect(() => {
    if (!active) {
      setFullscreenRequested(false);
    }
  }, [active]);

  useEffect(() => {
    if (variant === "modal") {
      loadLayout();
    }
  }, [loadLayout, variant]);

  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number; width: number; height: number } | null>(null);
  const dragAbortController = useRef<AbortController | null>(null);
  const resizeState = useRef<{ startX: number; startY: number; origW: number; origH: number; origX: number; origY: number; edge: string } | null>(null);
  const resizeAbortController = useRef<AbortController | null>(null);
  // Visual frame while dragging/resizing. Writing this through React/Zustand
  // re-renders the whole chat on every pointermove.
  const liveFrameRef = useRef<ModalFrame | null>(null);
  const pendingFrameRef = useRef<ModalFrame | null>(null);
  const frameRafRef = useRef<number | null>(null);
  const {
    historySidebarFrameRef,
    historySidebarWidth,
    historySidebarCollapsed,
    setHistorySidebarCollapsed,
    isHistorySidebarResizing,
    handleHistorySidebarResizeStart,
  } = useAgentChatHistorySidebarLayout({ panelWidth });

  const shouldMeasurePanel = active && (variant !== "modal" || layoutLoaded);

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
      if (liveFrameRef.current) return;
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

  const scheduleModalFrame = useCallback((frame: ModalFrame) => {
    pendingFrameRef.current = frame;
    liveFrameRef.current = frame;
    if (frameRafRef.current != null) return;
    frameRafRef.current = window.requestAnimationFrame(() => {
      frameRafRef.current = null;
      const next = pendingFrameRef.current;
      if (!next) return;
      writeModalFrame(panelRef.current, next);
    });
  }, []);

  const commitModalFrame = useCallback((partial: Partial<ModalFrame>) => {
    if (frameRafRef.current != null) {
      window.cancelAnimationFrame(frameRafRef.current);
      frameRafRef.current = null;
    }
    const pending = pendingFrameRef.current;
    pendingFrameRef.current = null;
    liveFrameRef.current = null;
    if (pending) {
      writeModalFrame(panelRef.current, pending);
    }
    updateLayout(partial);
  }, [updateLayout]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, [role="button"], [data-radix-popper-content-wrapper]')) return;
    e.preventDefault();
    const pos = resolvePosition();
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      width: layout.width,
      height: layout.height,
    };

    const handleMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      const clamped = clamp(
        dragState.current.origX + dx,
        dragState.current.origY + dy,
        dragState.current.width,
        dragState.current.height,
      );
      scheduleModalFrame({
        x: clamped.x,
        y: clamped.y,
        width: dragState.current.width,
        height: dragState.current.height,
      });
    };
    const handleUp = () => {
      const pending = pendingFrameRef.current;
      dragState.current = null;
      if (pending) {
        commitModalFrame({ x: pending.x, y: pending.y });
      } else {
        liveFrameRef.current = null;
      }
      dragAbortController.current?.abort();
      dragAbortController.current = null;
    };

    dragAbortController.current = new AbortController();
    const { signal } = dragAbortController.current;
    document.addEventListener('mousemove', handleMove, { signal });
    document.addEventListener('mouseup', handleUp, { signal });
  }, [resolvePosition, clamp, layout.width, layout.height, scheduleModalFrame, commitModalFrame]);

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

      if (s.edge.includes('e')) newW = Math.max(MODAL_MIN_WIDTH, s.origW + dx);
      if (s.edge.includes('w')) { newW = Math.max(MODAL_MIN_WIDTH, s.origW - dx); newX = s.origX + s.origW - newW; }
      if (s.edge.includes('s')) newH = Math.max(MODAL_MIN_HEIGHT, s.origH + dy);
      if (s.edge.includes('n')) { newH = Math.max(MODAL_MIN_HEIGHT, s.origH - dy); newY = s.origY + s.origH - newH; }

      const clamped = clamp(newX, newY, newW, newH);
      scheduleModalFrame({ width: newW, height: newH, x: clamped.x, y: clamped.y });
    };
    const handleUp = () => {
      const pending = pendingFrameRef.current;
      resizeState.current = null;
      if (pending) {
        commitModalFrame({
          width: pending.width,
          height: pending.height,
          x: pending.x,
          y: pending.y,
        });
      } else {
        liveFrameRef.current = null;
      }
      resizeAbortController.current?.abort();
      resizeAbortController.current = null;
    };

    resizeAbortController.current = new AbortController();
    const { signal } = resizeAbortController.current;
    document.addEventListener('mousemove', handleMove, { signal });
    document.addEventListener('mouseup', handleUp, { signal });
  }, [resolvePosition, clamp, layout.width, layout.height, scheduleModalFrame, commitModalFrame]);

  useEffect(() => {
    return () => {
      if (frameRafRef.current != null) {
        window.cancelAnimationFrame(frameRafRef.current);
        frameRafRef.current = null;
      }
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
  const modalFrame = pos
    ? (liveFrameRef.current ?? { x: pos.x, y: pos.y, width: layout.width, height: layout.height })
    : null;

  const {
    isConnected,
    isConnecting,
    error,
    chatId: liveChatId,
    agentLocked,
    sessionCwd,
    availableCommands,
    messages,
    setMessages,
    currentPlan,
    backgroundTools,
    pendingPermission,
    pendingPermissionMarkdown,
    pendingSessionOp,
    agentActivity,
    setWaitingForResponse,
    stoppedRef,
    isResumingHistory,
    isRestoringTranscript,
    isResumedSession,
    runtimeStatus,
    hasPersistenceHandle,
    installedAgents,
    activeAgent,
    registryId,
    defaultRegistryId,
    loadingAgents,
    agentInfo,
    capabilities,
    catalogModelsLoading,
    refreshEmptyCatalog,
    configOptions,
    modelsLocked,
    modesLocked,
    setConfigOption,
    setProviderId,
    persistPreferredRegistry,
    sessionUsage,
    elapsedMs,
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
    projects,
    canUseCurrentMode,
    connectionPhaseLabel,
    queueKey,
    queuedPrompts,
    removeQueuedAgentChatPrompt,
    updateQueuedAgentChatPrompt,
    moveQueuedAgentChatPrompt,
    bottomRef,
    transcriptRef,
    authRequest,
    selectedAuthMethodId,
    setSelectedAuthMethodId,
    clearAuthRequest,
    startSession,
    exportableMessages,
    userMessageIndices,
    messageNavIndex,
    setMessageNavIndex,
    scrollToIndexRef,
    handleSubmit,
    handleClose,
    handleLogoutAgent,
    handlePermission,
    handleSessionOp,
    handleCreateNewSession,
    handleSelectWorkingDirectory,
    handleSelectHistorySession,
    handleSelectMessage,
    handleExportChat,
    persistHandoffSnapshot,
    restoreHandoffSnapshot,
    sendCancel,
  } = session;

  const ackVisibleChatAttention = useCallback(() => {
    ackAgentChatAttention(liveChatId || chatId);
  }, [chatId, liveChatId]);

  const planFilePath = useMemo(
    () => (pendingPermission && isPlanExitPermission(pendingPermission)
      ? resolvePlanExitFilePath(pendingPermission, messages)
      : null),
    [messages, pendingPermission],
  );
  const planDocumentIntent = useMemo(
    () => planDocumentIntentFromMessages(messages),
    [messages],
  );

  const standaloneSurfaceKey = useMemo(
    () =>
      makeStandaloneSurfaceKey(
        "agent-chat",
        sessionWorkspaceId,
        sessionProjectId,
        instanceKey || liveChatId || chatId || null,
      ),
    [chatId, instanceKey, liveChatId, sessionProjectId, sessionWorkspaceId],
  );
  const threadBannerError = useMemo(() => {
    const message = error?.trim();
    if (!message) return null;
    const alreadyInTranscript = messages.some((item) =>
      item.parts.some((part) => part.type === "error" && part.message.trim() === message),
    );
    return alreadyInTranscript ? null : message;
  }, [error, messages]);

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
  }, [
    persistHandoffSnapshot,
    restoreHandoffSnapshot,
    standaloneSurfaceKey,
    variant,
  ]);

  const handleToggleFullscreen = useCallback(() => {
    setFullscreenRequested((current) => !current);
  }, []);

  const handleClosePanel = useCallback(() => {
    setFullscreenRequested(false);
    onClose?.();
    handleClose();
  }, [handleClose, onClose]);

  const handleOpenStandaloneWindow = useCallback(async () => {
    const handoffToken = await persistHandoffSnapshot();
    await openAgentChatWindow({
      agent: registryId || defaultRegistryId || null,
      chatId: liveChatId || chatId,
      sessionCwd: sessionCwd ?? localPath,
      workspaceId: sessionWorkspaceId,
      projectId: sessionProjectId,
      instanceKey: instanceKey || liveChatId || chatId || null,
      handoffToken,
    });
    markStandaloneSurfaceOpen(standaloneSurfaceKey);
    setIsStandaloneChatOpen(true);
  }, [
    chatId,
    defaultRegistryId,
    instanceKey,
    liveChatId,
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
  // Wide standalone/fullscreen chrome:
  // - Collapsed: expand control lives *inside* the header (descendant of
  //   desktop-drag-region) so Electron does not steal clicks. History popover
  //   stays visible in the header.
  // - Expanded: collapse control is a floating overlay over the history sidebar
  //   (outside the main header drag strip). History popover is hidden because
  //   sessions already live in the sidebar.
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
  // When the wide sidebar is open, hide the header History popover trigger.
  // When collapsed (or not wide), keep the session-history button visible.
  const historyTriggerClassName =
    !showHistoryChrome || (showsWideHistoryLayout && !historySidebarCollapsed)
      ? "hidden"
      : undefined;
  const constrainChatWidth = variant === "center" || showsWideHistoryLayout;
  const wideContentClassName = constrainChatWidth
    ? "mx-auto w-full max-w-3xl"
    : "w-full";
  const isNewChatLanding = isAgentNewChatLanding({
    chatId: liveChatId,
    messageCount: messages.length,
    isResumingHistory,
  });
  const wasResumingHistoryRef = useRef(false);
  const [aboveComposerOverlaysNode, setAboveComposerOverlaysNode] = useState<HTMLDivElement | null>(
    null,
  );
  const [aboveComposerOverlayPadPx, setAboveComposerOverlayPadPx] = useState(0);
  const aboveComposerOverlayPadPxRef = useRef(0);
  const [overlayPadShrinkMotion, setOverlayPadShrinkMotion] = useState(false);
  const reduceOverlayPadMotion = Boolean(useReducedMotion());

  useEffect(() => {
    if (isRestoringTranscript) {
      wasResumingHistoryRef.current = true;
      return;
    }

    if (!wasResumingHistoryRef.current || messages.length === 0) return;
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
  }, [bottomRef, isRestoringTranscript, messages.length]);

  useLayoutEffect(() => {
    if (!aboveComposerOverlaysNode) {
      setAboveComposerOverlayPadPx(0);
      return;
    }

    const measure = () => {
      const next = Math.max(0, Math.round(aboveComposerOverlaysNode.getBoundingClientRect().height));
      setAboveComposerOverlayPadPx((current) => (current === next ? current : next));
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(aboveComposerOverlaysNode);
    return () => observer.disconnect();
  }, [aboveComposerOverlaysNode]);

  const overlayPadShrinking =
    aboveComposerOverlayPadPx < aboveComposerOverlayPadPxRef.current
    || overlayPadShrinkMotion;

  useLayoutEffect(() => {
    const prev = aboveComposerOverlayPadPxRef.current;
    aboveComposerOverlayPadPxRef.current = aboveComposerOverlayPadPx;
    if (aboveComposerOverlayPadPx >= prev) {
      setOverlayPadShrinkMotion(false);
      return;
    }
    setOverlayPadShrinkMotion(true);
    const hold = window.setTimeout(
      () => setOverlayPadShrinkMotion(false),
      AGENT_CHAT_OVERLAY_PAD_SHRINK_MS,
    );
    const scroll = findAgentChatScrollElement(transcriptRef.current);
    if (scroll && reduceOverlayPadMotion) {
      const delta = prev - aboveComposerOverlayPadPx;
      const distanceFromBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;
      // Instant shrink (reduced motion): keep mid-scroll content pinned.
      // Stick-to-bottom + CSS height easing handle the at-bottom case.
      if (distanceFromBottom > delta + 4) {
        scroll.scrollTop = Math.max(0, scroll.scrollTop - delta);
      }
    }
    return () => window.clearTimeout(hold);
  }, [aboveComposerOverlayPadPx, reduceOverlayPadMotion, transcriptRef]);

  const transcriptBottomPad = transcriptBottomPadPx(aboveComposerOverlayPadPx);

  // Host `active`, not pause-gated session.isPanelOpen (that returned null before the placeholder).
  if (!active || (variant === "modal" && !layoutLoaded)) return null;

  const shouldMarkAsNativeSurfaceOverlay = variant === "modal" || isFullscreen;

  if (isEmbeddedPausedForStandalone) {
    return (
      <div
        ref={panelRef}
        data-agent-chat-workspace={liveChatId || chatId || "draft"}
        data-agent-chat-standalone-paused="true"
        data-atmos-native-surface-overlay={shouldMarkAsNativeSurfaceOverlay ? "true" : undefined}
        className={cn(
          "relative flex h-full min-h-0 min-w-0 w-full flex-1 items-center justify-center overflow-hidden border border-dashed border-border/60 bg-muted/10 px-6 text-center",
          variant === "modal" && !isFullscreen && "fixed z-50 rounded-xl border-border bg-background shadow-lg",
          isFullscreen && "fixed inset-0 z-50 h-dvh w-full",
        )}
        style={variant === "modal" && modalFrame && !isFullscreen
          ? modalFrameStyle(modalFrame, layout.opacity)
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
              className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-sm hover:bg-accent"
              onClick={handleReturnChatToEmbedded}
            >
              {t("header.standaloneWindow.returnHere")}
            </button>
            {variant === "modal" && (
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-sm hover:bg-accent"
                onClick={handleClosePanel}
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
      data-agent-chat-workspace={liveChatId || chatId || "draft"}
      data-atmos-native-surface-overlay={shouldMarkAsNativeSurfaceOverlay ? "true" : undefined}
      onPointerEnter={ackVisibleChatAttention}
      onPointerDown={ackVisibleChatAttention}
      className={cn(
        "relative flex overflow-hidden bg-background",
        showsWideHistoryLayout && "bg-muted/20",
        !showsWideHistoryLayout && "flex-col",
        variant === "modal" && !isFullscreen && "fixed z-50 rounded-xl border border-border shadow-lg",
        (variant === "sidebar" || variant === "center") && !isFullscreen && "flex h-full min-h-0 min-w-0 w-full flex-1 flex-col",
        variant === "standalone" && "h-dvh min-h-0 w-full",
        isFullscreen && "fixed inset-0 z-50 h-dvh w-full"
      )}
      style={variant === "modal" && modalFrame && !isFullscreen
        ? modalFrameStyle(modalFrame, layout.opacity)
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

      {usesStandaloneTrafficChrome && !historySidebarCollapsed ? (
        // Floating collapse over the open sidebar — not under the header's
        // full-width drag region, so Electron hits work. (Collapsed expand is
        // rendered inside AgentChatHeader via historySidebarControl.)
        <div
          className={cn(
            "desktop-no-drag absolute top-3 z-50 flex h-7 items-center",
            needsTrafficLightsPadding ? "left-[86px]" : "left-3",
          )}
        >
          {trafficLightsHistorySidebarToggle}
        </div>
      ) : null}

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
            // Leave room for traffic lights and/or the floating collapse control
            // so New Session is not covered.
            reserveTrafficLightsInset={
              usesStandaloneTrafficChrome && !historySidebarCollapsed
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
            onPreferredRegistryChange={persistPreferredRegistry}
            installedAgents={installedAgents}
            defaultRegistryId={defaultRegistryId}
            activeRegistryId={registryId}
            activeChatId={liveChatId || chatId}
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
        {variant !== "center" ? (
          <AgentChatHeader
            variant={variant}
            constrainWidth={constrainChatWidth}
            handleDragStart={variant === "modal" && !isFullscreen ? handleDragStart : undefined}
            handleOpenStandaloneWindow={canOpenStandaloneWindow ? handleOpenStandaloneWindow : undefined}
            handleReturnToEmbeddedWindow={variant === "standalone" ? handleCloseStandaloneChatWindow : undefined}
            handleToggleFullscreen={canFullscreen ? handleToggleFullscreen : undefined}
            isFullscreen={isFullscreen}
            isConnecting={isConnecting}
            capabilities={capabilities}
            localPath={localPath}
            sessionCwd={sessionCwd}
            exportableMessages={exportableMessages}
            handleExportChat={handleExportChat}
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
            historyTriggerClassName={historyTriggerClassName}
            historySidebarControl={historySidebarControl}
            handleClose={handleClosePanel}
            handleLogoutAgent={handleLogoutAgent}
            handleCreateNewSession={handleCreateNewSession}
            canCreateNewSession={canUseCurrentMode}
            displaySessionTitle={displaySessionTitle}
            isAutoGeneratingTitle={isAutoGeneratingTitle}
            shouldScrambleAutoTitle={shouldScrambleAutoTitle}
            setShouldScrambleAutoTitle={setShouldScrambleAutoTitle}
            sessionTitleSource={sessionTitleSource}
            chatId={liveChatId || chatId}
            contextProjects={projects}
            contextSelection={{
              workspaceId: sessionWorkspaceId,
              projectId: sessionProjectId,
              cwd: sessionCwd,
            }}
          />
        ) : null}

      <div
        className={cn(
          /* size container so permission cards can use 50cqh ≈ half of this column */
          "flex min-h-0 flex-1 flex-col [container-type:size] [container-name:agent-chat]",
          isNewChatLanding ? "justify-center overflow-y-auto pb-20" : "overflow-hidden",
        )}
        data-agent-chat-landing={isNewChatLanding ? "true" : undefined}
        data-agent-chat-column=""
      >
      <div
        ref={transcriptRef}
        className={cn(
          "min-h-0 overflow-hidden",
          isNewChatLanding ? "hidden" : "flex-1",
        )}
      >
        <AgentChatCwdProvider
          cwd={sessionCwd || localPath}
          projectOrWorkspacePath={localPath}
        >
          <Conversation
          className="min-h-0 h-full overflow-hidden"
          initial={isRestoringTranscript ? false : "smooth"}
          resize={isRestoringTranscript ? "instant" : "smooth"}
        >
          <ConversationContent
            data-canvas-selectable-text="true"
            className={cn("gap-3 p-4!", wideContentClassName)}
            scrollClassName={AGENT_CHAT_SCROLL_CLASS}
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
            {threadBannerError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {threadBannerError}
              </div>
            )}
            {canUseCurrentMode && isConnected && messages.length === 0 && !isConnecting && !isResumingHistory && !error && hasPersistenceHandle && (
              <ConversationEmptyState
                icon={<MessageSquare className="size-12" />}
                title={t("empty.resumedTitle")}
                description={t("empty.resumedDescription")}
              />
            )}
            {messages.length > 0 ? (
              <AgentChatTranscriptList
                key={liveChatId || chatId || "draft"}
                messages={messages}
                registryId={registryId}
                transcriptRef={transcriptRef}
                userMessageIndices={userMessageIndices}
                onActiveUserMessage={setMessageNavIndex}
                scrollToIndexRef={scrollToIndexRef}
                activityStatus={
                  agentActivity.busy ? (
                    <AgentActivityIndicator activity={agentActivity} elapsedMs={elapsedMs} />
                  ) : null
                }
              />
            ) : agentActivity.busy ? (
              <div data-agent-chat-activity-status="">
                <AgentActivityIndicator activity={agentActivity} elapsedMs={elapsedMs} />
              </div>
            ) : null}
            <div
              ref={bottomRef}
              className="shrink-0 overflow-hidden"
              style={transcriptBottomPadStyle(
                transcriptBottomPad,
                overlayPadShrinking,
                reduceOverlayPadMotion,
              )}
              data-agent-chat-transcript-bottom-pad=""
              aria-hidden="true"
            />
          </ConversationContent>
          <ConversationScrollButton aria-label={t("bottom")}>
            <ChevronDown className="size-4" />
          </ConversationScrollButton>
          {!isRestoringTranscript && (
            <AgentMessageTimelineNav
              activeAgent={activeAgent}
              messages={messages}
              userMessageIndices={userMessageIndices}
              activeMessageIndex={messageNavIndex}
              onSelectMessage={handleSelectMessage}
            />
          )}
          </Conversation>
        </AgentChatCwdProvider>
      </div>

      <div className="relative flex min-h-0 w-full shrink-0 flex-col">
        {isNewChatLanding ? (
          <div className={cn("px-3 pb-14", wideContentClassName)}>
            {error ? (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : (
              <div className="flex justify-center" aria-hidden="true">
                <LogoSvg className="h-20 w-auto text-foreground" />
              </div>
            )}
          </div>
        ) : null}
        <div className={cn("relative z-10 shrink-0", wideContentClassName)}>
          <AgentPromptComposer
            key={queueKey}
            currentPlan={currentPlan}
            isResumedSession={isResumedSession}
            backgroundTools={backgroundTools}
            queuedPrompts={queuedPrompts}
            onRemoveQueuedPrompt={removeQueuedAgentChatPrompt}
            onUpdateQueuedPrompt={(id, prompt) => updateQueuedAgentChatPrompt(id, { prompt })}
            onMoveQueuedPrompt={moveQueuedAgentChatPrompt}
            onSubmit={handleSubmit}
            agentLocked={agentLocked}
            onProviderChange={setProviderId}
            canUseCurrentMode={canUseCurrentMode}
            isConnected={isConnected}
            chatMode={chatMode}
            instanceKey={instanceKey}
            sessionWorkspaceId={sessionWorkspaceId}
            sessionProjectId={sessionProjectId}
            loadingAgents={loadingAgents}
            isConnecting={isConnecting}
            isResumingHistory={isResumingHistory}
            catalogModelsLoading={catalogModelsLoading}
            onEmptyModelsOpen={refreshEmptyCatalog}
            chatId={liveChatId}
            runtimeStatus={runtimeStatus}
            hasPersistenceHandle={hasPersistenceHandle}
            installedAgents={installedAgents}
            configOptions={configOptions}
            modelsLocked={modelsLocked}
            modesLocked={modesLocked}
            registryId={registryId}
            activeAgent={activeAgent}
            setConfigOption={setConfigOption}
            agentActivity={agentActivity}
            sendCancel={sendCancel}
            setWaitingForResponse={setWaitingForResponse}
            setMessages={setMessages}
            stoppedRef={stoppedRef}
            projectPath={sessionCwd ?? localPath}
            availableCommands={availableCommands}
            workingDirectoryPicker={
              variant === "standalone" || (variant === "modal" && !liveChatId)
                ? {
                    projects,
                    selection: {
                      workspaceId: sessionWorkspaceId,
                      projectId: sessionProjectId,
                      cwd: sessionCwd,
                    },
                    onSelect: handleSelectWorkingDirectory,
                  }
                : null
            }
            landing={isNewChatLanding}
            sessionUsage={sessionUsage}
            onAboveComposerOverlaysNodeChange={setAboveComposerOverlaysNode}
            aboveInputOverlay={
              pendingPermission || pendingSessionOp ? (
                <div
                  data-agent-chat-approval-overlay=""
                  className="pointer-events-auto relative min-h-0 min-w-0 overflow-hidden"
                >
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 top-0 -z-10 bg-gradient-to-t from-background via-background/85 to-transparent" />
                  {pendingPermission ? (
                    <div className="min-h-0 min-w-0 max-h-[80cqh] px-3">
                      <AgentPermissionCard
                        permission={pendingPermission}
                        markdown={pendingPermissionMarkdown}
                        planIntent={
                          isPlanExitPermission(pendingPermission)
                            ? (planDocumentIntent
                              ?? (!pendingPermissionMarkdown?.trim() && !planFilePath
                                ? currentPlan
                                : null))
                            : null
                        }
                        planFilePath={
                          isPlanExitPermission(pendingPermission) ? planFilePath : null
                        }
                        onRespond={handlePermission}
                      />
                    </div>
                  ) : pendingSessionOp ? (
                    <div className="min-h-0 min-w-0 max-h-[50cqh] px-3">
                      <AgentSessionOpCard
                        request={pendingSessionOp}
                        onRespond={handleSessionOp}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null
            }
          />
        </div>
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
