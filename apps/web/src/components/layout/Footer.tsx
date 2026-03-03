"use client";
import React, { useState, useCallback } from 'react';
import { Activity, Tooltip, TooltipTrigger, TooltipContent } from '@workspace/ui';
import { cn } from "@/lib/utils";
import { useWebSocketStore } from '@/hooks/use-websocket';
import { useContextParams } from "@/hooks/use-context-params";
import { systemApi, type WsConnectionInfo } from '@/api/rest-api';

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

const Footer: React.FC = () => {
  const { connectionState } = useWebSocketStore();
  const { workspaceId: currentWorkspaceId, projectId: currentProjectId } = useContextParams();
  const [connections, setConnections] = useState<WsConnectionInfo[]>([]);
  const [loading, setLoading] = useState(false);

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
                  <span className="font-normal text-muted-foreground">{connections.length}</span>
                )}
              </div>
              {connectionState !== 'connected' ? (
                <div className="text-muted-foreground">Not connected</div>
              ) : loading && connections.length === 0 ? (
                <div className="text-muted-foreground">Loading...</div>
              ) : connections.length === 0 ? (
                <div className="text-muted-foreground">No connections</div>
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
                          <span className="text-muted-foreground">{conns.length}</span>
                        </div>
                        <div className="pl-2 space-y-px">
                          {conns.map((conn) => (
                            <div key={conn.id} className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground tabular-nums">{shortId(conn.id)}</span>
                              <span className="text-muted-foreground/60 tabular-nums">{formatIdleTime(conn.idle_secs)}</span>
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
        <div className="flex items-center space-x-2">
          <Activity className="size-3 text-emerald-500" />
          <span className="text-pretty">Agent: IDLE</span>
        </div>
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
