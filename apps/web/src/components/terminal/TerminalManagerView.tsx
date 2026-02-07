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

function formatUptime(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
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

const SessionCard: React.FC<{ session: ActiveSessionInfo }> = ({ session }) => {
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
                {isTmux ? 'tmux' : 'simple'}
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
          <span>{formatUptime(session.uptime_secs)}</span>
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

const TmuxSessionCard: React.FC<{ session: TmuxSessionDetail; onKillSession: (name: string) => Promise<void> }> = ({ session, onKillSession }) => {
  const [isKilling, setIsKilling] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

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
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center size-8 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
            <Layers className="size-4" />
          </div>
          <div>
            <span className="text-sm font-medium">{displaySessionName(session.name)}</span>
            <p className="text-xs text-muted-foreground">
              {session.windows} window{session.windows !== 1 ? 's' : ''}
              {session.attached && (
                <span className="ml-1.5 text-emerald-500">&middot; attached</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
                  <p className="text-sm font-medium">Kill Session?</p>
                  <p className="text-xs text-muted-foreground">
                    Kill <span className="font-mono font-medium text-foreground">{displaySessionName(session.name)}</span> and all its {session.windows} window{session.windows !== 1 ? 's' : ''}?
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs cursor-pointer"
                    onClick={() => setPopoverOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs cursor-pointer"
                    disabled={isKilling}
                    onClick={handleKill}
                  >
                    {isKilling ? <Loader2 className="size-3 animate-spin mr-1" /> : <X className="size-3 mr-1" />}
                    Kill
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

const healthColor: Record<PtyHealth, string> = {
  healthy: 'text-emerald-500',
  warning: 'text-amber-500',
  critical: 'text-red-500',
  unknown: 'text-muted-foreground',
};

const healthBg: Record<PtyHealth, string> = {
  healthy: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  unknown: 'bg-muted-foreground',
};

const healthLabel: Record<PtyHealth, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  unknown: 'Unknown',
};

const SystemPtySection: React.FC<{ pty: SystemPtyInfo }> = ({ pty }) => {
  const barPercent = pty.usage_percent != null ? Math.min(pty.usage_percent, 100) : 0;

  return (
    <Collapsible className="rounded-lg border border-border bg-background p-5">
      <CollapsibleTrigger className="group w-full text-sm font-semibold text-foreground flex items-center gap-2 cursor-pointer">
        <span className="relative size-4 shrink-0">
          <HardDrive className="absolute inset-0 size-4 transition-opacity duration-150 group-hover:opacity-0" />
          <ChevronDown className="absolute inset-0 size-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
        </span>
        System PTY Usage
        <span className="text-xs font-normal text-muted-foreground">
          ({pty.os})
        </span>
        {pty.pty_current != null && pty.pty_max != null && (
          <span className={cn("ml-auto text-xs font-medium group-data-[state=open]:hidden", healthColor[pty.health])}>
            {pty.pty_current}/{pty.pty_max} &middot; {healthLabel[pty.health]}
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
                  <span className="text-muted-foreground text-xs">PTY devices</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={cn("size-2 rounded-full", healthBg[pty.health])} />
                  <span className={cn("text-xs font-medium", healthColor[pty.health])}>
                    {healthLabel[pty.health]}
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
                  <span>PTY usage is critically high. New terminals may fail to open. Clean up stale sessions or close unused terminals.</span>
                </div>
              )}
              {pty.health === 'warning' && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-md px-3 py-2">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>PTY usage is elevated. Consider cleaning up unused terminal sessions.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Unable to determine PTY usage on this system.
            </div>
          )}

          {pty.top_processes.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">Top Processes Holding PTY Devices</h3>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left font-medium text-muted-foreground px-3 py-1.5">Process</th>
                      <th className="text-right font-medium text-muted-foreground px-3 py-1.5 w-20">PTYs</th>
                      {pty.pty_current != null && pty.pty_current > 0 && (
                        <th className="text-right font-medium text-muted-foreground px-3 py-1.5 w-20">Share</th>
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

const OrphanedProcessesSection: React.FC<{ 
  orphans: OrphanedProcess[]; 
  count: number;
  onKillAll: (pids: number[]) => Promise<void>;
}> = ({ orphans, count, onKillAll }) => {
  const [isKilling, setIsKilling] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

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
          Orphaned Processes
          <span className="text-xs font-normal text-emerald-500 flex items-center gap-1">
            <CheckCircle2 className="size-3" />
            None detected
          </span>
        </h2>
      </div>
    );
  }

  return (
    <Collapsible className="rounded-lg border border-border bg-background p-5">
      <CollapsibleTrigger className="group w-full text-sm font-semibold text-foreground flex items-center gap-2 cursor-pointer">
        <span className="relative size-4 shrink-0">
          <Skull className="absolute inset-0 size-4 text-red-500 transition-opacity duration-150 group-hover:opacity-0" />
          <ChevronDown className="absolute inset-0 size-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
        </span>
        Orphaned Processes
        <span className="text-xs font-medium text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
          {count} detected
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs text-xs">
              Orphaned processes are shell processes whose parent has died (PPID=1). They often hold PTY file descriptors and can lead to PTY exhaustion. Usually caused by crashes or ungraceful shutdowns.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild onClick={(e) => { e.stopPropagation(); }}>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-3 text-xs cursor-pointer gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-500/10"
            >
              <Power className="size-3.5" />
              Kill All
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-64">
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Kill All Orphaned Processes?</p>
                <p className="text-xs text-muted-foreground">
                  This will terminate all {count} orphaned shell process{count > 1 ? 'es' : ''} (PPID=1). This action cannot be undone.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs cursor-pointer"
                  onClick={() => setPopoverOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs cursor-pointer"
                  disabled={isKilling}
                  onClick={handleKillAll}
                >
                  {isKilling ? <Loader2 className="size-3 animate-spin mr-1" /> : <Power className="size-3 mr-1" />}
                  Confirm Kill All
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="pt-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 rounded-md px-3 py-2">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>
              {count} orphaned shell process{count > 1 ? 'es' : ''} detected. These may be consuming PTY devices.
              Run <code className="bg-red-500/20 px-1 rounded text-[11px]">kill {orphans.map(o => o.pid).join(' ')}</code> in your terminal to clean them up.
            </span>
          </div>

          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left font-medium text-muted-foreground px-3 py-1.5 w-20">PID</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-1.5">Command</th>
                  <th className="text-right font-medium text-muted-foreground px-3 py-1.5 w-28">Elapsed</th>
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

const TmuxServerSection: React.FC<{ server: TmuxServerInfo; onKillServer: () => Promise<void> }> = ({ server, onKillServer }) => {
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
          {server.running ? 'running' : 'stopped'}
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
                Kill Server
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-64">
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Kill Tmux Server?</p>
                  <p className="text-xs text-muted-foreground">
                    This will terminate all tmux sessions and their processes. Active terminal connections will be lost.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs cursor-pointer"
                    onClick={() => setPopoverOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs cursor-pointer"
                    disabled={isKilling}
                    onClick={handleKill}
                  >
                    {isKilling ? <Loader2 className="size-3 animate-spin mr-1" /> : <Power className="size-3 mr-1" />}
                    Confirm Kill
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Socket</span>
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
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">PID</span>
          <p className="text-xs font-mono tabular-nums">
            {server.server_pid ?? '—'}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Uptime</span>
          <p className="text-xs font-mono">
            {server.uptime_secs != null ? formatUptime(server.uptime_secs) : '—'}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Sessions</span>
          <p className="text-sm font-semibold tabular-nums">{server.total_sessions}</p>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Windows</span>
          <p className="text-sm font-semibold tabular-nums">{server.total_windows}</p>
        </div>
      </div>
    </div>
  );
};


// --- Shell Environment Section ---

const ShellEnvSection: React.FC<{ env: ShellEnvInfo }> = ({ env }) => {
  const items = [
    { label: 'OS', value: env.os_version ? `${env.os} ${env.os_version}` : env.os, icon: Globe },
    { label: 'Arch', value: env.arch, icon: Cpu },
    { label: 'Shell', value: env.shell, icon: Terminal },
    { label: 'TERM', value: env.term, icon: Monitor },
    { label: 'User', value: env.user, icon: User },
    { label: 'Hostname', value: env.hostname || '—', icon: Server },
    { label: 'Home', value: env.home, icon: FolderOpen },
  ];

  return (
    <div className="rounded-lg border border-border bg-background p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <Globe className="size-4" />
        Shell Environment
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

const PtyDeviceDetailSection: React.FC<{ devices: PtyDeviceDetail[] }> = ({ devices }) => {
  if (devices.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background p-5">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Hash className="size-4" />
          PTY Device Details
          <span className="text-xs font-normal text-muted-foreground">
            No device data available
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
        PTY Device Details
        <span className="text-xs font-normal text-muted-foreground">
          ({devices.length} device{devices.length !== 1 ? 's' : ''})
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="pt-4">
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left font-medium text-muted-foreground px-3 py-1.5">Device</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-1.5">PID</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-1.5">User</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-1.5">Command</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-1.5 w-16">FD</th>
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

const SessionsGroupSection: React.FC<{
  data: TerminalOverviewResponse;
  onKillServer: () => Promise<void>;
  onKillSession: (name: string) => Promise<void>;
}> = ({ data, onKillServer, onKillSession }) => {
  const totalCount = data.active_session_count + data.tmux.session_count;

  return (
    <Collapsible className="rounded-lg border border-border bg-background p-5">
      <CollapsibleTrigger className="group w-full text-sm font-semibold text-foreground flex items-center gap-2 cursor-pointer">
        <span className="relative size-4 shrink-0">
          <SquareTerminal className="absolute inset-0 size-4 transition-opacity duration-150 group-hover:opacity-0" />
          <ChevronDown className="absolute inset-0 size-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
        </span>
        Sessions
        <span className="text-xs font-normal text-muted-foreground">
          ({data.active_session_count} active{data.tmux.installed ? `, ${data.tmux.session_count} tmux` : ''})
        </span>
        <span className="ml-auto text-xs font-normal text-muted-foreground group-data-[state=open]:hidden">
          {totalCount} total
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="pt-4 space-y-5">
          {/* Active Sessions */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Monitor className="size-3.5" />
              Active Sessions ({data.active_sessions.length})
            </h3>
            {data.active_sessions.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
                No active terminal sessions
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
                Tmux Server
              </h3>
              <TmuxServerSection server={data.tmux_server} onKillServer={onKillServer} />
            </div>
          )}

          {/* Tmux Sessions */}
          {data.tmux.installed && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Layers className="size-3.5" />
                Tmux Sessions ({data.tmux.sessions.length})
              </h3>
              {data.tmux.sessions.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
                  No tmux sessions running
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
      // Refresh data after cleanup
      await loadData();
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

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="px-6 py-4 shrink-0 border-b border-border bg-background/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl bg-primary/10 text-primary">
              <SquareTerminal className="size-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Terminal Manager</h1>
              <p className="text-sm text-muted-foreground">
                Monitor and manage terminal sessions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {hasStaleClients && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCleanup}
                disabled={isCleaning}
                className="gap-2 cursor-pointer text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
              >
                <Trash2 className={cn("size-4", isCleaning && "animate-spin")} />
                Clean Up ({data?.tmux.stale_client_sessions})
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={loadData}
              disabled={isLoading}
              className="gap-2 cursor-pointer"
            >
              <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
              Refresh
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
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
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
