'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
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
  LoaderCircle,
  PlugZap,
  Trash2,
  Webhook,
} from 'lucide-react';
import {
  agentHooksApi,
  type AgentHookInstallReport,
  type AgentHookToolStatus,
} from '@/api/rest-api';
import { useComputerQueryScope } from '@/api/query/query-scope';
import { isComputerQueryScopeCurrent } from '@/api/ws/request';

const HOOK_TOOL_META: { key: keyof AgentHookInstallReport; label: string }[] = [
  { key: 'claude_code', label: 'Claude Code' },
  { key: 'codex', label: 'Codex CLI' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'gemini', label: 'Gemini CLI' },
  { key: 'antigravity', label: 'Antigravity' },
  { key: 'factory_droid', label: 'Factory Droid' },
  { key: 'kiro', label: 'Kiro' },
  { key: 'opencode', label: 'OpenCode' },
  { key: 'ampcode', label: 'AMP' },
  { key: 'pi', label: 'Pi' },
  { key: 'hermes', label: 'Hermes Agent' },
  { key: 'grok_build', label: 'Grok Build' },
];

export function AgentHookStatusCard() {
  const t = useTranslations('settings.agentHookStatusCard');
  const {
    activeInstanceId,
    connectionEpoch,
    relaySessionRevision,
  } = useComputerQueryScope();
  const queryScope = React.useMemo(
    () => ({ activeInstanceId, connectionEpoch, relaySessionRevision }),
    [activeInstanceId, connectionEpoch, relaySessionRevision]
  );
  const hookTargetIdentity = [
    queryScope.activeInstanceId,
    queryScope.connectionEpoch,
    queryScope.relaySessionRevision,
  ].join(':');
  const requestGenerationRef = React.useRef(0);
  const [reportState, setReportState] = React.useState<{
    target: string;
    report: AgentHookInstallReport;
  } | null>(null);
  const [completedTarget, setCompletedTarget] = React.useState<string | null>(null);
  const [actingTarget, setActingTarget] = React.useState<string | null>(null);
  const [actingToolState, setActingToolState] = React.useState<{
    target: string;
    key: string;
  } | null>(null);
  const [expanded, setExpanded] = React.useState(true);
  const report =
    reportState?.target === hookTargetIdentity ? reportState.report : null;
  const loading = completedTarget !== hookTargetIdentity;
  const acting = actingTarget === hookTargetIdentity;
  const actingTool =
    actingToolState?.target === hookTargetIdentity ? actingToolState.key : null;

  React.useEffect(() => {
    let cancelled = false;
    const target = hookTargetIdentity;
    const scope = queryScope;
    const generation = ++requestGenerationRef.current;
    void agentHooksApi
      .getStatus()
      .then((status) => {
        if (
          !cancelled &&
          requestGenerationRef.current === generation &&
          isComputerQueryScopeCurrent(scope)
        ) {
          setReportState({ target, report: status });
        }
      })
      .catch(() => {
        // Best-effort status card: leave the current report unchanged on transient failures.
      })
      .finally(() => {
        if (
          !cancelled &&
          requestGenerationRef.current === generation &&
          isComputerQueryScopeCurrent(scope)
        ) {
          setCompletedTarget(target);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hookTargetIdentity, queryScope]);

  const handleInstallAll = React.useCallback(async () => {
    const target = hookTargetIdentity;
    const scope = queryScope;
    const generation = ++requestGenerationRef.current;
    setActingTarget(target);
    try {
      const nextReport = await agentHooksApi.installAll();
      if (
        requestGenerationRef.current === generation &&
        isComputerQueryScopeCurrent(scope)
      ) {
        setReportState({ target, report: nextReport });
      }
    } catch {
      // Best-effort action; status can be refreshed by reopening the settings panel.
    } finally {
      if (requestGenerationRef.current === generation) {
        setActingTarget((current) => current === target ? null : current);
      }
    }
  }, [hookTargetIdentity, queryScope]);

  const handleUninstallAll = React.useCallback(async () => {
    const target = hookTargetIdentity;
    const scope = queryScope;
    const generation = ++requestGenerationRef.current;
    setActingTarget(target);
    try {
      const nextReport = await agentHooksApi.uninstallAll();
      if (
        requestGenerationRef.current === generation &&
        isComputerQueryScopeCurrent(scope)
      ) {
        setReportState({ target, report: nextReport });
      }
    } catch {
      // Best-effort action; status can be refreshed by reopening the settings panel.
    } finally {
      if (requestGenerationRef.current === generation) {
        setActingTarget((current) => current === target ? null : current);
      }
    }
  }, [hookTargetIdentity, queryScope]);

  const handleInstallTool = React.useCallback(async (key: keyof AgentHookInstallReport) => {
    const target = hookTargetIdentity;
    const scope = queryScope;
    const generation = ++requestGenerationRef.current;
    setActingToolState({ target, key });
    try {
      const status: AgentHookToolStatus = await agentHooksApi.installTool(key);
      if (
        requestGenerationRef.current === generation &&
        isComputerQueryScopeCurrent(scope)
      ) {
        setReportState((previous) =>
          previous?.target === target
            ? { target, report: { ...previous.report, [key]: status } }
            : previous
        );
      }
    } catch {
      // Best-effort action; keep the last known report.
    } finally {
      if (requestGenerationRef.current === generation) {
        setActingToolState((current) =>
          current?.target === target && current.key === key ? null : current
        );
      }
    }
  }, [hookTargetIdentity, queryScope]);

  const handleUninstallTool = React.useCallback(async (key: keyof AgentHookInstallReport) => {
    const target = hookTargetIdentity;
    const scope = queryScope;
    const generation = ++requestGenerationRef.current;
    setActingToolState({ target, key });
    try {
      const status: AgentHookToolStatus = await agentHooksApi.uninstallTool(key);
      if (
        requestGenerationRef.current === generation &&
        isComputerQueryScopeCurrent(scope)
      ) {
        setReportState((previous) =>
          previous?.target === target
            ? { target, report: { ...previous.report, [key]: status } }
            : previous
        );
      }
    } catch {
      // Best-effort action; keep the last known report.
    } finally {
      if (requestGenerationRef.current === generation) {
        setActingToolState((current) =>
          current?.target === target && current.key === key ? null : current
        );
      }
    }
  }, [hookTargetIdentity, queryScope]);

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
            <p className="text-base font-medium text-foreground">{t('title')}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t('description')}
            </p>
          </div>
        </CollapsibleTrigger>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleInstallAll}
            disabled={acting || loading}
            title={t('actions.installAllTitle')}
          >
            {acting ? <LoaderCircle className="size-4 animate-spin-reverse" /> : <PlugZap className="size-4" />}
            {t('actions.installAll')}
          </Button>
          {anyInstalled && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUninstallAll}
              disabled={acting || loading}
              className="text-destructive hover:text-destructive"
              title={t('actions.uninstallAllTitle')}
            >
              <Trash2 className="size-4" />
              {t('actions.uninstallAll')}
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
                      {tool.installed && typeof tool.installed_version === 'number' && (
                        <span
                          className={
                            tool.outdated
                              ? 'shrink-0 font-mono text-[10px] text-amber-500'
                              : 'shrink-0 font-mono text-[10px] text-muted-foreground'
                          }
                        >
                          {tool.outdated && typeof tool.current_version === 'number'
                            ? `v${tool.installed_version} -> v${tool.current_version}`
                            : `v${tool.installed_version}`}
                        </span>
                      )}
                      {!tool.detected && (
                        <span className="text-xs text-muted-foreground">{t('status.notDetected')}</span>
                      )}
                      {tool.error && (
                        <span className="truncate text-xs text-destructive" title={tool.error}>
                          {t('status.error', { error: tool.error })}
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
                            aria-label={t('actions.uninstallTool', { label })}
                            title={t('actions.uninstallTool', { label })}
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
                            aria-label={t('actions.installTool', { label })}
                            title={t('actions.installTool', { label })}
                          >
                            {isBusy ? <LoaderCircle className="size-3 animate-spin-reverse" /> : <PlugZap className="size-3" />}
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
              {!anyDetected && t('empty')}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
