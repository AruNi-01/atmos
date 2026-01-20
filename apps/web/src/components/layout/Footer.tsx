"use client";
import React from 'react';
import { GitBranch, Activity, Wifi } from '@workspace/ui';
import { cn } from "@/lib/utils";
import { useWebSocketStore } from '@/hooks/use-websocket';

const Footer: React.FC = () => {
  const { connectionState } = useWebSocketStore();

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

  return (
    <footer className="h-6 flex items-center justify-between px-3 backdrop-blur-md border-t border-sidebar-border text-[10px] font-mono text-muted-foreground select-none shadow-sm">

      {/* Left Status */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center hover:text-foreground cursor-pointer transition-colors ease-out duration-200" title={`WebSocket: ${connectionState}`}>
          <div className={cn(
            "size-2 rounded-full mr-2",
            statusColors[connectionState],
            connectionState !== 'connected' && "animate-pulse"
          )}></div>
          <span className="font-medium text-muted-foreground">{statusText[connectionState]}</span>
        </div>
        <div className="flex items-center space-x-1.5 hover:text-blue-500 cursor-pointer transition-colors ease-out duration-200">
          <GitBranch className="size-3" />
          <span className="text-pretty">feat/auth-flow</span>
        </div>
        <div className="h-3 w-px bg-border"></div>
        <div className="flex items-center space-x-1 tabular-nums">
          <span>0 errors</span>
          <span className="text-muted-foreground/30">|</span>
          <span>1 warning</span>
        </div>
      </div>

      {/* Right Status */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Activity className="size-3 text-emerald-500" />
          <span className="text-pretty">agent: idle</span>
        </div>
        <div className="flex items-center space-x-3 tabular-nums">
          <span>Ln 42, Col 18</span>
          <span>UTF-8</span>
          <span className="text-pretty">TypeScript</span>
        </div>
        <div className="flex items-center text-muted-foreground">
          <Wifi className="size-3" />
        </div>
      </div>
    </footer>
  );
};

export default Footer;