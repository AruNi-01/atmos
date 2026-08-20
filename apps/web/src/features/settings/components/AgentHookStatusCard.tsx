'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button, Skeleton } from '@workspace/ui';
import {
  CircleCheck,
  CircleMinus,
  CircleX,
  LoaderCircle,
  PlugZap,
  Trash2,
} from 'lucide-react';
import {
  SettingsGroupCard,
  SettingsGroupRow,
} from '@/features/settings/components/settings/SettingsGroupCard';
import {
  agentHooksApi,
  type AgentHookInstallReport,
  type AgentHookToolStatus,
} from '@/api/rest-api';
import { useComputerQueryScope } from '@/api/query/query-scope';
import { isComputerQueryScopeCurrent } from '@/api/ws/request';

const HOOK_TOOL_META: {
  key: keyof AgentHookInstallReport;
  labelKey: string;
}[] = [
  { key: 'claude_code', labelKey: 'tools.claude_code' },
  { key: 'codex', labelKey: 'tools.codex' },
  { key: 'cursor', labelKey: 'tools.cursor' },
  { key: 'gemini', labelKey: 'tools.gemini' },
  { key: 'antigravity', labelKey: 'tools.antigravity' },
  { key: 'factory_droid', labelKey: 'tools.factory_droid' },
  { key: 'kiro', labelKey: 'tools.kiro' },
  { key: 'opencode', labelKey: 'tools.opencode' },
  { key: 'ampcode', labelKey: 'tools.ampcode' },
  { key: 'pi', labelKey: 'tools.pi' },
  { key: 'hermes', labelKey: 'tools.hermes' },
  { key: 'grok_build', labelKey: 'tools.grok_build' },
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
  // Separate generations so install-all / per-tool mutations do not invalidate each other.
  const statusGenerationRef = React.useRef(0);
  const bulkActionGenerationRef = React.useRef(0);
  const toolActionGenerationRef = React.useRef(0);
  const [reportState, setReportState] = React.useState<{
    target: string;
    report: AgentHookInstallReport;
  } | null>(null);
  const [statusState, setStatusState] = React.useState<{
    target: string;
    status: 'loading' | 'ready' | 'error';
  } | null>(null);
  const [actingTarget, setActingTarget] = React.useState<string | null>(null);
  const [actingToolState, setActingToolState] = React.useState<{
    target: string;
    key: string;
  } | null>(null);
  const [expanded, setExpanded] = React.useState(true);
  const report =
    reportState?.target === hookTargetIdentity ? reportState.report : null;
  const loading =
    statusState?.target !== hookTargetIdentity || statusState.status === 'loading';
  const loadError =
    statusState?.target === hookTargetIdentity && statusState.status === 'error';
  const acting = actingTarget === hookTargetIdentity;
  const actingTool =
    actingToolState?.target === hookTargetIdentity ? actingToolState.key : null;

  React.useEffect(() => {
    // Drop action busy flags when the Computer/target scope changes so a
    // previous target cannot leave this one stuck spinning.
    setActingTarget(null);
    setActingToolState(null);
  }, [hookTargetIdentity]);

  React.useEffect(() => {
    let cancelled = false;
    const target = hookTargetIdentity;
    const scope = queryScope;
    const generation = ++statusGenerationRef.current;
    setStatusState({ target, status: 'loading' });
    void agentHooksApi
      .getStatus()
      .then((status) => {
        if (
          !cancelled &&
          statusGenerationRef.current === generation &&
          isComputerQueryScopeCurrent(scope)
        ) {
          setReportState({ target, report: status });
          setStatusState({ target, status: 'ready' });
        }
      })
      .catch(() => {
        if (
          !cancelled &&
          statusGenerationRef.current === generation &&
          isComputerQueryScopeCurrent(scope)
        ) {
          setStatusState({ target, status: 'error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hookTargetIdentity, queryScope]);

  const handleInstallAll = React.useCallback(async () => {
    const target = hookTargetIdentity;
    const scope = queryScope;
    const generation = ++bulkActionGenerationRef.current;
    setActingTarget(target);
    try {
      const nextReport = await agentHooksApi.installAll();
      if (
        bulkActionGenerationRef.current === generation &&
        isComputerQueryScopeCurrent(scope)
      ) {
        setReportState({ target, report: nextReport });
        setStatusState({ target, status: 'ready' });
      }
    } catch {
      // Best-effort action; status can be refreshed by reopening the settings panel.
    } finally {
      if (bulkActionGenerationRef.current === generation) {
        setActingTarget((current) => (current === target ? null : current));
      }
    }
  }, [hookTargetIdentity, queryScope]);

  const handleUninstallAll = React.useCallback(async () => {
    const target = hookTargetIdentity;
    const scope = queryScope;
    const generation = ++bulkActionGenerationRef.current;
    setActingTarget(target);
    try {
      const nextReport = await agentHooksApi.uninstallAll();
      if (
        bulkActionGenerationRef.current === generation &&
        isComputerQueryScopeCurrent(scope)
      ) {
        setReportState({ target, report: nextReport });
        setStatusState({ target, status: 'ready' });
      }
    } catch {
      // Best-effort action; status can be refreshed by reopening the settings panel.
    } finally {
      if (bulkActionGenerationRef.current === generation) {
        setActingTarget((current) => (current === target ? null : current));
      }
    }
  }, [hookTargetIdentity, queryScope]);

  const handleInstallTool = React.useCallback(async (key: keyof AgentHookInstallReport) => {
    const target = hookTargetIdentity;
    const scope = queryScope;
    const generation = ++toolActionGenerationRef.current;
    setActingToolState({ target, key });
    try {
      const status: AgentHookToolStatus = await agentHooksApi.installTool(key);
      if (
        toolActionGenerationRef.current === generation &&
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
      if (toolActionGenerationRef.current === generation) {
        setActingToolState((current) =>
          current?.target === target && current.key === key ? null : current
        );
      }
    }
  }, [hookTargetIdentity, queryScope]);

  const handleUninstallTool = React.useCallback(async (key: keyof AgentHookInstallReport) => {
    const target = hookTargetIdentity;
    const scope = queryScope;
    const generation = ++toolActionGenerationRef.current;
    setActingToolState({ target, key });
    try {
      const status: AgentHookToolStatus = await agentHooksApi.uninstallTool(key);
      if (
        toolActionGenerationRef.current === generation &&
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
      if (toolActionGenerationRef.current === generation) {
        setActingToolState((current) =>
          current?.target === target && current.key === key ? null : current
        );
      }
    }
  }, [hookTargetIdentity, queryScope]);

  const retryStatus = React.useCallback(() => {
    const target = hookTargetIdentity;
    const scope = queryScope;
    const generation = ++statusGenerationRef.current;
    setStatusState({ target, status: 'loading' });
    void agentHooksApi
      .getStatus()
      .then((status) => {
        if (
          statusGenerationRef.current === generation &&
          isComputerQueryScopeCurrent(scope)
        ) {
          setReportState({ target, report: status });
          setStatusState({ target, status: 'ready' });
        }
      })
      .catch(() => {
        if (
          statusGenerationRef.current === generation &&
          isComputerQueryScopeCurrent(scope)
        ) {
          setStatusState({ target, status: 'error' });
        }
      });
  }, [hookTargetIdentity, queryScope]);

  const anyInstalled = report && HOOK_TOOL_META.some((tool) => report[tool.key].installed);
  const anyDetected = report && HOOK_TOOL_META.some((tool) => report[tool.key].detected);

  return (
    <SettingsGroupCard
      open={expanded}
      onOpenChange={setExpanded}
      title={t('title')}
      description={t('description')}
      headerEnd={
        <div className="flex items-center gap-2">
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
      }
    >
      {loading && !report ? (
        <div className="px-2 py-3">
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      ) : loadError && !report ? (
        <SettingsGroupRow
          wide
          title={t('loadError')}
          description=""
        >
          <Button variant="outline" size="sm" onClick={retryStatus}>
            {t('actions.retry')}
          </Button>
        </SettingsGroupRow>
      ) : report ? (
        HOOK_TOOL_META.map(({ key, labelKey }) => {
          const tool = report[key];
          const label = t(labelKey as never);
          const isBusy = actingTool === key;
          const statusIcon = tool.detected
            ? tool.installed
              ? <CircleCheck className="size-3.5 shrink-0 text-emerald-500" />
              : <CircleX className="size-3.5 shrink-0 text-amber-500" />
            : <CircleMinus className="size-3.5 shrink-0 text-muted-foreground/50" />;
          return (
            <SettingsGroupRow
              key={key}
              wide
              title={
                <span className="inline-flex items-center gap-2">
                  {statusIcon}
                  {label}
                </span>
              }
              description={
                tool.error
                  ? t('status.error', { error: tool.error })
                  : !tool.detected
                    ? t('status.notDetected')
                    : tool.config_path
                      ? tool.config_path.split(/[\\/]/).slice(-2).join('/')
                      : null
              }
            >
              {tool.detected && !tool.error ? (
                tool.installed ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive"
                    disabled={isBusy || acting}
                    onClick={() => handleUninstallTool(key)}
                    aria-label={t('actions.uninstallTool', { label })}
                    title={t('actions.uninstallTool', { label })}
                  >
                    {isBusy ? <LoaderCircle className="size-3 animate-spin-reverse" /> : <Trash2 className="size-3.5" />}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-emerald-500 hover:text-emerald-500"
                    disabled={isBusy || acting}
                    onClick={() => handleInstallTool(key)}
                    aria-label={t('actions.installTool', { label })}
                    title={t('actions.installTool', { label })}
                  >
                    {isBusy ? <LoaderCircle className="size-3 animate-spin-reverse" /> : <PlugZap className="size-3.5" />}
                  </Button>
                )
              ) : null}
            </SettingsGroupRow>
          );
        })
      ) : (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          {!anyDetected && t('empty')}
        </p>
      )}
    </SettingsGroupCard>
  );
}
