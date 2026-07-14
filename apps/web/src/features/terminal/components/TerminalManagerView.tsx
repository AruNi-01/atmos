"use client";

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  ScrollArea,
  Loader2,
  LoaderCircle,
  RotateCcw,
  Button,
  cn,
  SquareTerminal,
  Trash2,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  HardDrive,
  Skull,
} from '@workspace/ui';
import { systemApi } from '@/api/rest-api';
import { queryKeys } from '@/api/query/query-keys';
import { useComputerQueryScope } from '@/api/query/query-scope';
import { useTerminalOverviewQuery } from '@/features/system/hooks/use-system-status-queries';

import {
  SystemPtySection,
  OrphanedProcessesSection,
  ShellEnvSection,
  PtyDeviceDetailSection,
  SessionsGroupSection,
  healthColor,
} from './terminal-sections';

export const TerminalManagerView: React.FC = () => {
  const t = useTranslations('terminal.managerView');
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();
  const overviewQuery = useTerminalOverviewQuery();
  const data = overviewQuery.data ?? null;
  const isLoading = overviewQuery.isLoading || overviewQuery.isFetching;
  const error =
    overviewQuery.error instanceof Error
      ? overviewQuery.error.message
      : overviewQuery.error
        ? String(overviewQuery.error)
        : null;
  const [isCleaning, setIsCleaning] = useState(false);

  const invalidateOverview = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.computer.terminalOverview(scope),
    });
  };

  const handleRefresh = () => {
    void overviewQuery.refetch();
  };

  const handleCleanup = async () => {
    setIsCleaning(true);
    try {
      const result = await systemApi.cleanupTerminals();
      await invalidateOverview();
      if (result.cleaned_client_sessions > 0) {
        console.log(`Cleaned ${result.cleaned_client_sessions} stale sessions`);
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
      await invalidateOverview();
    } catch (err) {
      console.error('Failed to kill tmux server:', err);
    }
  };

  const handleKillSession = async (sessionName: string) => {
    try {
      await systemApi.killTmuxSession(sessionName);
      await invalidateOverview();
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
      await invalidateOverview();
    } catch (err) {
      console.error('Failed to kill orphaned processes:', err);
    }
  };

  const hasStaleClients = (data?.tmux.stale_client_sessions ?? 0) > 0;
  const hasOrphans = (data?.orphaned_process_count ?? 0) > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <div className="border-b border-border bg-background/50 px-8 py-6 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between gap-6 max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20">
              <SquareTerminal className="size-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground text-balance">{t('title')}</h2>
              <p className="text-sm text-muted-foreground text-pretty max-w-sm">
                {t('description')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {hasStaleClients && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCleanup}
                disabled={isCleaning}
                className="h-10 px-4 rounded-xl bg-amber-500/5 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/10 transition-all cursor-pointer font-medium text-xs shadow-sm"
              >
                <Trash2 className={cn("mr-2 size-3.5", isCleaning && "animate-spin")} />
                {t('cleanUpButton', { count: data?.tmux.stale_client_sessions ?? 0 })}
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isLoading}
              className="h-10 w-10 shrink-0 rounded-xl bg-muted/20 border-border/50 hover:bg-background transition-all shadow-sm cursor-pointer"
              title={t('refreshStats')}
            >
              {isLoading ? <LoaderCircle className="size-4 animate-spin-reverse" /> : <RotateCcw className="size-4" />}
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
        ) : error && !data ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            <AlertTriangle className="size-16 mb-4 opacity-30 text-amber-500" />
            <p className="text-base font-medium">{t('loadErrorTitle')}</p>
            <p className="text-sm mt-1">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-4 cursor-pointer">
              {t('retry')}
            </Button>
          </div>
        ) : data ? (
          <ScrollArea className="flex-1 scrollbar-on-hover">
            <div className="p-8 pt-4 space-y-8 max-w-5xl mx-auto w-full">
              {/* Health Status Bar */}
              <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-background flex-wrap">
                <div className="flex items-center gap-2">
                  <Activity className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{t('systemHealth')}</span>
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
                      tmux {data.tmux.installed ? (data.tmux.version || t('tmuxInstalledFallback')) : t('tmuxNotFound')}
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
                          {t('ptyUsageTooltip')}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {/* Active Sessions */}
                  <div className="flex items-center gap-1.5">
                    <div className="size-2 rounded-full bg-emerald-500" />
                    <span className="text-muted-foreground">
                      {t('activeSessionsLabel', { count: data.active_session_count })}
                    </span>
                  </div>

                  {/* Stale Warning */}
                  {hasStaleClients && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 cursor-help">
                            <AlertTriangle className="size-3.5" />
                            <span>{t('staleSessionsLabel', { count: data.tmux.stale_client_sessions })}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs">
                          {t('staleSessionsTooltip', { action: t('cleanUpAction') })}
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
                            <span>{t('orphanedProcessesLabel', { count: data.orphaned_process_count })}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs">
                          {t('orphanedProcessesTooltip')}
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
              <SystemPtySection pty={data.system_pty} />

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
