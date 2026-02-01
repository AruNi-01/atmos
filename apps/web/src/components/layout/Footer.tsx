"use client";
import React from 'react';
import { Activity } from '@workspace/ui';
import { cn } from "@/lib/utils";
import { useWebSocketStore } from '@/hooks/use-websocket';
import { useSearchParams } from 'next/navigation';
import { useProjectStore } from '@/hooks/use-project-store';

const Footer: React.FC = () => {
  const { connectionState } = useWebSocketStore();
  const searchParams = useSearchParams();
  const currentWorkspaceId = searchParams.get('workspaceId');
  const { projects } = useProjectStore();
  const currentProject = projects[0];

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
      <div className="flex items-center space-x-2">
        <div className="flex items-center hover:text-foreground cursor-pointer transition-colors ease-out duration-200" title={`WebSocket: ${connectionState}`}>
          <div className={cn(
            "size-2 rounded-full mr-2",
            statusColors[connectionState],
            connectionState !== 'connected' && "animate-pulse"
          )}></div>
          <span className="font-medium text-muted-foreground">WebSocket: {statusText[connectionState]}</span>
        </div>
        <div className="h-3 w-px bg-border"></div>
      </div>

      {/* Right Status */}
      <div className="flex items-center space-x-2">
        <div className="flex items-center space-x-2">
          <Activity className="size-3 text-emerald-500" />
          <span className="text-pretty">Agent: IDLE</span>
        </div>
        {currentProject && (
          <>
            <div className="h-3 w-px bg-border"></div>
            {!currentWorkspaceId ? (
              <span className="px-1.5 py-0.5 rounded-sm text-[10px] bg-amber-500/10 text-amber-500 font-medium whitespace-nowrap">
                Dev on main
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-sm text-[10px] bg-emerald-500/10 text-emerald-500 font-medium whitespace-nowrap">
                Dev on workspace
              </span>
            )}
          </>
        )}
      </div>
    </footer>
  );
};

export default Footer;