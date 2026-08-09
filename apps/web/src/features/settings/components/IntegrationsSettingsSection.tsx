'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button, Skeleton, cn } from '@workspace/ui';
import {
  CircleCheck,
  CircleMinus,
  CircleX,
  ExternalLink,
  Github,
  GitBranch,
  RefreshCw,
} from 'lucide-react';
import { TmuxIcon } from '@workspace/ui/components/icons/tmux-icon';
import {
  useGhCliStatusQuery,
  useTmuxStatusQuery,
  useGitStatusQuery,
} from '@/features/system/hooks/use-system-status-queries';
import { useGithubRateLimitQuery } from '@/features/github/hooks/use-github-pr-query';
import { InstallToolPopover } from '@/features/welcome/components/InstallToolPopover';
import type { GithubRateLimitResourcePayload } from '@atmos/api-types/ws/dto/github';

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
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
          <div className="flex items-start gap-3">
            <Github className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="text-base font-medium text-foreground">{t('githubCli.title')}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('githubCli.description')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            {isLoading ? (
              <Skeleton className="h-10 w-28 rounded-xl" />
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
            )}
          </div>
        </div>
        <div className="border-t border-border px-6 py-4">
          {isLoading ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {ghCliStatus?.installed ? (
                    <CircleCheck className="size-4 text-emerald-500" />
                  ) : (
                    <CircleX className="size-4 text-destructive" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">{t('shared.installationStatusTitle')}</p>
                    <p className="text-xs text-muted-foreground">
                      {ghCliStatus?.installed
                        ? t('githubCli.installation.installed', { version: ghCliStatus.version || '' })
                        : t('githubCli.installation.notInstalled')}
                    </p>
                  </div>
                </div>
                {!ghCliStatus?.installed && (
                  <InstallToolPopover
                    toolId="gh"
                    toolName="GitHub CLI (gh)"
                    onInstalled={refetchGh}
                    triggerClassName="h-8 rounded-lg px-3 text-xs font-medium"
                  />
                )}
              </div>
              {ghCliStatus?.installed && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {ghCliStatus.authenticated ? (
                      <CircleCheck className="size-4 text-emerald-500" />
                    ) : (
                      <CircleX className="size-4 text-destructive" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">{t('shared.authenticationStatusTitle')}</p>
                      {ghCliStatus.authenticated ? (
                        <div className="mt-1 flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">{t('githubCli.authentication.authenticatedAsLabel')}</p>
                          <p className="text-xs font-medium text-foreground">{ghCliStatus.username || t('shared.userFallback')}</p>
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">{t('githubCli.authentication.notAuthenticated')}</p>
                      )}
                    </div>
                  </div>
                  {!ghCliStatus.authenticated && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open('https://cli.github.com/manual/gh_auth_login', '_blank', 'noopener,noreferrer')}
                      className="cursor-pointer"
                    >
                      <ExternalLink className="mr-2 size-4" />
                      {t('githubCli.actions.authenticate')}
                    </Button>
                  )}
                </div>
              )}
              <GithubRateLimitPanel enabled={ghAuthenticated} />
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
          <div className="flex items-start gap-3">
            <GitBranch className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="text-base font-medium text-foreground">{t('git.title')}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('git.description')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            {isLoading ? (
              <Skeleton className="h-10 w-28 rounded-xl" />
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
            )}
          </div>
        </div>
        <div className="border-t border-border px-6 py-4">
          {isLoading ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {gitStatus?.installed ? (
                    <CircleCheck className="size-4 text-emerald-500" />
                  ) : (
                    <CircleX className="size-4 text-destructive" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">{t('shared.installationStatusTitle')}</p>
                    <p className="text-xs text-muted-foreground">
                      {gitStatus?.installed
                        ? t('git.installation.installed', { version: gitStatus.version || '' })
                        : t('git.installation.notInstalled')}
                    </p>
                  </div>
                </div>
                {!gitStatus?.installed && (
                  <InstallToolPopover
                    toolId="git"
                    toolName="Git"
                    onInstalled={refetchGit}
                    triggerClassName="h-8 rounded-lg px-3 text-xs font-medium"
                  />
                )}
              </div>
              {gitStatus?.installed && (gitStatus.username || gitStatus.email) && (
                <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                  <p className="text-sm font-medium text-foreground">{t('git.configuration.title')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('git.configuration.description', {
                      username: gitStatus.username || t('shared.userFallback'),
                      email: gitStatus.email || t('shared.userFallback'),
                    })}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
          <div className="flex items-start gap-3">
            <TmuxIcon className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="text-base font-medium text-foreground">{t('tmux.title')}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('tmux.description')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            {isLoading ? (
              <Skeleton className="h-10 w-28 rounded-xl" />
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
            )}
          </div>
        </div>
        <div className="border-t border-border px-6 py-4">
          {isLoading ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {tmuxStatus?.installed ? (
                    <CircleCheck className="size-4 text-emerald-500" />
                  ) : (
                    <CircleX className="size-4 text-destructive" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">{t('shared.installationStatusTitle')}</p>
                    <p className="text-xs text-muted-foreground">
                      {tmuxStatus?.installed
                        ? t('tmux.installation.installed', { version: tmuxStatus.version || '' })
                        : t('tmux.installation.notInstalled')}
                    </p>
                  </div>
                </div>
                {!tmuxStatus?.installed && (
                  <InstallToolPopover
                    toolId="tmux"
                    toolName="tmux"
                    onInstalled={refetchTmux}
                    triggerClassName="h-8 rounded-lg px-3 text-xs font-medium"
                  />
                )}
              </div>
              {tmuxStatus?.installed && (
                <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                  <p className="text-sm font-medium text-foreground">{t('tmux.configuration.title')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('tmux.configuration.description', {
                      socketPath: '~/.atmos/atmos.sock',
                    }).split('~/.atmos/atmos.sock')[0]}
                    <code className="rounded bg-background px-1 py-0.5">~/.atmos/atmos.sock</code>
                    {t('tmux.configuration.description', {
                      socketPath: '~/.atmos/atmos.sock',
                    }).split('~/.atmos/atmos.sock').slice(1).join('~/.atmos/atmos.sock')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
