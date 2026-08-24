"use client";
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Button,
} from '@workspace/ui';
import { cn } from "@/shared/lib/utils";
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import { useAgentChatUrl } from '@/features/agent/hooks/use-agent-chat-url';
import type { WsConnectionInfo } from '@/api/rest-api';
import { buildUsageCarouselItems } from '@/features/quota-usage/lib/quota-display';
import { useQuotaOverviewQuery } from '@/features/quota-usage/hooks/use-quota-overview-query';
import { useWsConnectionsQuery } from '@/features/system/hooks/use-system-status-queries';
import {
  useAgentHooksStore,
  type AgentHookSession,
  AGENT_STATE,
  AGENT_TOOL_LABELS,
  AGENT_TOOL_ICON_IDS,
  type AgentToolType,
} from '@/features/agent/store/agent-hooks-store';
import { useShallow } from 'zustand/react/shallow';
import { AgentHookStatusIndicator } from '@/features/agent/components/AgentHookStatusIndicator';
import { AgentIcon } from '@/features/agent/components/AgentIcon';
import { AnimatePresence, motion } from 'motion/react';
import { useProjects } from '@/features/project/hooks/use-project-bootstrap-query';
import { LayoutDashboard, X } from 'lucide-react';
import { ProviderGlyph } from '@/app-shell/QuotaPopover';
import { BotMessageSquareIcon, type BotMessageSquareHandle, TextShimmer, FilledBellIcon } from '@workspace/ui';
import type { AnimatedIconHandle } from '@workspace/ui';
import { NappingBotIcon } from '@/app-shell/NappingBotIcon';
import { useExperimentSettingsStore } from '@/features/settings/store/experiment-settings-store';
import { useLayoutSettingsStore } from '@/features/settings/store/layout-settings-store';
import { useAppRouter } from '@/shared/hooks/use-app-router';
import { LocalServicesFooterItem } from '@/features/local-services/components/LocalServicesFooterItem';
import { ResourceMonitorFooterItem } from '@/features/resource-monitor/components/ResourceMonitorFooterItem';
import { effectiveShowResourceMonitor as resolveEffectiveShowResourceMonitor } from '@/features/resource-monitor/lib/resource-monitor-footer-visibility';
import {
  isAgentHookSideChatSession,
  navigateToAgentHookSessionPane,
  resolveAgentHookContextNames,
} from '@/features/agent/lib/agent-hook-navigation';
import { useTranslations } from 'next-intl';
import { APP_FOOTER_HEIGHT_CLASS } from '@/app-shell/sidebar-layout-constants';

function groupSessionsByContext(sessions: AgentHookSession[]): Map<string, AgentHookSession[]> {
  const grouped = new Map<string, AgentHookSession[]>();
  for (const session of sessions) {
    const key = session.context_id || session.project_path || "unknown";
    const list = grouped.get(key) ?? [];
    list.push(session);
    grouped.set(key, list);
  }
  return grouped;
}

function SessionStateBadge({ state, hoverAction, onAction }: {
  state: string;
  hoverAction: "idle" | "clear" | null;
  onAction: () => void;
}) {
  const label = state === AGENT_STATE.PERMISSION_REQUEST ? "PERM" : state.toUpperCase();
  const springTransition = { type: "spring" as const, stiffness: 500, damping: 30 };

  return (
    <div className="relative overflow-hidden shrink-0 h-5 w-[52px]">
      <AnimatePresence mode="popLayout" initial={false}>
        {hoverAction === "idle" ? (
          <motion.button
            key="reset-idle"
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40, opacity: 0 }}
            transition={springTransition}
            className="absolute inset-0 flex items-center justify-center text-[9px] font-mono px-1 py-px rounded text-emerald-500 bg-emerald-500/10 cursor-pointer hover:bg-emerald-500/20"
            onClick={(e) => { e.stopPropagation(); onAction(); }}
          >
            IDLE
          </motion.button>
        ) : hoverAction === "clear" ? (
          <motion.button
            key="clear"
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40, opacity: 0 }}
            transition={springTransition}
            className="absolute inset-0 flex items-center justify-center text-[9px] font-mono px-1 py-px rounded text-red-400 bg-red-500/10 cursor-pointer hover:bg-red-500/20"
            onClick={(e) => { e.stopPropagation(); onAction(); }}
          >
            CLEAR
          </motion.button>
        ) : (
          <motion.span
            key={state}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={springTransition}
            className={cn(
              "absolute inset-0 flex items-center justify-center text-[9px] font-mono px-1 py-px rounded",
              state === AGENT_STATE.IDLE && "text-emerald-500",
              state === AGENT_STATE.RUNNING && "text-blue-400 bg-blue-500/10",
              state === AGENT_STATE.PERMISSION_REQUEST && "text-amber-500 bg-amber-500/10",
            )}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function AgentToolName({
  tool,
  iconSize = 12,
  className,
}: {
  tool: AgentToolType;
  iconSize?: number;
  className?: string;
}) {
  const label = AGENT_TOOL_LABELS[tool] ?? tool;
  const iconId = AGENT_TOOL_ICON_IDS[tool] ?? tool;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <AgentIcon registryId={iconId} name={label} size={iconSize} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function SessionRow({ session, onNavigate, onCanvas = false }: { session: AgentHookSession; onNavigate: () => void; onCanvas?: boolean }) {
  const t = useTranslations("appShell");
  const [hovered, setHovered] = React.useState(false);
  const forceIdle = useAgentHooksStore((s) => s.forceSessionIdle);
  const removeSession = useAgentHooksStore((s) => s.removeSession);
  const isIdle = session.state === AGENT_STATE.IDLE;

  const hoverAction = !hovered ? null : isIdle ? "clear" as const : "idle" as const;
  const handleAction = () => {
    if (isIdle) {
      void removeSession(session.session_id);
    } else {
      void forceIdle(session.session_id);
    }
  };

  return (
    <div
      className="flex items-center justify-between gap-2 px-1 py-0.5 rounded-sm hover:bg-accent/50 cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onNavigate}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <AgentHookStatusIndicator state={session.state} variant="compact" placement="footer" />
        <AgentToolName tool={session.tool} iconSize={11} className="text-[10px] font-medium" />
        {isAgentHookSideChatSession(session) ? (
          <span className="shrink-0 rounded-sm bg-cyan-500/15 px-1 text-[9px] font-medium text-cyan-700 dark:text-cyan-300">
            {t("footer.sideChat")}
          </span>
        ) : null}
        {onCanvas && (
          <span title={t("footer.openOnCanvasLabel")} className="inline-flex shrink-0 text-sky-500">
            <LayoutDashboard className="size-3" />
          </span>
        )}
      </div>
      <SessionStateBadge
        state={session.state}
        hoverAction={hoverAction}
        onAction={handleAction}
      />
    </div>
  );
}

function useContextDisplayNameResolver() {
  const projects = useProjects();
  const t = useTranslations("appShell");
  return useCallback((contextKey: string): string => {
    if (contextKey === "unknown") return t("footer.unknownProject");
    for (const project of projects) {
      if (project.id === contextKey) return project.name;
      for (const ws of project.workspaces) {
        if (ws.id === contextKey) return `${project.name} / ${ws.branch}`;
      }
    }
    if (contextKey.includes("/") || contextKey.includes("\\")) {
      return contextKey.split(/[\\/]/).slice(-2).join("/");
    }
    return contextKey.slice(0, 8);
  }, [projects, t]);
}

function useContextNameResolver() {
  const projects = useProjects();
  return useCallback(
    (contextId: string | null | undefined) =>
      resolveAgentHookContextNames(contextId, null, projects),
    [projects],
  );
}

// Cycling ticker: rotates through active sessions, showing each for `intervalMs`.
function useSessionTicker(sessions: AgentHookSession[], intervalMs = 3000) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (sessions.length <= 1) return;
    const t = setInterval(() => setIndex((i) => i + 1), intervalMs);
    return () => clearInterval(t);
  }, [sessions.length, intervalMs]);

  if (sessions.length === 0) return null;
  return sessions[index % sessions.length];
}

export function AgentStatusPopoverContent({
  embedded = false,
  onNavigateSession,
  isSessionOnCanvas,
}: {
  embedded?: boolean;
  onNavigateSession?: (session: AgentHookSession) => void;
  isSessionOnCanvas?: (session: AgentHookSession) => boolean;
} = {}) {
  const t = useTranslations("appShell");
  const sessionsMap = useAgentHooksStore(useShallow((s) => s.sessions));
  const clearIdleSessions = useAgentHooksStore((s) => s.clearIdleSessions);
  const router = useAppRouter();
  const projects = useProjects();

  const sessions = useMemo(() => Array.from(sessionsMap.values()), [sessionsMap]);
  const grouped = useMemo(() => groupSessionsByContext(sessions), [sessions]);
  const hasIdleSessions = sessions.some(s => s.state === AGENT_STATE.IDLE);
  const resolveContextDisplayName = useContextDisplayNameResolver();
  const resolveContextName = useContextNameResolver();

  const navigateToSessionPane = useCallback((session: AgentHookSession) => {
    if (onNavigateSession) {
      onNavigateSession(session);
      return;
    }
    navigateToAgentHookSessionPane(session, router, projects);
  }, [onNavigateSession, router, projects]);

  if (sessions.length === 0) {
    return (
      <div
        className={cn(
          "p-3 text-[11px] text-muted-foreground",
          embedded && "flex h-full items-center justify-center text-center",
        )}
      >
        {t("footer.noActiveAgentSessions")}
      </div>
    );
  }

  return (
      <div className={cn("p-2 overflow-y-auto", embedded ? "h-full" : "max-h-64")}>
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[11px] font-semibold text-foreground">
          {t("footer.agentSessions", { count: sessions.length })}
        </span>
        {hasIdleSessions && (
          <Button
            variant="ghost"
            size="sm"
          className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => clearIdleSessions()}
        >
          <X className="size-3 mr-0.5" />
          {t("footer.clearIdle")}
        </Button>
      )}
    </div>

      <div className="space-y-2">
        {Array.from(grouped.entries()).map(([contextKey, pathSessions]) => {
          const displayName = resolveContextDisplayName(contextKey);
          const { projectName, workspaceName, workspaceDisplayName } = resolveContextName(contextKey);
          const contextLabel = projectName
            ? [projectName, workspaceDisplayName ?? workspaceName].filter(Boolean).join(" / ")
            : displayName;
          return (
            <div key={contextKey} className="space-y-0.5">
              <div
                className="px-1 text-[10px] font-medium text-muted-foreground truncate"
                title={contextKey}
              >
                {contextLabel}
              </div>
              {pathSessions.map((session) => (
                <SessionRow
                  key={session.session_id}
                  session={session}
                  onCanvas={isSessionOnCanvas?.(session) ?? false}
                  onNavigate={() => navigateToSessionPane(session)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PermissionBellFooter() {
  const t = useTranslations("appShell");

  const iconRef = useRef<AnimatedIconHandle>(null);
  useEffect(() => {
    const t = setInterval(() => { iconRef.current?.startAnimation(); }, 2000);
    iconRef.current?.startAnimation();
    return () => clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center text-amber-400/70 ml-0.5" title={t("footer.permissionRequested")}>
      <FilledBellIcon ref={iconRef} size={12} color="currentColor" strokeWidth={0} />
    </span>
  );
}

function AcpChatButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("appShell");
  const iconRef = useRef<BotMessageSquareHandle>(null);
  return (
    <button
      type="button"
      aria-label={t("footer.openAgentChat")}
      className="inline-flex h-5 items-center gap-1 rounded-sm bg-transparent px-1 text-[10px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      onClick={onClick}
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
    >
      <BotMessageSquareIcon ref={iconRef} size={12} />
      <span className="whitespace-nowrap">{t("footer.acpChat")}</span>
    </button>
  );
}

function HoverScrollText({ text, active }: { text: string; active: boolean }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopScroll = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    const el = textRef.current;
    if (el) el.scrollLeft = 0;
  }, []);

  const startScroll = useCallback(() => {
    const el = textRef.current;
    if (!el) return;

    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow <= 0) return;

    stopScroll();
    timeoutRef.current = setTimeout(() => {
      const duration = overflow * 40;
      const startTime = performance.now();

      const step = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1);
        el.scrollLeft = overflow * progress;
        if (progress < 1) {
          animRef.current = requestAnimationFrame(step);
        }
      };

      animRef.current = requestAnimationFrame(step);
    }, 400);
  }, [stopScroll]);

  useEffect(() => {
    stopScroll();
    return stopScroll;
  }, [text, stopScroll]);

  useEffect(() => {
    if (active) {
      startScroll();
      return;
    }
    stopScroll();
  }, [active, startScroll, stopScroll]);

  return (
    <span
      ref={textRef}
      className="block overflow-hidden whitespace-nowrap font-medium text-muted-foreground"
      title={text}
    >
      {text}
    </span>
  );
}

const Footer: React.FC = () => {
  const t = useTranslations("appShell");
  const connectionState = useWebSocketStore(s => s.connectionState);
  const [, setAgentChatOpen] = useAgentChatUrl();
  const launchpadAgentsEnabled = useExperimentSettingsStore((s) => s.launchpadAgentsEnabled);
  const loadExperimentSettings = useExperimentSettingsStore((s) => s.loadSettings);
  const showWsConnection = useLayoutSettingsStore((s) => s.showWsConnection);
  const showLocalServices = useLayoutSettingsStore((s) => s.showLocalServices);
  const layoutLoaded = useLayoutSettingsStore((s) => s.loaded);
  const showResourceMonitor = useLayoutSettingsStore((s) => s.showResourceMonitor);
  const effectiveShowResourceMonitor = resolveEffectiveShowResourceMonitor(
    layoutLoaded,
    showResourceMonitor,
  );
  const showUsageCarousel = useLayoutSettingsStore((s) => s.showUsageCarousel);
  const showAgentStatus = useLayoutSettingsStore((s) => s.showAgentStatus);
  const loadLayoutSettings = useLayoutSettingsStore((s) => s.loadSettings);
  const usageQuery = useQuotaOverviewQuery({
    enabled: connectionState === 'connected' && showUsageCarousel,
  });
  const quotaOverview = usageQuery.data ?? null;
  const [connectionsEnabled, setConnectionsEnabled] = useState(false);
  const wsConnectionsQuery = useWsConnectionsQuery({
    enabled: connectionState === 'connected' && showWsConnection && connectionsEnabled,
  });
  const connections: WsConnectionInfo[] = wsConnectionsQuery.data?.connections ?? [];
  const [usageIndex, setUsageIndex] = useState(0);
  const [isUsageCarouselHovered, setIsUsageCarouselHovered] = useState(false);

  const resolveContextName = useContextNameResolver();

  // Global: all non-idle sessions for the ticker, permission flag for the bell.
  const activeSessions = useAgentHooksStore(useShallow((s) =>
    Array.from(s.sessions.values()).filter((s) => s.state !== AGENT_STATE.IDLE)
  ));
  const hasPermission = activeSessions.some((s) => s.state === AGENT_STATE.PERMISSION_REQUEST);
  const tickerSession = useSessionTicker(activeSessions);
  const usageCarouselItems = useMemo(
    () => buildUsageCarouselItems(quotaOverview),
    [quotaOverview]
  );
  const usageCarouselItem = usageCarouselItems.length > 0
    ? usageCarouselItems[usageIndex % usageCarouselItems.length]
    : null;

  useEffect(() => {
    void loadExperimentSettings();
    void loadLayoutSettings();
  }, [loadExperimentSettings, loadLayoutSettings]);

  useEffect(() => {
    setUsageIndex(0);
  }, [usageCarouselItems.length]);

  useEffect(() => {
    if (isUsageCarouselHovered) return;
    if (usageCarouselItems.length <= 1) return;
    const timer = window.setInterval(() => {
      setUsageIndex((index) => index + 1);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [isUsageCarouselHovered, usageCarouselItems.length]);

  const fetchConnections = useCallback(() => {
    if (connectionState !== 'connected') return;
    setConnectionsEnabled(true);
    void wsConnectionsQuery.refetch();
  }, [connectionState, wsConnectionsQuery.refetch]);

  const statusColors: Record<typeof connectionState, string> = {
    connected: 'bg-emerald-500',
    connecting: 'bg-yellow-500',
    reconnecting: 'bg-orange-500',
    disconnected: 'bg-red-500',
  };

  const statusText: Record<typeof connectionState, string> = {
    connected: t("footer.status.normal"),
    connecting: t("footer.status.connecting"),
    reconnecting: t("footer.status.reconnecting"),
    disconnected: t("footer.status.disconnected"),
  };

  const showLeftCarousel = showUsageCarousel && Boolean(usageCarouselItem);
  const showWsStatus = showWsConnection && connectionState !== "connected";
  const showLeft = showWsStatus || showLocalServices || effectiveShowResourceMonitor || showLeftCarousel;
  const showRightAgent = showAgentStatus;
  const showRightAcp = launchpadAgentsEnabled;
  const showRight = showRightAgent || showRightAcp;

  if (!showLeft && !showRight) {
    return null;
  }

  return (
    <footer className={cn(APP_FOOTER_HEIGHT_CLASS, "flex shrink-0 items-center justify-between px-3 backdrop-blur-md text-[10px] font-mono text-muted-foreground select-none")}>
      {showLeft ? (
        <div className="flex items-center space-x-2">
          {showWsStatus ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="flex items-center hover:text-foreground cursor-pointer"
                  onMouseEnter={fetchConnections}
                >
                  <div className={cn(
                    "size-2 rounded-full mr-2",
                    statusColors[connectionState],
                    "animate-pulse"
                  )}></div>
                  <span className="font-medium text-muted-foreground">{statusText[connectionState]}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs p-0">
                <div className="px-3 py-2 text-[11px] font-mono">
                  <div className="font-semibold mb-1.5 flex items-center justify-between gap-4">
                    <span>{t("footer.activeWebSocket")}</span>
                    {connections.length > 0 && (
                      <span className="font-normal text-background/90">{connections.length}</span>
                    )}
                  </div>
                  <div className="text-background/90">{t("footer.notConnected")}</div>
                </div>
              </TooltipContent>
            </Tooltip>
          ) : null}
          {showWsStatus && (showLocalServices || effectiveShowResourceMonitor || showLeftCarousel) ? (
            <div className="h-3 w-px bg-border" />
          ) : null}
          {showLocalServices ? (
            <LocalServicesFooterItem />
          ) : null}
          {showLocalServices && (effectiveShowResourceMonitor || showLeftCarousel) ? (
            <div className="h-3 w-px bg-border" />
          ) : null}
          {effectiveShowResourceMonitor ? (
            <ResourceMonitorFooterItem />
          ) : null}
          {effectiveShowResourceMonitor && showLeftCarousel ? (
            <div className="h-3 w-px bg-border" />
          ) : null}
          {showLeftCarousel && usageCarouselItem ? (
            <div
              className="flex min-w-0 w-[min(360px,38vw)] items-center gap-1.5 text-muted-foreground"
              onMouseEnter={() => setIsUsageCarouselHovered(true)}
              onMouseLeave={() => setIsUsageCarouselHovered(false)}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={usageCarouselItem.providerId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="flex shrink-0 items-center justify-center text-foreground/85"
                >
                  <ProviderGlyph providerId={usageCarouselItem.providerId} size={12} />
                </motion.span>
              </AnimatePresence>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={usageCarouselItem.providerId}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="min-w-0 flex-1"
                >
                  <HoverScrollText
                    text={usageCarouselItem.text}
                    active={isUsageCarouselHovered}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          ) : null}
        </div>
      ) : (
        <div />
      )}

      {showRight ? (
        <div className="flex items-center space-x-2">
          {showRightAgent ? (
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 hover:text-foreground cursor-pointer">
                  {tickerSession ? (
                    <>
                      <AgentHookStatusIndicator
                        state={tickerSession.state}
                        variant="compact"
                        placement="footer"
                      />
                      <span
                        key={tickerSession.session_id}
                        className="flex items-center gap-0 animate-in fade-in slide-in-from-bottom-1 duration-200"
                      >
                        {(() => {
                          const { projectName, workspaceName, workspaceDisplayName } =
                            resolveContextName(tickerSession.context_id);
                          const workspaceTickerLabel = workspaceDisplayName ?? workspaceName;
                          return projectName ? (
                            <span className="font-medium whitespace-nowrap text-foreground">
                              {projectName}
                              {workspaceTickerLabel && (
                                <>
                                  <span className="text-muted-foreground mx-0.5">-</span>
                                  <span>{workspaceTickerLabel}</span>
                                </>
                              )}
                            </span>
                          ) : null;
                        })()}
                        {isAgentHookSideChatSession(tickerSession) ? (
                          <>
                            <span className="text-muted-foreground mx-1">/</span>
                            <span className="whitespace-nowrap text-cyan-700 dark:text-cyan-300">
                              {t("footer.sideChat")}
                            </span>
                          </>
                        ) : null}
                        <span className="text-muted-foreground mx-1">/</span>
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <AgentIcon
                            registryId={AGENT_TOOL_ICON_IDS[tickerSession.tool] ?? tickerSession.tool}
                            name={AGENT_TOOL_LABELS[tickerSession.tool] ?? tickerSession.tool}
                            size={12}
                          />
                          <TextShimmer
                            as="span"
                            className={cn(
                              "text-[10px] whitespace-nowrap",
                              tickerSession.state === AGENT_STATE.PERMISSION_REQUEST && "text-amber-400/60",
                            )}
                            duration={tickerSession.state === AGENT_STATE.PERMISSION_REQUEST ? 2 : 1.5}
                          >
                            {`${AGENT_TOOL_LABELS[tickerSession.tool] ?? tickerSession.tool}: ${tickerSession.state === AGENT_STATE.PERMISSION_REQUEST ? t("footer.waitingForPermission") : t("footer.running")}`}
                          </TextShimmer>
                        </span>
                      </span>
                      {hasPermission && <PermissionBellFooter />}
                    </>
                  ) : (
                    activeSessions.length === 0 ? (
                      <span className="text-muted-foreground whitespace-nowrap inline-flex items-center gap-1.5">
                        <NappingBotIcon />
                        <span>{t("footer.napping")}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground whitespace-nowrap">{t("footer.agentIdle")}</span>
                    )
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" className="w-72 p-0">
                <AgentStatusPopoverContent />
              </PopoverContent>
            </Popover>
          ) : null}
          {showRightAgent && showRightAcp ? (
            <div className="h-3 w-px bg-border" />
          ) : null}
          {showRightAcp ? (
            <AcpChatButton onClick={() => setAgentChatOpen(true)} />
          ) : null}
        </div>
      ) : null}
    </footer>
  );
};

export default Footer;
