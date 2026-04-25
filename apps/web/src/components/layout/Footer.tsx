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
import { cn } from "@/lib/utils";
import { useWebSocketStore } from '@/hooks/use-websocket';
import { useAgentChatUrl } from '@/hooks/use-agent-chat-url';
import { systemApi, type WsConnectionInfo } from '@/api/rest-api';
import { usageWsApi, type UsageOverviewResponse } from '@/api/ws-api';
import { buildUsageCarouselItems } from '@/lib/usage-display';
import {
  useAgentHooksStore,
  type AgentHookSession,
  AGENT_STATE,
  AGENT_TOOL_LABELS,
} from '@/hooks/use-agent-hooks-store';
import { useShallow } from 'zustand/react/shallow';
import { AgentHookStatusIndicator } from '@/components/agent/AgentHookStatusIndicator';
import { AnimatePresence, motion } from 'motion/react';
import { useProjectStore } from '@/hooks/use-project-store';
import { X } from 'lucide-react';
import { ProviderGlyph } from '@/components/layout/UsagePopover';
import { BotMessageSquareIcon, type BotMessageSquareHandle, TextShimmer, FilledBellIcon } from '@workspace/ui';
import type { AnimatedIconHandle } from '@workspace/ui';
import { NappingBotIcon } from '@/components/layout/NappingBotIcon';

const CLIENT_TYPE_LABELS: Record<string, string> = {
  web: 'WEB',
  desktop: 'DSK',
  cli: 'CLI',
  mobile: 'MOB',
  unknown: 'UNK',
};

const CLIENT_TYPE_STYLES: Record<string, string> = {
  web: "bg-blue-500/20 text-blue-400",
  desktop: "bg-purple-500/20 text-purple-400",
  cli: "bg-amber-500/20 text-amber-400",
  mobile: "bg-green-500/20 text-green-400",
};

function formatIdleTime(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

function shortId(id: string): string {
  const dash = id.indexOf('-');
  if (dash === -1) return id.slice(0, 8);
  return id.slice(dash + 1, dash + 9);
}

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
            className="absolute inset-0 flex items-center justify-center text-[9px] font-mono px-1 py-px rounded text-emerald-500 bg-emerald-500/10 cursor-pointer hover:bg-emerald-500/20 transition-colors"
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
            className="absolute inset-0 flex items-center justify-center text-[9px] font-mono px-1 py-px rounded text-red-400 bg-red-500/10 cursor-pointer hover:bg-red-500/20 transition-colors"
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

function SessionRow({ session }: { session: AgentHookSession }) {
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
      className="flex items-center justify-between gap-2 px-1 py-0.5 rounded-sm hover:bg-accent/50"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <AgentHookStatusIndicator state={session.state} variant="compact" />
        <span className="text-[10px] font-medium">
          {AGENT_TOOL_LABELS[session.tool] ?? session.tool}
        </span>
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
  const projects = useProjectStore((s) => s.projects);
  return useCallback((contextKey: string): string => {
    if (contextKey === "unknown") return "Unknown project";
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
  }, [projects]);
}

function useContextNameResolver() {
  const projects = useProjectStore((s) => s.projects);
  return useCallback((contextId: string | null | undefined): { projectName: string; workspaceName: string | null } => {
    if (!contextId) return { projectName: "", workspaceName: null };
    for (const project of projects) {
      if (project.id === contextId) return { projectName: project.name, workspaceName: null };
      const ws = project.workspaces.find((w) => w.id === contextId);
      if (ws) return { projectName: project.name, workspaceName: ws.displayName || ws.name || ws.branch };
    }
    return { projectName: contextId.slice(0, 8), workspaceName: null };
  }, [projects]);
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

function AgentStatusPopoverContent() {
  const sessionsMap = useAgentHooksStore(useShallow((s) => s.sessions));
  const clearIdleSessions = useAgentHooksStore((s) => s.clearIdleSessions);

  const sessions = useMemo(() => Array.from(sessionsMap.values()), [sessionsMap]);
  const grouped = useMemo(() => groupSessionsByContext(sessions), [sessions]);
  const hasIdleSessions = sessions.some(s => s.state === AGENT_STATE.IDLE);
  const resolveContextDisplayName = useContextDisplayNameResolver();

  if (sessions.length === 0) {
    return (
      <div className="p-3 text-[11px] text-muted-foreground">
        No active agent sessions
      </div>
    );
  }

  return (
    <div className="p-2 max-h-64 overflow-y-auto">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[11px] font-semibold text-foreground">
          Agent Sessions ({sessions.length})
        </span>
        {hasIdleSessions && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => clearIdleSessions()}
          >
            <X className="size-3 mr-0.5" />
            Clear idle
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {Array.from(grouped.entries()).map(([contextKey, pathSessions]) => {
          const displayName = resolveContextDisplayName(contextKey);
          return (
            <div key={contextKey} className="space-y-0.5">
              <div className="text-[10px] font-medium text-muted-foreground px-1 truncate" title={contextKey}>
                {displayName}
              </div>
              {pathSessions.map((session) => (
                <SessionRow key={session.session_id} session={session} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PermissionBellFooter() {

  const iconRef = useRef<AnimatedIconHandle>(null);
  useEffect(() => {
    const t = setInterval(() => { iconRef.current?.startAnimation(); }, 2000);
    iconRef.current?.startAnimation();
    return () => clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center text-amber-400/70 ml-0.5" title="Permission requested">
      <FilledBellIcon ref={iconRef} size={12} color="currentColor" strokeWidth={0} />
    </span>
  );
}

function AcpChatButton({ onClick }: { onClick: () => void }) {
  const iconRef = useRef<BotMessageSquareHandle>(null);
  return (
    <button
      type="button"
      aria-label="Open Agent Chat"
      className="inline-flex h-5 items-center gap-1 rounded-sm bg-transparent px-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
      onClick={onClick}
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
    >
      <BotMessageSquareIcon ref={iconRef} size={12} />
      <span className="whitespace-nowrap">ACP Chat</span>
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
  const connectionState = useWebSocketStore(s => s.connectionState);
  const [, setAgentChatOpen] = useAgentChatUrl();
  const [connections, setConnections] = useState<WsConnectionInfo[]>([]);
  const [usageOverview, setUsageOverview] = useState<UsageOverviewResponse | null>(null);
  const [usageIndex, setUsageIndex] = useState(0);
  const [isUsageCarouselHovered, setIsUsageCarouselHovered] = useState(false);
  const [loading, setLoading] = useState(false);

  const resolveContextName = useContextNameResolver();

  // Global: all non-idle sessions for the ticker, permission flag for the bell.
  const activeSessions = useAgentHooksStore(useShallow((s) =>
    Array.from(s.sessions.values()).filter((s) => s.state !== AGENT_STATE.IDLE)
  ));
  const hasPermission = activeSessions.some((s) => s.state === AGENT_STATE.PERMISSION_REQUEST);
  const tickerSession = useSessionTicker(activeSessions);
  const usageCarouselItems = useMemo(
    () => buildUsageCarouselItems(usageOverview),
    [usageOverview]
  );
  const usageCarouselItem = usageCarouselItems.length > 0
    ? usageCarouselItems[usageIndex % usageCarouselItems.length]
    : null;

  useEffect(() => {
    if (connectionState !== 'connected') return;

    let cancelled = false;
    usageWsApi.getOverview(false)
      .then((overview) => {
        if (!cancelled) setUsageOverview(overview);
      })
      .catch(() => {
        if (!cancelled) setUsageOverview(null);
      });

    return () => {
      cancelled = true;
    };
  }, [connectionState]);

  useEffect(() => {
    return useWebSocketStore
      .getState()
      .onEvent("usage_overview_updated", (data: unknown) => {
        setUsageOverview(data as UsageOverviewResponse);
      });
  }, []);

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

  const fetchConnections = useCallback(async () => {
    if (connectionState !== 'connected') return;
    setLoading(true);
    try {
      const data = await systemApi.getWsConnections();
      setConnections(data.connections);
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, [connectionState]);

  const statusColors: Record<typeof connectionState, string> = {
    connected: 'bg-emerald-500',
    connecting: 'bg-yellow-500',
    reconnecting: 'bg-orange-500',
    disconnected: 'bg-red-500',
  };

  const statusText: Record<typeof connectionState, string> = {
    connected: 'NORMAL',
    connecting: 'CONNECTING',
    reconnecting: 'RECONNECTING',
    disconnected: 'DISCONNECTED',
  };

  const grouped = connections.reduce<Record<string, WsConnectionInfo[]>>((acc, conn) => {
    const key = conn.client_type;
    (acc[key] ??= []).push(conn);
    return acc;
  }, {});

  return (
    <footer className="h-6 flex items-center justify-between px-3 backdrop-blur-md border-t border-sidebar-border text-[10px] font-mono text-muted-foreground select-none shadow-sm">

      {/* Left Status */}
      <div className="flex items-center space-x-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="flex items-center hover:text-foreground cursor-pointer transition-colors ease-out duration-200"
              onMouseEnter={fetchConnections}
            >
              <div className={cn(
                "size-2 rounded-full mr-2",
                statusColors[connectionState],
                connectionState !== 'connected' && "animate-pulse"
              )}></div>
              <span className="font-medium text-muted-foreground">WebSocket: {statusText[connectionState]}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs p-0">
            <div className="px-3 py-2 text-[11px] font-mono">
              <div className="font-semibold mb-1.5 flex items-center justify-between gap-4">
                <span>Active Connections</span>
                {connections.length > 0 && (
                  <span className="font-normal text-background/90">{connections.length}</span>
                )}
              </div>
              {connectionState !== 'connected' ? (
                <div className="text-background/90">Not connected</div>
              ) : loading && connections.length === 0 ? (
                <div className="text-background/90">Loading...</div>
              ) : connections.length === 0 ? (
                <div className="text-background/90">No connections</div>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(grouped).map(([type, conns]) => {
                    const label = CLIENT_TYPE_LABELS[type] ?? type.toUpperCase();
                    const style = CLIENT_TYPE_STYLES[type] ?? "bg-neutral-500/20 text-neutral-400";
                    return (
                      <div key={type}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={cn("inline-block rounded-sm px-1 py-px text-[9px] font-bold leading-tight", style)}>
                            {label}
                          </span>
                          <span className="text-background/90">{conns.length}</span>
                        </div>
                        <div className="pl-2 space-y-px">
                          {conns.map((conn) => (
                            <div key={conn.id} className="flex items-center justify-between gap-3">
                              <span className="text-background/90 tabular-nums">{shortId(conn.id)}</span>
                              <span className="text-background/70 tabular-nums">{formatIdleTime(conn.idle_secs)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
        <div className="h-3 w-px bg-border"></div>
        {usageCarouselItem ? (
          <>
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
          </>
        ) : null}
      </div>

      {/* Right Status */}
      <div className="flex items-center space-x-2">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer">
              {tickerSession ? (
                <>
                  {/* Spinner for the current ticker session */}
                  <AgentHookStatusIndicator state={tickerSession.state} variant="compact" />

                  {/* Ticker label — key remounts on session change, CSS handles fade-in.
                      Plain span (no motion wrapper) so TextShimmer's internal
                      motion.create animation is never nested inside another
                      AnimatePresence and its backgroundPosition isn't interrupted. */}
                  <span
                    key={tickerSession.session_id}
                    className="flex items-center gap-0 animate-in fade-in slide-in-from-bottom-1 duration-200"
                  >
                    {(() => {
                      const { projectName, workspaceName } = resolveContextName(tickerSession.context_id);
                      return projectName ? (
                        <span className="font-medium whitespace-nowrap text-foreground">
                          {projectName}
                          {workspaceName && (
                            <>
                              <span className="text-muted-foreground mx-0.5">-</span>
                              <span>{workspaceName}</span>
                            </>
                          )}
                        </span>
                      ) : null;
                    })()}
                    <span className="text-muted-foreground mx-1">/</span>
                    <TextShimmer
                      as="span"
                      className={cn(
                        "text-[10px] whitespace-nowrap",
                        tickerSession.state === AGENT_STATE.PERMISSION_REQUEST && "text-amber-400/60",
                      )}
                      duration={tickerSession.state === AGENT_STATE.PERMISSION_REQUEST ? 2 : 1.5}
                    >
                      {`${AGENT_TOOL_LABELS[tickerSession.tool] ?? tickerSession.tool}: ${tickerSession.state === AGENT_STATE.PERMISSION_REQUEST ? "Waiting for permission" : "Running"}`}
                    </TextShimmer>
                  </span>

                  {/* Permission bell — always visible when any session needs attention */}
                  {hasPermission && <PermissionBellFooter />}
                </>
              ) : (
                activeSessions.length === 0 ? (
                  <span className="text-muted-foreground whitespace-nowrap inline-flex items-center gap-1.5">
                    <NappingBotIcon />
                    <span>Napping ~</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground whitespace-nowrap">Agent: Idle</span>
                )
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-72 p-0">
            <AgentStatusPopoverContent />
          </PopoverContent>
        </Popover>
        <div className="h-3 w-px bg-border"></div>
        <AcpChatButton onClick={() => setAgentChatOpen(true)} />
      </div>
    </footer>
  );
};

export default Footer;
