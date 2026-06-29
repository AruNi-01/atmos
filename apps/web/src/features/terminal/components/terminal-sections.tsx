"use client";

import React, { useState } from 'react';
import { useTranslations } from "next-intl";
import {
  cn,
  Layers,
  Monitor,
  Clock,
  Server,
  FolderOpen,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Cpu,
  HardDrive,
  Globe,
  Skull,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Hash,
  User,
  Terminal,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  ChevronDown,
  Button,
  Trash2,
  Info,
  Power,
  X,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Loader2,
  SquareTerminal,
} from '@workspace/ui';
import type {
  ActiveSessionInfo,
  TmuxSessionDetail,
  SystemPtyInfo,
  PtyHealth,
  TmuxServerInfo,
  ShellEnvInfo,
  OrphanedProcess,
  PtyDeviceDetail,
  TerminalOverviewResponse,
} from '@/api/rest-api';

type TranslationValues = Record<string, string | number>;
type Translator = ReturnType<typeof useTranslations>;

function translateMessage(
  t: Translator,
  key: string,
  values?: TranslationValues,
): string {
  return t(key as never, values as never);
}

function pluralSuffix(count: number): string {
  return count === 1 ? '' : 's';
}

function formatUptime(secs: number, t: Translator): string {
  if (secs < 60) {
    return translateMessage(t, 'uptime.seconds', { seconds: secs });
  }
  if (secs < 3600) {
    return translateMessage(t, 'uptime.minutesSeconds', {
      minutes: Math.floor(secs / 60),
      seconds: secs % 60,
    });
  }
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (hours < 24) {
    return translateMessage(t, 'uptime.hoursMinutes', {
      hours,
      minutes: mins,
    });
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return translateMessage(t, 'uptime.daysHours', {
    days,
    hours: remainingHours,
  });
}

/** Shorten a path by keeping the tail and replacing the head with "..." */
function shortenPath(path: string, maxLen = 40): string {
  if (path.length <= maxLen) return path;
  return '...' + path.slice(-(maxLen - 3));
}

/** Strip internal "atmos_" prefix from tmux session names for display */
function displaySessionName(name: string): string {
  return name.startsWith('atmos_') ? name.slice(6) : name;
}

// --- Sub-components ---

export const SessionCard: React.FC<{ session: ActiveSessionInfo }> = ({ session }) => {
  const t = useTranslations("terminal.sections");
  const isTmux = session.session_type === 'tmux';

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-4 transition-colors hover:bg-muted/30">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            "flex items-center justify-center size-8 rounded-lg shrink-0",
            isTmux ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500"
          )}>
            {isTmux ? <Layers className="size-4" /> : <Monitor className="size-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium whitespace-nowrap">
                {session.terminal_name || session.session_id.split('-').slice(0, 2).join('-')}
              </span>
              <span className={cn(
                "shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                isTmux
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
              )}>
                {isTmux
                  ? translateMessage(t, 'sessionCard.tmuxType')
                  : translateMessage(t, 'sessionCard.simpleType')}
              </span>
            </div>
            {(session.project_name || session.workspace_name) && (
              <p className="text-xs text-muted-foreground truncate">
                {[session.project_name, session.workspace_name].filter(Boolean).join(' / ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground">
          <Clock className="size-3" />
          <span>{formatUptime(session.uptime_secs, t)}</span>
        </div>
      </div>

      {/* Details */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {session.tmux_session && (
          <span className="flex items-center gap-1">
            <Server className="size-3" />
            {displaySessionName(session.tmux_session)}
            {session.tmux_window_index != null && `:${session.tmux_window_index}`}
          </span>
        )}
        {session.cwd && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 max-w-[280px]">
                  <FolderOpen className="size-3 shrink-0" />
                  <span className="truncate direction-rtl text-left">{shortenPath(session.cwd)}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-md break-all text-xs">
                {session.cwd}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
};

export const TmuxSessionCard: React.FC<{ session: TmuxSessionDetail; onKillSession: (name: string) => Promise<void> }> = ({ session, onKillSession }) => {
  const t = useTranslations("terminal.sections");
  const [isKilling, setIsKilling] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const killDescription = t.rich('tmuxSession.killDescription' as never, {
    count: session.windows,
    suffix: pluralSuffix(session.windows),
    name: () => (
      <span className="font-mono font-medium text-foreground">{displaySessionName(session.name)}</span>
    ),
  } as never);

  const handleKill = async () => {
    setIsKilling(true);
    try {
      await onKillSession(session.name);
    } finally {
      setIsKilling(false);
      setPopoverOpen(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex items-center justify-center size-8 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
            <Layers className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {displaySessionName(session.name)}
            </span>
            <p className="truncate text-xs text-muted-foreground">
              {translateMessage(t, 'tmuxSession.windowsLabel', {
                count: session.windows,
                suffix: pluralSuffix(session.windows),
              })}
              {session.attached && (
                <span className="ml-1.5 text-emerald-500">
                  &middot; {translateMessage(t, 'tmuxSession.attached')}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">{session.created}</span>
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
              >
                <X className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-60">
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{translateMessage(t, 'tmuxSession.killTitle')}</p>
                  <p className="text-xs text-muted-foreground">{killDescription}</p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs cursor-pointer"
                    onClick={() => setPopoverOpen(false)}
                  >
                    {translateMessage(t, 'actions.cancel')}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs cursor-pointer"
                    disabled={isKilling}
                    onClick={handleKill}
                  >
                    {isKilling ? <Loader2 className="size-3 animate-spin mr-1" /> : <X className="size-3 mr-1" />}
                    {translateMessage(t, 'actions.kill')}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Window list */}
      {session.window_list.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {session.window_list.map((w) => (
            <span
              key={w.index}
              className={cn(
                "text-[11px] px-2 py-0.5 rounded-md border",
                w.active
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-border bg-muted/50 text-muted-foreground"
              )}
            >
              {w.index}: {w.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// --- PTY Health helpers ---

export const healthColor: Record<PtyHealth, string> = {
  healthy: 'text-emerald-500',
  warning: 'text-amber-500',
  critical: 'text-red-500',
  unknown: 'text-muted-foreground',
};

export const healthBg: Record<PtyHealth, string> = {
  healthy: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  unknown: 'bg-muted-foreground',
};

export function healthLabel(t: Translator, health: PtyHealth): string {
  switch (health) {
    case 'healthy':
      return translateMessage(t, 'health.healthy');
    case 'warning':
      return translateMessage(t, 'health.warning');
    case 'critical':
      return translateMessage(t, 'health.critical');
    default:
      return translateMessage(t, 'health.unknown');
  }
}

export const SystemPtySection: React.FC<{ pty: SystemPtyInfo }> = ({ pty }) => {
  const t = useTranslations("terminal.sections");
  const barPercent = pty.usage_percent != null ? Math.min(pty.usage_percent, 100) : 0;
  const healthText = healthLabel(t, pty.health);

  return (
    <Collapsible className="rounded-lg border border-border bg-background p-5">
      <CollapsibleTrigger className="group w-full text-sm font-semibold text-foreground flex items-center gap-2 cursor-pointer">
        <span className="relative size-4 shrink-0">
          <HardDrive className="absolute inset-0 size-4 transition-opacity duration-150 group-hover:opacity-0" />
          <ChevronDown className="absolute inset-0 size-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
        </span>
        {translateMessage(t, 'systemPty.title')}
        <span className="text-xs font-normal text-muted-foreground">
          ({pty.os})
        </span>
        {pty.pty_current != null && pty.pty_max != null && (
          <span className={cn("ml-auto text-xs font-medium group-data-[state=open]:hidden", healthColor[pty.health])}>
            {pty.pty_current}/{pty.pty_max} &middot; {healthText}
          </span>
        )}
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-4 pt-4">
          {/* Usage Bar */}
          {pty.pty_max != null && pty.pty_current != null ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={cn("font-semibold tabular-nums", healthColor[pty.health])}>
                    {pty.pty_current}
                  </span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-muted-foreground tabular-nums">{pty.pty_max}</span>
                  <span className="text-muted-foreground text-xs">
                    {translateMessage(t, 'systemPty.devicesLabel')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={cn("size-2 rounded-full", healthBg[pty.health])} />
                  <span className={cn("text-xs font-medium", healthColor[pty.health])}>
                    {healthText}
                    {pty.usage_percent != null && ` (${pty.usage_percent}%)`}
                  </span>
                </div>
              </div>

              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    pty.health === 'critical' ? 'bg-red-500' :
                      pty.health === 'warning' ? 'bg-amber-500' :
                        'bg-emerald-500'
                  )}
                  style={{ width: `${barPercent}%` }}
                />
              </div>

              {pty.health === 'critical' && (
                <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 rounded-md px-3 py-2">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>{translateMessage(t, 'systemPty.criticalWarning')}</span>
                </div>
              )}
              {pty.health === 'warning' && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-md px-3 py-2">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>{translateMessage(t, 'systemPty.warningNotice')}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {translateMessage(t, 'systemPty.unavailable')}
            </div>
          )}

          {pty.top_processes.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">
                {translateMessage(t, 'systemPty.topProcessesTitle')}
              </h3>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left font-medium text-muted-foreground px-3 py-1.5">{translateMessage(t, 'systemPty.table.process')}</th>
                      <th className="text-right font-medium text-muted-foreground px-3 py-1.5 w-20">{translateMessage(t, 'systemPty.table.ptys')}</th>
                      {pty.pty_current != null && pty.pty_current > 0 && (
                        <th className="text-right font-medium text-muted-foreground px-3 py-1.5 w-20">{translateMessage(t, 'systemPty.table.share')}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pty.top_processes.map((proc, i) => (
                      <tr key={proc.command} className={cn("border-t border-border", i % 2 === 0 ? "bg-muted/5" : "bg-muted/15")}>
                        <td className="px-3 py-1.5 font-mono flex items-center gap-1.5">
                          <Cpu className="size-3 text-muted-foreground shrink-0" />
                          {proc.command}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">{proc.count}</td>
                        {pty.pty_current != null && pty.pty_current > 0 && (
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                            {((proc.count / pty.pty_current) * 100).toFixed(1)}%
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// --- Orphaned Processes Section ---

export const OrphanedProcessesSection: React.FC<{
  orphans: OrphanedProcess[];
  count: number;
  onKillAll: (pids: number[]) => Promise<void>;
}> = ({ orphans, count, onKillAll }) => {
  const t = useTranslations("terminal.sections");
  const [isKilling, setIsKilling] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const orphanedWarning = t.rich('orphaned.warning' as never, {
    count,
    suffix: count === 1 ? '' : 'es',
    commandText: `kill ${orphans.map(o => o.pid).join(' ')}`,
    command: (chunks: React.ReactNode) => (
      <code className="bg-red-500/20 px-1 rounded text-[11px]">{chunks}</code>
    ),
  } as never);

  const handleKillAll = async () => {
    setIsKilling(true);
    try {
      await onKillAll(orphans.map(o => o.pid));
    } finally {
      setIsKilling(false);
      setPopoverOpen(false);
    }
  };

  if (count === 0) {
    return (
      <div className="rounded-lg border border-border bg-background p-5">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Skull className="size-4" />
          {translateMessage(t, 'orphaned.title')}
          <span className="text-xs font-normal text-emerald-500 flex items-center gap-1">
            <CheckCircle2 className="size-3" />
            {translateMessage(t, 'orphaned.noneDetected')}
          </span>
        </h2>
      </div>
    );
  }

  return (
    <Collapsible className="rounded-lg border border-border bg-background p-5">
      <div className="flex items-center gap-2">
        <CollapsibleTrigger className="group flex-1 text-sm font-semibold text-foreground flex items-center gap-2 cursor-pointer">
          <span className="relative size-4 shrink-0">
            <Skull className="absolute inset-0 size-4 text-red-500 transition-opacity duration-150 group-hover:opacity-0" />
            <ChevronDown className="absolute inset-0 size-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
          </span>
          {translateMessage(t, 'orphaned.title')}
          <span className="text-xs font-medium text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
            {translateMessage(t, 'orphaned.countDetected', { count })}
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs">
                {translateMessage(t, 'orphaned.tooltip')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CollapsibleTrigger>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs cursor-pointer gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-500/10"
            >
              <Power className="size-3.5" />
              {translateMessage(t, 'orphaned.killAll')}
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-64">
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{translateMessage(t, 'orphaned.killAllTitle')}</p>
                <p className="text-xs text-muted-foreground">
                  {translateMessage(t, 'orphaned.killAllDescription', {
                    count,
                    suffix: count === 1 ? '' : 'es',
                  })}
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs cursor-pointer"
                  onClick={() => setPopoverOpen(false)}
                >
                  {translateMessage(t, 'actions.cancel')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs cursor-pointer"
                  disabled={isKilling}
                  onClick={handleKillAll}
                >
                  {isKilling ? <Loader2 className="size-3 animate-spin mr-1" /> : <Power className="size-3 mr-1" />}
                  {translateMessage(t, 'orphaned.confirmKillAll')}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <CollapsibleContent>
        <div className="pt-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 rounded-md px-3 py-2">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>{orphanedWarning}</span>
          </div>

          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left font-medium text-muted-foreground px-3 py-1.5 w-20">{translateMessage(t, 'orphaned.table.pid')}</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-1.5">{translateMessage(t, 'orphaned.table.command')}</th>
                  <th className="text-right font-medium text-muted-foreground px-3 py-1.5 w-28">{translateMessage(t, 'orphaned.table.elapsed')}</th>
                </tr>
              </thead>
              <tbody>
                {orphans.map((proc, i) => (
                  <tr key={proc.pid} className={cn("border-t border-border", i % 2 === 0 ? "bg-muted/5" : "bg-muted/15")}>
                    <td className="px-3 py-1.5 font-mono tabular-nums text-muted-foreground">{proc.pid}</td>
                    <td className="px-3 py-1.5 font-mono">{proc.command}</td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">{proc.elapsed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// --- Tmux Server Info Section ---

export const TmuxServerSection: React.FC<{ server: TmuxServerInfo; onKillServer: () => Promise<void> }> = ({ server, onKillServer }) => {
  const t = useTranslations("terminal.sections");
  const [isKilling, setIsKilling] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleKill = async () => {
    setIsKilling(true);
    try {
      await onKillServer();
    } finally {
      setIsKilling(false);
      setPopoverOpen(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className={cn(
          "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
          server.running
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-muted text-muted-foreground"
        )}>
          {server.running
            ? translateMessage(t, 'tmuxServer.running')
            : translateMessage(t, 'tmuxServer.stopped')}
        </span>
        {server.running && (
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 cursor-pointer gap-1.5"
              >
                <Power className="size-3.5" />
                {translateMessage(t, 'tmuxServer.killServer')}
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-64">
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{translateMessage(t, 'tmuxServer.killTitle')}</p>
                  <p className="text-xs text-muted-foreground">
                    {translateMessage(t, 'tmuxServer.killDescription')}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs cursor-pointer"
                    onClick={() => setPopoverOpen(false)}
                  >
                    {translateMessage(t, 'actions.cancel')}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs cursor-pointer"
                    disabled={isKilling}
                    onClick={handleKill}
                  >
                    {isKilling ? <Loader2 className="size-3 animate-spin mr-1" /> : <Power className="size-3 mr-1" />}
                    {translateMessage(t, 'tmuxServer.confirmKill')}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{translateMessage(t, 'tmuxServer.fields.socket')}</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-xs font-mono truncate cursor-help">{shortenPath(server.socket_path, 30)}</p>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-md break-all text-xs">
                {server.socket_path}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{translateMessage(t, 'tmuxServer.fields.pid')}</span>
          <p className="text-xs font-mono tabular-nums">
            {server.server_pid ?? '—'}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{translateMessage(t, 'tmuxServer.fields.uptime')}</span>
          <p className="text-xs font-mono">
            {server.uptime_secs != null ? formatUptime(server.uptime_secs, t) : '—'}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{translateMessage(t, 'tmuxServer.fields.sessions')}</span>
          <p className="text-sm font-semibold tabular-nums">{server.total_sessions}</p>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{translateMessage(t, 'tmuxServer.fields.windows')}</span>
          <p className="text-sm font-semibold tabular-nums">{server.total_windows}</p>
        </div>
      </div>
    </div>
  );
};


// --- Shell Environment Section ---

export const ShellEnvSection: React.FC<{ env: ShellEnvInfo }> = ({ env }) => {
  const t = useTranslations("terminal.sections");
  const items = [
    { label: translateMessage(t, 'shellEnv.fields.os'), value: env.os_version ? `${env.os} ${env.os_version}` : env.os, icon: Globe },
    { label: translateMessage(t, 'shellEnv.fields.arch'), value: env.arch, icon: Cpu },
    { label: translateMessage(t, 'shellEnv.fields.shell'), value: env.shell, icon: Terminal },
    { label: translateMessage(t, 'shellEnv.fields.term'), value: env.term, icon: Monitor },
    { label: translateMessage(t, 'shellEnv.fields.user'), value: env.user, icon: User },
    { label: translateMessage(t, 'shellEnv.fields.hostname'), value: env.hostname || '—', icon: Server },
    { label: translateMessage(t, 'shellEnv.fields.home'), value: env.home, icon: FolderOpen },
  ];

  return (
    <div className="rounded-lg border border-border bg-background p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <Globe className="size-4" />
        {translateMessage(t, 'shellEnv.title')}
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map(({ label, value, icon: Icon }) => (
          <div key={label} className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Icon className="size-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
            </div>
            <p className="text-xs font-mono truncate pl-[18px]">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- PTY Device Detail Section ---

export const PtyDeviceDetailSection: React.FC<{ devices: PtyDeviceDetail[] }> = ({ devices }) => {
  const t = useTranslations("terminal.sections");

  if (devices.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background p-5">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Hash className="size-4" />
          {translateMessage(t, 'ptyDeviceDetails.title')}
          <span className="text-xs font-normal text-muted-foreground">
            {translateMessage(t, 'ptyDeviceDetails.noData')}
          </span>
        </h2>
      </div>
    );
  }

  return (
    <Collapsible className="rounded-lg border border-border bg-background p-5">
      <CollapsibleTrigger className="group w-full text-sm font-semibold text-foreground flex items-center gap-2 cursor-pointer">
        <span className="relative size-4 shrink-0">
          <Hash className="absolute inset-0 size-4 transition-opacity duration-150 group-hover:opacity-0" />
          <ChevronDown className="absolute inset-0 size-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
        </span>
        {translateMessage(t, 'ptyDeviceDetails.title')}
        <span className="text-xs font-normal text-muted-foreground">
          {translateMessage(t, 'ptyDeviceDetails.summary', {
            count: devices.length,
            suffix: pluralSuffix(devices.length),
          })}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="pt-4">
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left font-medium text-muted-foreground px-3 py-1.5">{translateMessage(t, 'ptyDeviceDetails.table.device')}</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-1.5">{translateMessage(t, 'ptyDeviceDetails.table.pid')}</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-1.5">{translateMessage(t, 'ptyDeviceDetails.table.user')}</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-1.5">{translateMessage(t, 'ptyDeviceDetails.table.command')}</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-1.5 w-16">{translateMessage(t, 'ptyDeviceDetails.table.fd')}</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((dev) =>
                  dev.processes.map((proc, pi) => (
                    <tr
                      key={`${dev.device}-${proc.pid}-${pi}`}
                      className={cn("border-t border-border", pi % 2 === 0 ? "bg-muted/5" : "bg-muted/15")}
                    >
                      {pi === 0 ? (
                        <td className="px-3 py-1.5 font-mono text-muted-foreground align-top" rowSpan={dev.processes.length}>
                          {dev.device.split('/').pop()}
                        </td>
                      ) : null}
                      <td className="px-3 py-1.5 font-mono tabular-nums">{proc.pid}</td>
                      <td className="px-3 py-1.5">{proc.user}</td>
                      <td className="px-3 py-1.5 font-mono">{proc.command}</td>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{proc.fd}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// --- Sessions Group (Active Sessions + Tmux Server + Tmux Sessions) ---

export const SessionsGroupSection: React.FC<{
  data: TerminalOverviewResponse;
  onKillServer: () => Promise<void>;
  onKillSession: (name: string) => Promise<void>;
}> = ({ data, onKillServer, onKillSession }) => {
  const t = useTranslations("terminal.sections");
  const totalCount = data.active_session_count + data.tmux.session_count;
  const tmuxPart = data.tmux.installed ? `, ${data.tmux.session_count} tmux` : '';

  return (
    <Collapsible className="rounded-lg border border-border bg-background p-5">
      <CollapsibleTrigger className="group w-full text-sm font-semibold text-foreground flex items-center gap-2 cursor-pointer">
        <span className="relative size-4 shrink-0">
          <SquareTerminal className="absolute inset-0 size-4 transition-opacity duration-150 group-hover:opacity-0" />
          <ChevronDown className="absolute inset-0 size-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
        </span>
        {translateMessage(t, 'sessions.title')}
        <span className="text-xs font-normal text-muted-foreground">
          {translateMessage(t, 'sessions.summary', {
            active: data.active_session_count,
            tmuxPart,
          })}
        </span>
        <span className="ml-auto text-xs font-normal text-muted-foreground group-data-[state=open]:hidden">
          {translateMessage(t, 'sessions.totalSummary', { count: totalCount })}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="pt-4 space-y-5">
          {/* Active Sessions */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Monitor className="size-3.5" />
              {translateMessage(t, 'sessions.activeTitle', {
                count: data.active_sessions.length,
              })}
            </h3>
            {data.active_sessions.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
                {translateMessage(t, 'sessions.noActive')}
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
                {data.active_sessions.map((session) => (
                  <SessionCard key={session.session_id} session={session} />
                ))}
              </div>
            )}
          </div>

          {/* Tmux Server Info */}
          {data.tmux.installed && data.tmux_server && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Server className="size-3.5" />
                {translateMessage(t, 'sessions.tmuxServerTitle')}
              </h3>
              <TmuxServerSection server={data.tmux_server} onKillServer={onKillServer} />
            </div>
          )}

          {/* Tmux Sessions */}
          {data.tmux.installed && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Layers className="size-3.5" />
                {translateMessage(t, 'sessions.tmuxTitle', {
                  count: data.tmux.sessions.length,
                })}
              </h3>
              {data.tmux.sessions.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
                  {translateMessage(t, 'sessions.noTmux')}
                </div>
              ) : (
                <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
                  {data.tmux.sessions.map((session) => (
                    <TmuxSessionCard key={session.name} session={session} onKillSession={onKillSession} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// --- Main Component ---
