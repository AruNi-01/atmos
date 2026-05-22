'use client';

import React from 'react';
import { Button, Skeleton } from '@workspace/ui';
import {
  CircleCheck,
  CircleMinus,
  CircleX,
  ExternalLink,
  Github,
} from 'lucide-react';
import { TmuxIcon } from '@workspace/ui/components/icons/tmux-icon';
import { systemApi } from '@/api/rest-api';

export function IntegrationsSettingsSection() {
  const [ghCliStatus, setGhCliStatus] = React.useState<{
    installed: boolean;
    authenticated: boolean;
    version: string | null;
    username: string | null;
  } | null>(null);
  const [tmuxStatus, setTmuxStatus] = React.useState<{
    installed: boolean;
    version: string | null;
  } | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const checkStatuses = async () => {
      setIsLoading(true);
      try {
        const [ghStatus, tmuxStat] = await Promise.all([
          systemApi.getGhCliStatus(),
          systemApi.getTmuxStatus(),
        ]);
        setGhCliStatus(ghStatus);
        setTmuxStatus(tmuxStat);
      } catch (error) {
        console.error('Failed to check integration statuses:', error);
      } finally {
        setIsLoading(false);
      }
    };
    checkStatuses();
  }, []);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
          <div className="flex items-start gap-3">
            <Github className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="text-base font-medium text-foreground">GitHub CLI</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Atmos uses GitHub CLI to integrate with GitHub Issues, Pull Requests, and other workflows.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            {isLoading ? (
              <Skeleton className="h-10 w-28 rounded-xl" />
            ) : ghCliStatus?.installed && ghCliStatus.authenticated ? (
              <div className="flex items-center gap-2 text-sm text-emerald-500">
                <CircleCheck className="size-4" />
                <span>Authenticated as </span>
                <span className="font-medium">{ghCliStatus.username || 'user'}</span>
              </div>
            ) : ghCliStatus?.installed ? (
              <div className="flex items-center gap-2 text-sm text-amber-500">
                <CircleX className="size-4" />
                <span>Not authenticated</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CircleMinus className="size-4" />
                <span>Not installed</span>
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
                    <p className="text-sm font-medium text-foreground">Installation Status</p>
                    <p className="text-xs text-muted-foreground">
                      {ghCliStatus?.installed
                        ? `GitHub CLI ${ghCliStatus.version || ''} is installed`
                        : 'GitHub CLI is not installed on this system'}
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
                    Install GitHub CLI
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
                      <p className="text-sm font-medium text-foreground">Authentication Status</p>
                      {ghCliStatus.authenticated ? (
                        <div className="mt-1 flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">Authenticated as</p>
                          <p className="text-xs font-medium text-foreground">{ghCliStatus.username || 'user'}</p>
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">Not authenticated with GitHub</p>
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
                      Authenticate
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
            <TmuxIcon className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="text-base font-medium text-foreground">Tmux</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Atmos uses tmux to keep terminal sessions running continuously. Atmos manages a separate tmux server at ~/.atmos/atmos.sock.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            {isLoading ? (
              <Skeleton className="h-10 w-28 rounded-xl" />
            ) : tmuxStatus?.installed ? (
              <div className="flex items-center gap-2 text-sm text-emerald-500">
                <CircleCheck className="size-4" />
                <span>Installed {tmuxStatus.version || ''}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CircleMinus className="size-4" />
                <span>Not installed</span>
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
                    <p className="text-sm font-medium text-foreground">Installation Status</p>
                    <p className="text-xs text-muted-foreground">
                      {tmuxStatus?.installed
                        ? `tmux ${tmuxStatus.version || ''} is installed`
                        : 'tmux is not installed on this system'}
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
                    Install tmux
                  </Button>
                )}
              </div>
              {tmuxStatus?.installed && (
                <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                  <p className="text-sm font-medium text-foreground">Atmos Tmux Configuration</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Atmos uses a dedicated tmux server with socket at <code className="rounded bg-background px-1 py-0.5">~/.atmos/atmos.sock</code> for terminal persistence and session management.
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
