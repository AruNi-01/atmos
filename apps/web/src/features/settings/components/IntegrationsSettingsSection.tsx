'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button, Skeleton, cn } from '@workspace/ui';
import {
  CircleCheck,
  CircleMinus,
  CircleX,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import {
  useGhCliStatusQuery,
  useTmuxStatusQuery,
  useGitStatusQuery,
} from '@/features/system/hooks/use-system-status-queries';
import { useGithubRateLimitQuery } from '@/features/github/hooks/use-github-pr-query';
import { InstallToolPopover } from '@/features/welcome/components/InstallToolPopover';
import type { GithubRateLimitResourcePayload } from '@atmos/api-types/ws/dto/github';
import type { LinearRateLimitResourcePayload } from '@atmos/api-types/ws/dto/linear';
import { wsLinearApi } from '@/api/ws/linear-api';
import {
  getStoredDeviceCredential,
  hubConfigured,
  hubLinearDisconnect,
  hubLinearStatus,
  hubMe,
} from '@/api/hub-client';
import {
  LINEAR_API_KEYS_CREATE_URL,
  clearLinearAuthSelection,
  defaultLinearKeyName,
  ensureLinearLocalKeysHydrated,
  getActiveLinearLocalKey,
  getLinearAuthSelection,
  getLinearLocalStoreSnapshot,
  listLinearLocalKeys,
  removeLinearLocalKey,
  resolveLinearCredentialSource,
  selectLinearLocalKey,
  selectLinearOauth,
  upsertLinearLocalKey,
} from '@/features/settings/lib/linear-local-keys';
import { useQuery } from '@tanstack/react-query';
import { useQueryState } from 'nuqs';
import { isDesktopAuthSurface } from '@/shared/lib/desktop-runtime';
import {
  currentOAuthReturnToPath,
  storeOAuthReturnContext,
} from '@/shared/lib/oauth-callback-return';
import { useComputerQueryScope } from '@/api/query/query-scope';
import { queryKeys } from '@/api/query/query-keys';
import { settingsModalParams } from '@/shared/lib/nuqs/searchParams';
import {
  SettingsGroupCard,
  SettingsGroupRow,
  SettingsPageStack,
} from '@/features/settings/components/settings/SettingsGroupCard';

type RateLimitKey = 'core' | 'search' | 'graphql';

function formatCount(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function usagePercent(resource: GithubRateLimitResourcePayload): number {
  if (resource.limit <= 0) return 0;
  return Math.max(0, Math.min(100, (resource.used / resource.limit) * 100));
}

function formatResetRelative(
  resetUnix: number,
  labels: {
    soon: string;
    minutes: (minutes: number) => string;
    hours: (hours: number) => string;
    hoursMinutes: (hours: number, minutes: number) => string;
  },
): string {
  const resetMs = resetUnix * 1000;
  const diffMs = resetMs - Date.now();
  if (diffMs <= 0) {
    return labels.soon;
  }
  const totalMinutes = Math.ceil(diffMs / 60_000);
  if (totalMinutes < 60) {
    return labels.minutes(totalMinutes);
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return labels.hours(hours);
  }
  return labels.hoursMinutes(hours, minutes);
}

function RateLimitBar({
  label,
  resource,
  footer,
}: {
  label: string;
  resource: GithubRateLimitResourcePayload;
  footer: string;
}) {
  const percent = usagePercent(resource);
  const barTone =
    percent >= 90
      ? 'bg-destructive'
      : percent >= 70
        ? 'bg-amber-500'
        : 'bg-foreground';

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {formatCount(resource.used)} / {formatCount(resource.limit)}
        </p>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted/80"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={resource.limit}
        aria-valuenow={resource.used}
        aria-label={label}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-300', barTone)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{footer}</p>
    </div>
  );
}

function GithubRateLimitPanel({ enabled }: { enabled: boolean }) {
  const t = useTranslations('settings.integrationsSection');
  const query = useGithubRateLimitQuery({ enabled });
  const data = query.data;
  const isInitialLoading = enabled && query.isLoading && !data;
  const isRefreshing = query.isFetching && !!data;

  const resourceLabel = React.useCallback(
    (key: RateLimitKey) => {
      switch (key) {
        case 'core':
          return t('githubCli.rateLimit.resources.core');
        case 'search':
          return t('githubCli.rateLimit.resources.search');
        case 'graphql':
          return t('githubCli.rateLimit.resources.graphql');
      }
    },
    [t],
  );

  if (!enabled) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t('githubCli.rateLimit.title')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('githubCli.rateLimit.description')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 cursor-pointer gap-1.5"
          onClick={() => {
            void query.refetch();
          }}
          disabled={query.isFetching}
        >
          <RefreshCw className={cn('size-3.5', isRefreshing && 'animate-spin')} />
          {t('githubCli.rateLimit.refresh')}
        </Button>
      </div>

      {isInitialLoading ? (
        <div className="mt-3 space-y-3">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : query.isError ? (
        <p className="mt-3 text-xs text-destructive">
          {t('githubCli.rateLimit.loadError')}
        </p>
      ) : data ? (
        <div className="mt-3 space-y-3">
          {(['core', 'search', 'graphql'] as const).map((key) => {
            const resource = data[key];
            const reset = formatResetRelative(resource.reset, {
              soon: t('githubCli.rateLimit.resetSoon'),
              minutes: (minutes) => t('githubCli.rateLimit.resetInMinutes', { minutes }),
              hours: (hours) => t('githubCli.rateLimit.resetInHours', { hours }),
              hoursMinutes: (hours, minutes) =>
                t('githubCli.rateLimit.resetInHoursMinutes', { hours, minutes }),
            });
            return (
              <RateLimitBar
                key={key}
                label={resourceLabel(key)}
                resource={resource}
                footer={t('githubCli.rateLimit.footer', {
                  remaining: formatCount(resource.remaining),
                  reset,
                })}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Same visual language as GitHub rate limits (used / limit bars + reset footer). */
function LinearRateLimitPanel({
  enabled,
  authKey,
  linearApiKey,
}: {
  enabled: boolean;
  /** Bump/refetch when OAuth vs local key identity changes. */
  authKey: string;
  linearApiKey?: string | null;
}) {
  const t = useTranslations('settings.integrationsSection');
  const scope = useComputerQueryScope();
  const query = useQuery({
    queryKey: [
      ...queryKeys.computer.root(scope),
      'linear',
      'rateLimit',
      authKey,
    ] as const,
    queryFn: () =>
      wsLinearApi.rateLimit({
        linearApiKey: linearApiKey ?? undefined,
      }),
    enabled,
    staleTime: 30_000,
  });
  const data = query.data;
  const isInitialLoading = enabled && query.isLoading && !data;
  const isRefreshing = query.isFetching && !!data;

  if (!enabled) return null;

  const toGithubShape = (
    resource: LinearRateLimitResourcePayload | null | undefined,
  ): GithubRateLimitResourcePayload | null => {
    if (!resource || resource.limit <= 0) return null;
    return {
      limit: resource.limit,
      used: resource.used,
      remaining: resource.remaining,
      // Linear reset is ms epoch; RateLimitBar helper expects unix seconds.
      reset: Math.floor(resource.reset / 1000),
    };
  };

  const rows = (
    [
      ['requests', data?.requests],
      ['complexity', data?.complexity],
    ] as const
  )
    .map(([key, resource]) => {
      const shaped = toGithubShape(resource);
      if (!shaped) return null;
      const reset = formatResetRelative(shaped.reset, {
        soon: t('linear.rateLimit.resetSoon'),
        minutes: (minutes) => t('linear.rateLimit.resetInMinutes', { minutes }),
        hours: (hours) => t('linear.rateLimit.resetInHours', { hours }),
        hoursMinutes: (hours, minutes) =>
          t('linear.rateLimit.resetInHoursMinutes', { hours, minutes }),
      });
      return (
        <RateLimitBar
          key={key}
          label={t(`linear.rateLimit.resources.${key}`)}
          resource={shaped}
          footer={t('linear.rateLimit.footer', {
            remaining: formatCount(shaped.remaining),
            reset,
          })}
        />
      );
    })
    .filter(Boolean);

  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t('linear.rateLimit.title')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('linear.rateLimit.description')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 cursor-pointer gap-1.5"
          onClick={() => {
            void query.refetch();
          }}
          disabled={query.isFetching}
        >
          <RefreshCw className={cn('size-3.5', isRefreshing && 'animate-spin')} />
          {t('linear.rateLimit.refresh')}
        </Button>
      </div>
      {isInitialLoading ? (
        <div className="mt-3 space-y-3">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : query.isError ? (
        <p className="mt-3 text-xs text-destructive">{t('linear.rateLimit.loadError')}</p>
      ) : rows.length > 0 ? (
        <div className="mt-3 space-y-3">{rows}</div>
      ) : data ? (
        <p className="mt-3 text-xs text-muted-foreground">{t('linear.rateLimit.empty')}</p>
      ) : null}
    </div>
  );
}

function LinearIntegrationCard() {
  const t = useTranslations('settings.integrationsSection');
  const scope = useComputerQueryScope();
  const [, setActiveSettingTab] = useQueryState(
    'activeSettingTab',
    settingsModalParams.activeSettingTab,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [keysVersion, setKeysVersion] = React.useState(0);
  const [draftName, setDraftName] = React.useState(() => defaultLinearKeyName());
  const [draftKey, setDraftKey] = React.useState('');
  const [hydrating, setHydrating] = React.useState(true);
  const hubReady = hubConfigured();
  const hasDevice = Boolean(getStoredDeviceCredential());

  React.useEffect(() => {
    let cancelled = false;
    void ensureLinearLocalKeysHydrated().then(() => {
      if (!cancelled) {
        setHydrating(false);
        setKeysVersion((v) => v + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selection = React.useMemo(() => getLinearAuthSelection(), [keysVersion]);
  const localKeys = React.useMemo(() => listLinearLocalKeys(), [keysVersion]);
  const activeLocal = React.useMemo(() => getActiveLinearLocalKey(), [keysVersion]);
  const storeMeta = React.useMemo(() => getLinearLocalStoreSnapshot(), [keysVersion]);

  const oauthStatusQuery = useQuery({
    queryKey: [...queryKeys.computer.root(scope), 'linear', 'oauthStatus', hubReady] as const,
    queryFn: async () => {
      if (hubReady) {
        try {
          const me = await hubMe();
          if (!me) {
            return {
              connected: false,
              needs_hub_login: true,
            } as Awaited<ReturnType<typeof wsLinearApi.status>>;
          }
          const hub = await hubLinearStatus();
          return {
            connected: hub.connected,
            auth_method: hub.auth_method ?? 'oauth',
            viewer_name: hub.viewer_name ?? null,
            viewer_email: hub.viewer_email ?? null,
            needs_hub_login: false,
          };
        } catch {
          /* fall through */
        }
      }
      return wsLinearApi.status({ linearApiKey: null });
    },
    // OAuth finishes in a popup/new tab; refresh when the user returns to Settings.
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  const localStatusQuery = useQuery({
    queryKey: [
      ...queryKeys.computer.root(scope),
      'linear',
      'localStatus',
      activeLocal?.id ?? null,
      keysVersion,
    ] as const,
    queryFn: () =>
      wsLinearApi.status({ linearApiKey: activeLocal?.api_key ?? null }),
    enabled: selection.mode === 'local' && Boolean(activeLocal?.api_key),
    staleTime: 15_000,
  });

  const oauthConnected = Boolean(oauthStatusQuery.data?.connected);
  const needsHubLogin = Boolean(oauthStatusQuery.data?.needs_hub_login);
  const source = resolveLinearCredentialSource({
    selection,
    oauthConnected,
    hasLocalKey: Boolean(activeLocal),
  });
  const connected = source === 'oauth' || source === 'local';
  const viewer =
    source === 'local'
      ? activeLocal?.viewer_name ||
        activeLocal?.viewer_email ||
        localStatusQuery.data?.viewer_name ||
        localStatusQuery.data?.viewer_email
      : oauthStatusQuery.data?.viewer_name || oauthStatusQuery.data?.viewer_email;
  const canConnectOauth = !needsHubLogin && hasDevice && !busy;

  const bumpKeys = () => setKeysVersion((v) => v + 1);

  // Hub OAuth is per Atmos user_id (cross-device). New machines default selection to
  // "none"; adopt OAuth when Hub already has it and this machine has no local key.
  React.useEffect(() => {
    if (!oauthConnected) return;
    if (selection.mode === 'oauth') return;
    if (selection.mode === 'local') return;
    if (activeLocal) return;
    void selectLinearOauth().then(bumpKeys);
  }, [oauthConnected, selection.mode, activeLocal]);

  const connectOauth = async () => {
    setBusy(true);
    setError(null);
    try {
      if (needsHubLogin) {
        setError(t('linear.needsHubLogin'));
        return;
      }
      if (!hasDevice) {
        setError(t('linear.needsDevice'));
        return;
      }
      const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
      const shell =
        origin && !origin.includes('127.0.0.1:39217') ? 'web' : 'desktop';
      const { authorize_url, state } = await wsLinearApi.oauthStart(shell, origin);
      storeOAuthReturnContext(state, {
        client: isDesktopAuthSurface() ? 'desktop' : 'web',
        returnTo: currentOAuthReturnToPath(),
      });
      await selectLinearOauth();
      bumpKeys();
      window.open(authorize_url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('linear.connectFailed'));
    } finally {
      setBusy(false);
    }
  };

  const disconnectOauth = async () => {
    setBusy(true);
    setError(null);
    try {
      if (hubReady && !needsHubLogin) {
        try {
          await hubLinearDisconnect();
        } catch {
          await wsLinearApi.disconnect();
        }
      } else {
        await wsLinearApi.disconnect();
      }
      if (selection.mode === 'oauth') {
        await clearLinearAuthSelection();
      }
      bumpKeys();
      await oauthStatusQuery.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('linear.disconnectFailed'));
    } finally {
      setBusy(false);
    }
  };

  const saveLocalKey = async () => {
    setBusy(true);
    setError(null);
    try {
      const apiKey = draftKey.trim();
      if (!apiKey) {
        setError(t('linear.local.apiKeyRequired'));
        return;
      }
      const status = await wsLinearApi.connectApiKey(apiKey);
      await upsertLinearLocalKey({
        name: draftName.trim() || defaultLinearKeyName(),
        api_key: apiKey,
        viewer_name: status.viewer_name,
        viewer_email: status.viewer_email,
      });
      setDraftKey('');
      setDraftName(defaultLinearKeyName());
      bumpKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('linear.local.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsGroupCard
      title={t('linear.title')}
      description={t('linear.description')}
      headerEnd={
        oauthStatusQuery.isLoading && selection.mode !== 'local' ? (
          <Skeleton className="h-8 w-28 rounded-xl" />
        ) : connected ? (
          <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-emerald-500">
            <CircleCheck className="size-4" />
            <span>
              {viewer
                ? t('linear.connectedAs', { name: viewer })
                : t('githubCli.status.authenticatedAs', {
                    username: t('shared.userFallback'),
                  })}
            </span>
            <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground">
              {source === 'local'
                ? t('linear.chip.localApiKey')
                : t('linear.chip.oauthAccount')}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleMinus className="size-4" />
            <span>
              {needsHubLogin && selection.mode === 'oauth'
                ? t('linear.needsHubLogin')
                : t('linear.notConnected')}
            </span>
          </div>
        )
      }
    >
      <div className="px-2 py-3">
        <LinearRateLimitPanel
          enabled={connected}
          authKey={
            source === 'local'
              ? `local:${activeLocal?.id ?? 'none'}`
              : `oauth:${oauthConnected ? '1' : '0'}`
          }
          linearApiKey={
            source === 'local' ? activeLocal?.api_key ?? null : null
          }
        />
      </div>

      <SettingsGroupRow
        wide
        title={
          <span className="inline-flex items-center gap-2">
            {t('linear.oauth.title')}
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {t('linear.oauth.recommended')}
            </span>
          </span>
        }
        description={t('linear.oauth.hint')}
        footer={
          needsHubLogin || !hasDevice ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {needsHubLogin
                  ? t('linear.needsHubLoginHint')
                  : t('linear.needsDeviceHint')}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => {
                  void setActiveSettingTab('account');
                }}
              >
                {t('linear.openAccount')}
              </Button>
            </div>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center justify-end gap-2">
          {oauthConnected ? (
            <>
              {selection.mode === 'oauth' ? (
                <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground">
                  {t('linear.usingThis')}
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    void selectLinearOauth().then(bumpKeys);
                  }}
                >
                  {t('linear.useThis')}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy}
                onClick={() => void disconnectOauth()}
              >
                {t('linear.disconnect')}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={!canConnectOauth}
              onClick={() => void connectOauth()}
            >
              {busy ? t('linear.connecting') : t('linear.connectOauth')}
            </Button>
          )}
        </div>
      </SettingsGroupRow>

      <div className="border-b border-border/60 px-2 py-3 last:border-b-0">
        <p className="text-sm font-medium text-foreground">{t('linear.local.title')}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t('linear.local.hint')}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {hydrating
            ? t('linear.local.storageLoading')
            : storeMeta.onDisk
              ? t('linear.local.storageDisk')
              : t('linear.local.storageBrowserFallback')}
        </p>
        <a
          href={LINEAR_API_KEYS_CREATE_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {t('linear.local.createKeyLink')}
          <ExternalLink className="size-3" />
        </a>

        {localKeys.length > 0 ? (
          <ul className="mt-3 divide-y divide-border/60">
            {localKeys.map((key) => {
              const selected =
                selection.mode === 'local' && selection.keyId === key.id;
              return (
                <li
                  key={key.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{key.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {key.viewer_name || key.viewer_email || t('linear.local.unnamedViewer')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {selected ? (
                      <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground">
                        {t('linear.usingThis')}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => {
                          void selectLinearLocalKey(key.id).then(bumpKeys);
                        }}
                      >
                        {t('linear.useThis')}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-destructive"
                      onClick={() => {
                        void removeLinearLocalKey(key.id).then(bumpKeys);
                      }}
                    >
                      {t('linear.local.remove')}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={t('linear.local.namePlaceholder')}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
          />
          <input
            type="password"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            placeholder={t('linear.local.apiKeyPlaceholder')}
            autoComplete="off"
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
          />
          <Button
            type="button"
            size="sm"
            className="h-9"
            disabled={busy || !draftKey.trim()}
            onClick={() => void saveLocalKey()}
          >
            {t('linear.local.save')}
          </Button>
        </div>
      </div>

      {error ? <p className="px-2 py-3 text-xs text-destructive">{error}</p> : null}
    </SettingsGroupCard>
  );
}

export function IntegrationsSettingsSection() {
  const t = useTranslations('settings.integrationsSection');
  const ghCliQuery = useGhCliStatusQuery();
  const tmuxQuery = useTmuxStatusQuery();
  const gitQuery = useGitStatusQuery();
  const ghCliStatus = ghCliQuery.data ?? null;
  const tmuxStatus = tmuxQuery.data ?? null;
  const gitStatus = gitQuery.data ?? null;
  const isLoading = ghCliQuery.isLoading || tmuxQuery.isLoading || gitQuery.isLoading;
  const ghAuthenticated = Boolean(ghCliStatus?.installed && ghCliStatus.authenticated);

  const refetchGh = React.useCallback(() => {
    void ghCliQuery.refetch();
  }, [ghCliQuery]);
  const refetchGit = React.useCallback(() => {
    void gitQuery.refetch();
  }, [gitQuery]);
  const refetchTmux = React.useCallback(() => {
    void tmuxQuery.refetch();
  }, [tmuxQuery]);

  return (
    <SettingsPageStack>
      <SettingsGroupCard
        title={t('githubCli.title')}
        description={t('githubCli.description')}
        headerEnd={
          isLoading ? (
            <Skeleton className="h-8 w-28 rounded-xl" />
          ) : ghCliStatus?.installed && ghCliStatus.authenticated ? (
            <div className="flex items-center gap-2 text-sm text-emerald-500">
              <CircleCheck className="size-4" />
              <span>{t('githubCli.status.authenticatedAs', { username: ghCliStatus.username || t('shared.userFallback') })}</span>
            </div>
          ) : ghCliStatus?.installed ? (
            <div className="flex items-center gap-2 text-sm text-amber-500">
              <CircleX className="size-4" />
              <span>{t('shared.status.notAuthenticated')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleMinus className="size-4" />
              <span>{t('shared.status.notInstalled')}</span>
            </div>
          )
        }
      >
        {isLoading ? (
          <div className="px-2 py-3">
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <SettingsGroupRow
              wide
              title={t('shared.installationStatusTitle')}
              description={
                ghCliStatus?.installed
                  ? t('githubCli.installation.installed', { version: ghCliStatus.version || '' })
                  : t('githubCli.installation.notInstalled')
              }
            >
              {!ghCliStatus?.installed ? (
                <InstallToolPopover
                  toolId="gh"
                  toolName="GitHub CLI (gh)"
                  onInstalled={refetchGh}
                  triggerClassName="h-8 rounded-lg px-3 text-xs font-medium"
                />
              ) : null}
            </SettingsGroupRow>
            {ghCliStatus?.installed ? (
              <SettingsGroupRow
                wide
                title={t('shared.authenticationStatusTitle')}
                description={
                  ghCliStatus.authenticated
                    ? `${t('githubCli.authentication.authenticatedAsLabel')} ${ghCliStatus.username || t('shared.userFallback')}`
                    : t('githubCli.authentication.notAuthenticated')
                }
              >
                {!ghCliStatus.authenticated ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://cli.github.com/manual/gh_auth_login', '_blank', 'noopener,noreferrer')}
                    className="cursor-pointer"
                  >
                    <ExternalLink className="mr-2 size-4" />
                    {t('githubCli.actions.authenticate')}
                  </Button>
                ) : null}
              </SettingsGroupRow>
            ) : null}
            <div className="px-2 py-3">
              <GithubRateLimitPanel enabled={ghAuthenticated} />
            </div>
          </>
        )}
      </SettingsGroupCard>

      <LinearIntegrationCard />

      <SettingsGroupCard
        title={t('git.title')}
        description={t('git.description')}
        headerEnd={
          isLoading ? (
            <Skeleton className="h-8 w-28 rounded-xl" />
          ) : gitStatus?.installed ? (
            <div className="flex items-center gap-2 text-sm text-emerald-500">
              <CircleCheck className="size-4" />
              <span>{t('git.status.installed', { version: gitStatus.version || '' })}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleMinus className="size-4" />
              <span>{t('shared.status.notInstalled')}</span>
            </div>
          )
        }
      >
        {isLoading ? (
          <div className="px-2 py-3">
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <SettingsGroupRow
              wide
              title={t('shared.installationStatusTitle')}
              description={
                gitStatus?.installed
                  ? t('git.installation.installed', { version: gitStatus.version || '' })
                  : t('git.installation.notInstalled')
              }
            >
              {!gitStatus?.installed ? (
                <InstallToolPopover
                  toolId="git"
                  toolName="Git"
                  onInstalled={refetchGit}
                  triggerClassName="h-8 rounded-lg px-3 text-xs font-medium"
                />
              ) : null}
            </SettingsGroupRow>
            {gitStatus?.installed && (gitStatus.username || gitStatus.email) ? (
              <SettingsGroupRow
                title={t('git.configuration.title')}
                description={t('git.configuration.description', {
                  username: gitStatus.username || t('shared.userFallback'),
                  email: gitStatus.email || t('shared.userFallback'),
                })}
              >
                {null}
              </SettingsGroupRow>
            ) : null}
          </>
        )}
      </SettingsGroupCard>

      <SettingsGroupCard
        title={t('tmux.title')}
        description={t('tmux.description')}
        headerEnd={
          isLoading ? (
            <Skeleton className="h-8 w-28 rounded-xl" />
          ) : tmuxStatus?.installed ? (
            <div className="flex items-center gap-2 text-sm text-emerald-500">
              <CircleCheck className="size-4" />
              <span>{t('tmux.status.installed', { version: tmuxStatus.version || '' })}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleMinus className="size-4" />
              <span>{t('shared.status.notInstalled')}</span>
            </div>
          )
        }
      >
        {isLoading ? (
          <div className="px-2 py-3">
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <SettingsGroupRow
              wide
              title={t('shared.installationStatusTitle')}
              description={
                tmuxStatus?.installed
                  ? t('tmux.installation.installed', { version: tmuxStatus.version || '' })
                  : t('tmux.installation.notInstalled')
              }
            >
              {!tmuxStatus?.installed ? (
                <InstallToolPopover
                  toolId="tmux"
                  toolName="tmux"
                  onInstalled={refetchTmux}
                  triggerClassName="h-8 rounded-lg px-3 text-xs font-medium"
                />
              ) : null}
            </SettingsGroupRow>
            {tmuxStatus?.installed ? (
              <SettingsGroupRow
                title={t('tmux.configuration.title')}
                description={
                  <>
                    {t('tmux.configuration.description', {
                      socketPath: '~/.atmos/atmos.sock',
                    }).split('~/.atmos/atmos.sock')[0]}
                    <code className="rounded bg-background px-1 py-0.5">~/.atmos/atmos.sock</code>
                    {t('tmux.configuration.description', {
                      socketPath: '~/.atmos/atmos.sock',
                    }).split('~/.atmos/atmos.sock').slice(1).join('~/.atmos/atmos.sock')}
                  </>
                }
              >
                {null}
              </SettingsGroupRow>
            ) : null}
          </>
        )}
      </SettingsGroupCard>
    </SettingsPageStack>
  );
}
