"use client";

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
} from "@workspace/ui";
import { systemApi } from "@/api/rest-api";
import { queryKeys } from "@/api/query/query-keys";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useTerminalOverviewQuery } from "@/features/system/hooks/use-system-status-queries";

import {
  SystemPtySection,
  OrphanedProcessesSection,
  ShellEnvSection,
  PtyDeviceDetailSection,
  SessionsGroupSection,
  healthColor,
} from "./terminal-sections";

export const TerminalManagerView: React.FC = () => {
  const t = useTranslations("terminal.managerView");
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
      console.error("Failed to cleanup terminals:", err);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleKillServer = async () => {
    try {
      await systemApi.killTmuxServer();
      await invalidateOverview();
    } catch (err) {
      console.error("Failed to kill tmux server:", err);
    }
  };

  const handleKillSession = async (sessionName: string) => {
    try {
      await systemApi.killTmuxSession(sessionName);
      await invalidateOverview();
    } catch (err) {
      console.error("Failed to kill tmux session:", err);
    }
  };

  const handleKillAllOrphaned = async (pids: number[]) => {
    try {
      const result = await systemApi.killOrphanedProcesses(pids);
      console.log(`Killed ${result.killed} out of ${result.total} orphaned processes`);
      if (result.failed_pids.length > 0) {
        console.warn(`Failed to kill PIDs: ${result.failed_pids.join(", ")}`);
      }
      await invalidateOverview();
    } catch (err) {
      console.error("Failed to kill orphaned processes:", err);
    }
  };

  const hasStaleClients = (data?.tmux.stale_client_sessions ?? 0) > 0;
  const hasOrphans = (data?.orphaned_process_count ?? 0) > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="sticky top-0 z-10 bg-background/50 px-8 py-6 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20">
              <SquareTerminal className="size-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-balance text-foreground">
                {t("title")}
              </h2>
              <p className="max-w-sm text-sm text-pretty text-muted-foreground">
                {t("description")}
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
                className="h-10 cursor-pointer rounded-xl border-amber-500/20 bg-amber-500/5 px-4 text-xs font-medium text-amber-600 shadow-sm hover:bg-amber-500/10 dark:text-amber-400"
              >
                <Trash2 className={cn("mr-2 size-3.5", isCleaning && "animate-spin")} />
                {t("cleanUpButton", { count: data?.tmux.stale_client_sessions ?? 0 })}
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isLoading}
              className="h-10 w-10 shrink-0 cursor-pointer rounded-xl border-border/50 bg-muted/20 shadow-sm hover:bg-background"
              title={t("refreshStats")}
            >
              {isLoading ? (
                <LoaderCircle className="animate-spin-reverse size-4" />
              ) : (
                <RotateCcw className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {isLoading && !data ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : error && !data ? (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <AlertTriangle className="mb-4 size-16 text-amber-500 opacity-30" />
            <p className="text-base font-medium">{t("loadErrorTitle")}</p>
            <p className="mt-1 text-sm">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="mt-4 cursor-pointer"
            >
              {t("retry")}
            </Button>
          </div>
        ) : data ? (
          <ScrollArea className="flex-1" scrollFade>
            <div className="mx-auto w-full max-w-5xl space-y-8 p-8 pt-4">
              {/* Health Status Bar */}
              <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-background p-4">
                <div className="flex items-center gap-2">
                  <Activity className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{t("systemHealth")}</span>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-4 text-sm">
                  {/* Tmux Status */}
                  <div className="flex items-center gap-1.5">
                    {data.tmux.installed ? (
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="size-3.5 text-amber-500" />
                    )}
                    <span className="text-muted-foreground">
                      tmux{" "}
                      {data.tmux.installed
                        ? data.tmux.version || t("tmuxInstalledFallback")
                        : t("tmuxNotFound")}
                    </span>
                  </div>

                  {/* PTY Usage */}
                  {data.system_pty.pty_current != null && data.system_pty.pty_max != null && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "flex cursor-help items-center gap-1.5",
                              healthColor[data.system_pty.health],
                            )}
                          >
                            <HardDrive className="size-3.5" />
                            <span>
                              PTY {data.system_pty.pty_current}/{data.system_pty.pty_max}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs">
                          {t("ptyUsageTooltip")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {/* Active Sessions */}
                  <div className="flex items-center gap-1.5">
                    <div className="size-2 rounded-full bg-emerald-500" />
                    <span className="text-muted-foreground">
                      {t("activeSessionsLabel", { count: data.active_session_count })}
                    </span>
                  </div>

                  {/* Stale Warning */}
                  {hasStaleClients && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex cursor-help items-center gap-1.5 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="size-3.5" />
                            <span>
                              {t("staleSessionsLabel", { count: data.tmux.stale_client_sessions })}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs">
                          {t("staleSessionsTooltip", { action: t("cleanUpAction") })}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {/* Orphan Warning */}
                  {hasOrphans && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex cursor-help items-center gap-1.5 text-red-500">
                            <Skull className="size-3.5" />
                            <span>
                              {t("orphanedProcessesLabel", { count: data.orphaned_process_count })}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs">
                          {t("orphanedProcessesTooltip")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>

              {/* Shell Environment */}
              <ShellEnvSection env={data.shell_env} />

              {/* Sessions & Tmux */}
              <SessionsGroupSection
                data={data}
                onKillServer={handleKillServer}
                onKillSession={handleKillSession}
              />

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
