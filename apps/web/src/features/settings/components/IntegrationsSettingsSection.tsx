'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button, Skeleton } from '@workspace/ui';
import {
  CircleCheck,
  CircleMinus,
  CircleX,
  ExternalLink,
  Github,
  GitBranch,
} from 'lucide-react';
import { TmuxIcon } from '@workspace/ui/components/icons/tmux-icon';
import {
  useGhCliStatusQuery,
  useTmuxStatusQuery,
  useGitStatusQuery,
} from '@/features/system/hooks/use-system-status-queries';

export function IntegrationsSettingsSection() {
  const t = useTranslations('settings.integrationsSection');
  const ghCliQuery = useGhCliStatusQuery();
  const tmuxQuery = useTmuxStatusQuery();
  const gitQuery = useGitStatusQuery();
  const ghCliStatus = ghCliQuery.data ?? null;
  const tmuxStatus = tmuxQuery.data ?? null;
  const gitStatus = gitQuery.data ?? null;
  const isLoading = ghCliQuery.isLoading || tmuxQuery.isLoading || gitQuery.isLoading;

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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://cli.github.com/', '_blank')}
                    className="cursor-pointer"
                  >
                    <ExternalLink className="mr-2 size-4" />
                    {t('githubCli.actions.install')}
                  </Button>
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
                      onClick={() => window.open('https://cli.github.com/manual/gh_auth_login', '_blank')}
                      className="cursor-pointer"
                    >
                      <ExternalLink className="mr-2 size-4" />
                      {t('githubCli.actions.authenticate')}
                    </Button>
                  )}
                </div>
              )}
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://git-scm.com/', '_blank')}
                    className="cursor-pointer"
                  >
                    <ExternalLink className="mr-2 size-4" />
                    {t('git.actions.install')}
                  </Button>
                )}
              </div>
              {gitStatus?.installed && (gitStatus.username || gitStatus.email) && (
                <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                  <p className="text-sm font-medium text-foreground">{t('git.configuration.title')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('git.configuration.description', {
                      username: gitStatus.username || 'N/A',
                      email: gitStatus.email || 'N/A',
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://github.com/tmux/tmux/wiki', '_blank')}
                    className="cursor-pointer"
                  >
                    <ExternalLink className="mr-2 size-4" />
                    {t('tmux.actions.install')}
                  </Button>
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
