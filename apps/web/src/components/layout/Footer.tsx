"use client";
import React, { useState, useCallback, useMemo } from 'react';
import {
  Activity,
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
import { useContextParams } from "@/hooks/use-context-params";
import { systemApi, type WsConnectionInfo } from '@/api/rest-api';
import { useAgentHooksStore, type AgentHookSession, type AgentHookState } from '@/hooks/use-agent-hooks-store';
import { AgentHookStatusIndicator } from '@/components/agent/AgentHookStatusIndicator';
import { X } from 'lucide-react';

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

const TOOL_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  "codex": "Codex",
  "opencode": "opencode",
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

function groupSessionsByProjectPath(sessions: AgentHookSession[]): Map<string, AgentHookSession[]> {
  const grouped = new Map<string, AgentHookSession[]>();
  for (const session of sessions) {
    const key = session.project_path ?? "unknown";
    const list = grouped.get(key) ?? [];
    list.push(session);
    grouped.set(key, list);
  }
  return grouped;
}

function AgentStatusPopoverContent() {
  const sessions = useAgentHooksStore((s) => s.getAllSessions());
  const clearIdleSessions = useAgentHooksStore((s) => s.clearIdleSessions);

  const grouped = useMemo(() => groupSessionsByProjectPath(sessions), [sessions]);
  const hasIdleSessions = sessions.some(s => s.state === "idle");

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
        {Array.from(grouped.entries()).map(([path, pathSessions]) => {
          const displayPath = path === "unknown" ? "Unknown project" : path.split("/").slice(-2).join("/");
          return (
            <div key={path} className="space-y-0.5">
              <div className="text-[10px] font-medium text-muted-foreground px-1 truncate" title={path}>
                {displayPath}
              </div>
              {pathSessions.map((session) => (
                <div
                  key={session.session_id}
                  className="flex items-center justify-between gap-2 px-1 py-0.5 rounded-sm hover:bg-accent/50"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <AgentHookStatusIndicator
                      state={session.state}
                      variant="compact"
                    />
                    <span className="text-[10px] font-medium truncate">
                      {TOOL_LABELS[session.tool] ?? session.tool}
                    </span>
                  </div>
                  <span className={cn(
                    "text-[9px] font-mono shrink-0 px-1 py-px rounded",
                    session.state === "idle" && "text-emerald-500",
                    session.state === "running" && "text-blue-400 bg-blue-500/10",
                    session.state === "permission_request" && "text-amber-500 bg-amber-500/10",
                  )}>
                    {session.state === "permission_request" ? "PERM" : session.state.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const Footer: React.FC = () => {
  const connectionState = useWebSocketStore(s => s.connectionState);
  const { workspaceId: currentWorkspaceId, projectId: currentProjectId } = useContextParams();
  const [connections, setConnections] = useState<WsConnectionInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const globalState = useAgentHooksStore((s) => s.getGlobalState());
  const latestSession = useAgentHooksStore((s) => s.getLatestSession());

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
      </div>

      {/* Right Status */}
      <div className="flex items-center space-x-2">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center space-x-1.5 hover:text-foreground transition-colors cursor-pointer">
              <AgentHookStatusIndicator
                state={globalState}
                variant="full"
                tool={latestSession?.tool ? (TOOL_LABELS[latestSession.tool] ?? latestSession.tool) : undefined}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            className="w-72 p-0"
          >
            <AgentStatusPopoverContent />
          </PopoverContent>
        </Popover>
        <div className="h-3 w-px bg-border"></div>
        {currentWorkspaceId ? (
          <span className="px-1.5 py-0.5 rounded-sm text-[10px] bg-emerald-500/10 text-emerald-500 font-medium whitespace-nowrap">
            Dev on workspace
          </span>
        ) : currentProjectId ? (
          <span className="px-1.5 py-0.5 rounded-sm text-[10px] bg-amber-500/10 text-amber-500 font-medium whitespace-nowrap">
            Dev on main
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded-sm text-[10px] bg-neutral-500/10 text-neutral-500 font-medium whitespace-nowrap">
            Waiting to build
          </span>
        )}
      </div>
    </footer>
  );
};

export default Footer;
