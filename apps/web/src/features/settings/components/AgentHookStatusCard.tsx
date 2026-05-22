'use client';

import React from 'react';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Skeleton,
} from '@workspace/ui';
import {
  ChevronDown,
  CircleCheck,
  CircleMinus,
  CircleX,
  Download,
  LoaderCircle,
  Trash2,
  Webhook,
} from 'lucide-react';

interface AgentHookToolStatus {
  detected: boolean;
  installed: boolean;
  config_path?: string | null;
  error?: string | null;
}

interface AgentHookInstallReport {
  claude_code: AgentHookToolStatus;
  codex: AgentHookToolStatus;
  cursor: AgentHookToolStatus;
  gemini: AgentHookToolStatus;
  factory_droid: AgentHookToolStatus;
  kiro: AgentHookToolStatus;
  opencode: AgentHookToolStatus;
  ampcode: AgentHookToolStatus;
}

const HOOK_TOOL_META: { key: keyof AgentHookInstallReport; label: string }[] = [
  { key: 'claude_code', label: 'Claude Code' },
  { key: 'codex', label: 'Codex CLI' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'gemini', label: 'Gemini CLI' },
  { key: 'factory_droid', label: 'Factory Droid' },
  { key: 'kiro', label: 'Kiro' },
  { key: 'opencode', label: 'OpenCode' },
  { key: 'ampcode', label: 'AMP' },
];

export function AgentHookStatusCard() {
  const [report, setReport] = React.useState<AgentHookInstallReport | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [acting, setActing] = React.useState(false);
  const [actingTool, setActingTool] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(true);

  const getBase = React.useCallback(async () => {
    const config = await import('@/shared/lib/desktop-runtime').then((m) => m.getRuntimeApiConfig());
    return (await import('@/shared/lib/desktop-runtime')).httpBase(config);
  }, []);

  const fetchStatus = React.useCallback(async () => {
    setLoading(true);
    try {
      const base = await getBase();
      const res = await fetch(`${base}/hooks/status`);
      if (res.ok) setReport(await res.json());
    } catch {
      // Best-effort status card: leave the current report unchanged on transient failures.
    } finally {
      setLoading(false);
    }
  }, [getBase]);

  React.useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleInstallAll = React.useCallback(async () => {
    setActing(true);
    try {
      const base = await getBase();
      const res = await fetch(`${base}/hooks/install`, { method: 'POST' });
      if (res.ok) setReport(await res.json());
    } catch {
      // Best-effort action; status can be refreshed by reopening the settings panel.
    } finally {
      setActing(false);
    }
  }, [getBase]);

  const handleUninstallAll = React.useCallback(async () => {
    setActing(true);
    try {
      const base = await getBase();
      const res = await fetch(`${base}/hooks/uninstall`, { method: 'POST' });
      if (res.ok) setReport(await res.json());
    } catch {
      // Best-effort action; status can be refreshed by reopening the settings panel.
    } finally {
      setActing(false);
    }
  }, [getBase]);

  const handleInstallTool = React.useCallback(async (key: string) => {
    setActingTool(key);
    try {
      const base = await getBase();
      const res = await fetch(`${base}/hooks/${key}/install`, { method: 'POST' });
      if (res.ok) {
        const status: AgentHookToolStatus = await res.json();
        setReport((prev) => prev ? { ...prev, [key]: status } : prev);
      }
    } catch {
      // Best-effort action; keep the last known report.
    } finally {
      setActingTool(null);
    }
  }, [getBase]);

  const handleUninstallTool = React.useCallback(async (key: string) => {
    setActingTool(key);
    try {
      const base = await getBase();
      const res = await fetch(`${base}/hooks/${key}/uninstall`, { method: 'POST' });
      if (res.ok) {
        const status: AgentHookToolStatus = await res.json();
        setReport((prev) => prev ? { ...prev, [key]: status } : prev);
      }
    } catch {
      // Best-effort action; keep the last known report.
    } finally {
      setActingTool(null);
    }
  }, [getBase]);

  const anyInstalled = report && HOOK_TOOL_META.some((tool) => report[tool.key].installed);
  const anyDetected = report && HOOK_TOOL_META.some((tool) => report[tool.key].detected);

  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className="overflow-hidden rounded-2xl border border-border"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-8 px-6 py-5">
        <CollapsibleTrigger className="group flex min-w-0 cursor-pointer items-start gap-3 pt-0.5 text-left">
          <span className="relative mt-0.5 size-5 shrink-0">
            <Webhook className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
            <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-medium text-foreground">Agent Hook Status</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Hooks inject into local Agent tool configs so Atmos can track their running state.
            </p>
          </div>
        </CollapsibleTrigger>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleInstallAll} disabled={acting || loading}>
            {acting ? <LoaderCircle className="size-4 animate-spin-reverse" /> : <Download className="size-4" />}
            Install All
          </Button>
          {anyInstalled && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUninstallAll}
              disabled={acting || loading}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
              Uninstall All
            </Button>
          )}
        </div>
      </div>

      <CollapsibleContent>
        <div className="border-t border-border px-4">
          {loading && !report ? (
            <div className="px-2 py-4">
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ) : report ? (
            HOOK_TOOL_META.map(({ key, label }) => {
              const tool = report[key];
              const isBusy = actingTool === key;
              return (
                <div key={key} className="border-b border-border px-2 py-3 last:border-b-0">
                  <div className="flex items-center gap-3">
                    {tool.detected
                      ? tool.installed
                        ? <CircleCheck className="size-3.5 shrink-0 text-emerald-500" />
                        : <CircleX className="size-3.5 shrink-0 text-amber-500" />
                      : <CircleMinus className="size-3.5 shrink-0 text-muted-foreground/50" />
                    }
                    <span className="w-28 shrink-0 text-sm font-medium text-foreground">{label}</span>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {tool.config_path && (
                        <span
                          className="truncate font-mono text-[10px] text-muted-foreground"
                          title={tool.config_path}
                        >
                          {tool.config_path.split(/[\\/]/).slice(-2).join('/')}
                        </span>
                      )}
                      {!tool.detected && (
                        <span className="text-xs text-muted-foreground">Not detected</span>
                      )}
                      {tool.error && (
                        <span className="truncate text-xs text-destructive" title={tool.error}>
                          Error: {tool.error}
                        </span>
                      )}
                    </div>
                    <div className="shrink-0">
                      {tool.detected && !tool.error && (
                        tool.installed ? (
                          <Button
                            variant="secondary"
                            size="icon"
                            className="size-6 text-destructive hover:text-destructive"
                            disabled={isBusy || acting}
                            onClick={() => handleUninstallTool(key)}
                          >
                            {isBusy ? <LoaderCircle className="size-3 animate-spin-reverse" /> : <Trash2 className="size-3" />}
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="icon"
                            className="size-6 text-emerald-500 hover:text-emerald-500"
                            disabled={isBusy || acting}
                            onClick={() => handleInstallTool(key)}
                          >
                            {isBusy ? <LoaderCircle className="size-3 animate-spin-reverse" /> : <Download className="size-3" />}
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-2 py-4 text-sm text-muted-foreground">
              {!anyDetected && 'No supported agent tools detected on this system.'}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
