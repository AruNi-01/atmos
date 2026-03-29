"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollArea,
  Loader2,
  RefreshCw,
  Button,
  cn,
  SquareTerminal,
  Trash2,
  Activity,
  Clock,
  FolderOpen,
  Monitor,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Server,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Cpu,
  HardDrive,
  Globe,
  Skull,
  Info,
  ChevronDown,
  Hash,
  User,
  Terminal,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Power,
  X,
} from '@workspace/ui';
import {
  systemApi,
  type TerminalOverviewResponse,
  type ActiveSessionInfo,
  type TmuxSessionDetail,
  type SystemPtyInfo,
  type PtyHealth,
  type TmuxServerInfo,
  type ShellEnvInfo,
  type OrphanedProcess,
  type PtyDeviceDetail,
} from '@/api/rest-api';

import {
  SessionCard,
  TmuxSessionCard,
  SystemPtySection,
  OrphanedProcessesSection,
  TmuxServerSection,
  ShellEnvSection,
  PtyDeviceDetailSection,
  SessionsGroupSection,
  healthColor,
} from './terminal-sections';

export const TerminalManagerView: React.FC = () => {
  const [data, setData] = useState<TerminalOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await systemApi.getTerminalOverview();
      setData(result);
    } catch (err) {
      console.error('Failed to load terminal overview:', err);
      setError(err instanceof Error ? err.message : 'Failed to load terminal data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCleanup = async () => {
    setIsCleaning(true);
    try {
      const result = await systemApi.cleanupTerminals();
      await loadData();
      const parts: string[] = [];
      if (result.cleaned_client_sessions > 0)
        parts.push(`${result.cleaned_client_sessions} stale sessions`);
      if (result.killed_windows && result.killed_windows > 0)
        parts.push(`${result.killed_windows} unused tmux windows`);
      if (result.killed_orphans && result.killed_orphans > 0)
        parts.push(`${result.killed_orphans} orphaned processes`);
      if (parts.length > 0) {
        console.log(`Cleaned up: ${parts.join(', ')}`);
      }
    } catch (err) {
      console.error('Failed to cleanup terminals:', err);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleKillServer = async () => {
    try {
      await systemApi.killTmuxServer();
      await loadData();
    } catch (err) {
      console.error('Failed to kill tmux server:', err);
    }
  };

  const handleKillSession = async (sessionName: string) => {
    try {
      await systemApi.killTmuxSession(sessionName);
      await loadData();
    } catch (err) {
      console.error('Failed to kill tmux session:', err);
    }
  };

  const handleKillAllOrphaned = async (pids: number[]) => {
    try {
      const result = await systemApi.killOrphanedProcesses(pids);
      console.log(`Killed ${result.killed} out of ${result.total} orphaned processes`);
      if (result.failed_pids.length > 0) {
        console.warn(`Failed to kill PIDs: ${result.failed_pids.join(', ')}`);
      }
      await loadData();
    } catch (err) {
      console.error('Failed to kill orphaned processes:', err);
    }
  };

  const hasStaleClients = (data?.tmux.stale_client_sessions ?? 0) > 0;
  const hasOrphans = (data?.orphaned_process_count ?? 0) > 0;
  const ptyHealthBad = data?.system_pty.health === 'warning' || data?.system_pty.health === 'critical';
  const showCleanupButton = hasStaleClients || ptyHealthBad;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <div className="border-b border-border bg-background/50 px-8 py-6 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between gap-6 max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20">
              <SquareTerminal className="size-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground text-balance">Terminal Manager</h2>
              <p className="text-sm text-muted-foreground text-pretty max-w-sm">
                Monitor and manage active terminal sessions and system health.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {showCleanupButton && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCleanup}
                disabled={isCleaning}
                className={cn(
                  "h-10 px-4 rounded-xl transition-all cursor-pointer font-medium text-xs shadow-sm",
                  data?.system_pty.health === 'critical'
                    ? "bg-red-500/5 text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/10"
                    : "bg-amber-500/5 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/10"
                )}
              >
                <Trash2 className="mr-2 size-3.5" />
                {hasStaleClients
                  ? `Clean Up (${data?.tmux.stale_client_sessions})`
                  : 'Clean Up PTYs'}
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={loadData}
              disabled={isLoading || isCleaning}
              className="h-10 w-10 shrink-0 rounded-xl bg-muted/20 border-border/50 hover:bg-background transition-all shadow-sm cursor-pointer"
              title="Refresh Stats"
            >
              <RefreshCw className={cn("size-4", (isLoading || isCleaning) && "animate-spin")} />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {isLoading && !data ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            <AlertTriangle className="size-16 mb-4 opacity-30 text-amber-500" />
            <p className="text-base font-medium">Failed to load terminal data</p>
            <p className="text-sm mt-1">{error}</p>
            <Button variant="outline" size="sm" onClick={loadData} className="mt-4 cursor-pointer">
              Retry
            </Button>
          </div>
        ) : data ? (
          <ScrollArea className="flex-1 scrollbar-on-hover">
            <div className="p-8 pt-4 space-y-8 max-w-5xl mx-auto w-full">
              {/* Health Status Bar */}
              <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-background flex-wrap">
                <div className="flex items-center gap-2">
                  <Activity className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">System Health</span>
                </div>
                <div className="flex items-center gap-4 ml-auto text-sm flex-wrap">
                  {/* Tmux Status */}
                  <div className="flex items-center gap-1.5">
                    {data.tmux.installed ? (
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="size-3.5 text-amber-500" />
                    )}
                    <span className="text-muted-foreground">
                      tmux {data.tmux.installed ? (data.tmux.version || 'installed') : 'not found'}
                    </span>
                  </div>

                  {/* PTY Usage */}
                  {data.system_pty.pty_current != null && data.system_pty.pty_max != null && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={cn("flex items-center gap-1.5 cursor-help", healthColor[data.system_pty.health])}>
                            <HardDrive className="size-3.5" />
                            <span>PTY {data.system_pty.pty_current}/{data.system_pty.pty_max}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs">
                          System PTY device usage. Each terminal session uses one PTY device. If this reaches the limit, no new terminals can be opened system-wide.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {/* Active Sessions */}
                  <div className="flex items-center gap-1.5">
                    <div className="size-2 rounded-full bg-emerald-500" />
                    <span className="text-muted-foreground">
                      {data.active_session_count} active
                    </span>
                  </div>

                  {/* Stale Warning */}
                  {hasStaleClients && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 cursor-help">
                            <AlertTriangle className="size-3.5" />
                            <span>{data.tmux.stale_client_sessions} stale</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs">
                          Stale sessions are orphaned tmux client connections left behind by previous crashes or hot-reloads. Each one holds a PTY device. Click &quot;Clean Up&quot; to release them.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {/* Orphan Warning */}
                  {hasOrphans && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 text-red-500 cursor-help">
                            <Skull className="size-3.5" />
                            <span>{data.orphaned_process_count} orphan{data.orphaned_process_count > 1 ? 's' : ''}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs">
                          Orphaned shell processes (PPID=1) that may be holding PTY devices. See the Orphaned Processes section below for details.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>

              {/* Shell Environment */}
              <ShellEnvSection env={data.shell_env} />

              {/* Sessions & Tmux */}
              <SessionsGroupSection data={data} onKillServer={handleKillServer} onKillSession={handleKillSession} />

              {/* System PTY Usage */}
              <SystemPtySection pty={data.system_pty} onCleanup={handleCleanup} isCleaning={isCleaning} />

              {/* PTY Device Details */}
              <PtyDeviceDetailSection devices={data.pty_devices} />

              {/* Orphaned Processes */}
              <OrphanedProcessesSection
                orphans={data.orphaned_processes}
                count={data.orphaned_process_count}
                onKillAll={handleKillAllOrphaned}
              />
            </div>
          </ScrollArea>
        ) : null}
      </div>
    </div>
  );
};
