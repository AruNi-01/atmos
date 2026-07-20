'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  toastManager,
} from '@workspace/ui';
import { Copy, ExternalLink, Loader2, SquareTerminal, X } from 'lucide-react';
import { fsApi } from '@/api/ws-api';
import { systemApi, type TmuxInstallPlanResponse } from '@/api/rest-api';
import { Terminal, type TerminalRef } from '@/features/terminal/components/Terminal';

export type OnboardingInstallToolId = 'tmux' | 'git' | 'gh';

interface PackageInstallTerminalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolId: OnboardingInstallToolId;
  toolName: string;
  onInstalled?: () => void | Promise<void>;
}

type InstallPhase = 'guide' | 'terminal';

const HOMEBREW_INSTALL_URL = 'https://brew.sh';
const HOMEBREW_INSTALL_COMMAND =
  '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';

function commandForPackageManager(
  toolId: OnboardingInstallToolId,
  packageManager: string | null | undefined,
): { command: string; requiresSudo: boolean } | null {
  switch (packageManager) {
    case 'brew':
      return { command: `brew install ${toolId}`, requiresSudo: false };
    case 'apt-get':
      return {
        command: `sudo apt-get update && sudo apt-get install -y ${toolId}`,
        requiresSudo: true,
      };
    case 'dnf':
      return { command: `sudo dnf install -y ${toolId}`, requiresSudo: true };
    case 'yum':
      return { command: `sudo yum install -y ${toolId}`, requiresSudo: true };
    case 'pacman':
      return { command: `sudo pacman -S --noconfirm ${toolId}`, requiresSudo: true };
    case 'zypper':
      return { command: `sudo zypper install -y ${toolId}`, requiresSudo: true };
    case 'apk':
      return { command: `sudo apk add ${toolId}`, requiresSudo: true };
    default:
      return null;
  }
}

function resolveInstallCommand(
  toolId: OnboardingInstallToolId,
  plan: TmuxInstallPlanResponse | null,
): {
  command: string | null;
  homebrewBootstrap: boolean;
  requiresSudo: boolean;
  reason: string | null;
} {
  if (!plan) {
    return { command: null, homebrewBootstrap: false, requiresSudo: false, reason: null };
  }

  // Prefer the host-detected tmux plan command when installing tmux.
  if (toolId === 'tmux' && plan.command) {
    return {
      command: plan.command,
      homebrewBootstrap: false,
      requiresSudo: plan.requires_sudo,
      reason: null,
    };
  }

  const fromPm = commandForPackageManager(toolId, plan.package_manager);
  if (fromPm) {
    return {
      command: fromPm.command,
      homebrewBootstrap: false,
      requiresSudo: fromPm.requiresSudo,
      reason: null,
    };
  }

  if (plan.platform === 'macOS') {
    return {
      command: HOMEBREW_INSTALL_COMMAND,
      homebrewBootstrap: true,
      requiresSudo: false,
      reason: plan.reason,
    };
  }

  return {
    command: null,
    homebrewBootstrap: false,
    requiresSudo: false,
    reason: plan.reason,
  };
}

async function isToolInstalled(toolId: OnboardingInstallToolId): Promise<boolean> {
  switch (toolId) {
    case 'tmux':
      return (await systemApi.getTmuxStatus()).installed;
    case 'git':
      return (await systemApi.getGitStatus()).installed;
    case 'gh':
      return (await systemApi.getGhCliStatus()).installed;
  }
}

export function PackageInstallTerminalDialog({
  open,
  onOpenChange,
  toolId,
  toolName,
  onInstalled,
}: PackageInstallTerminalDialogProps) {
  const t = useTranslations('onboarding.check.installTerminal');
  const terminalRef = React.useRef<TerminalRef | null>(null);
  const startedRef = React.useRef(false);
  const commandStartTimerRef = React.useRef<number | null>(null);

  const [phase, setPhase] = React.useState<InstallPhase>('guide');
  const [plan, setPlan] = React.useState<TmuxInstallPlanResponse | null>(null);
  const [planError, setPlanError] = React.useState<string | null>(null);
  const [homeDir, setHomeDir] = React.useState<string | null>(null);
  const [homeDirError, setHomeDirError] = React.useState<string | null>(null);
  const [isPreparing, setIsPreparing] = React.useState(false);
  const [isChecking, setIsChecking] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sessionError, setSessionError] = React.useState<string | null>(null);

  const resolved = resolveInstallCommand(toolId, plan);
  const effectiveInstallCommand = resolved.command;
  const shouldOfferHomebrewBootstrap = resolved.homebrewBootstrap;
  const installActionLabel = shouldOfferHomebrewBootstrap
    ? t('actions.installHomebrew')
    : t('actions.installTool', { toolName });

  const resetCommandTimer = React.useCallback(() => {
    if (commandStartTimerRef.current) {
      window.clearTimeout(commandStartTimerRef.current);
      commandStartTimerRef.current = null;
    }
  }, []);

  const resetTerminalState = React.useCallback(() => {
    resetCommandTimer();
    startedRef.current = false;
    terminalRef.current?.destroy();
    setSessionId(null);
    setSessionError(null);
  }, [resetCommandTimer]);

  const closeDialog = React.useCallback(() => {
    resetTerminalState();
    setPhase('guide');
    onOpenChange(false);
  }, [onOpenChange, resetTerminalState]);

  const loadInstallContext = React.useCallback(async () => {
    setIsPreparing(true);
    setPlanError(null);

    const [planResult, homeDirResult] = await Promise.allSettled([
      systemApi.getTmuxInstallPlan(),
      fsApi.getHomeDir(),
    ]);

    if (planResult.status === 'fulfilled') {
      setPlan(planResult.value);
    } else {
      setPlan(null);
      setPlanError(
        planResult.reason instanceof Error
          ? planResult.reason.message
          : t('errors.detectCommand'),
      );
    }

    if (homeDirResult.status === 'fulfilled') {
      setHomeDir(homeDirResult.value);
      setHomeDirError(null);
    } else {
      setHomeDir(null);
      setHomeDirError(
        homeDirResult.reason instanceof Error
          ? homeDirResult.reason.message
          : t('errors.resolveHomeDir'),
      );
    }

    setIsPreparing(false);
  }, [t]);

  React.useEffect(() => {
    if (!open) {
      resetTerminalState();
      setPhase('guide');
      setPlan(null);
      setPlanError(null);
      setHomeDir(null);
      setHomeDirError(null);
      setIsPreparing(false);
      setIsChecking(false);
      return;
    }

    void loadInstallContext();
  }, [open, loadInstallContext, resetTerminalState]);

  React.useEffect(() => {
    if (!open || phase !== 'terminal' || !effectiveInstallCommand || !homeDir) {
      setSessionId(null);
      return;
    }

    resetTerminalState();
    setSessionId(`${toolId}-install-${Date.now()}`);
  }, [effectiveInstallCommand, homeDir, open, phase, resetTerminalState, toolId]);

  const sendInstallCommand = React.useCallback(() => {
    if (startedRef.current || !effectiveInstallCommand) {
      return;
    }

    startedRef.current = true;
    resetCommandTimer();
    terminalRef.current?.sendText(`${effectiveInstallCommand}\r`);
  }, [effectiveInstallCommand, resetCommandTimer]);

  const queueInstallCommand = React.useCallback(
    (delayMs: number) => {
      if (startedRef.current || !effectiveInstallCommand) {
        return;
      }

      resetCommandTimer();
      commandStartTimerRef.current = window.setTimeout(() => {
        commandStartTimerRef.current = null;
        sendInstallCommand();
      }, delayMs);
    },
    [effectiveInstallCommand, resetCommandTimer, sendInstallCommand],
  );

  const handleCopyCommand = React.useCallback(async () => {
    if (!effectiveInstallCommand) {
      return;
    }

    try {
      await navigator.clipboard.writeText(effectiveInstallCommand);
      toastManager.add({
        title: t('toast.copySuccessTitle'),
        description: t('toast.copySuccessDescription'),
        type: 'success',
      });
    } catch {
      toastManager.add({
        title: t('toast.copyFailedTitle'),
        description: t('toast.copyFailedDescription'),
        type: 'error',
      });
    }
  }, [effectiveInstallCommand, t]);

  const handleCheckAgain = React.useCallback(async () => {
    setIsChecking(true);
    try {
      await loadInstallContext();
      const installed = await isToolInstalled(toolId);
      if (installed) {
        await Promise.resolve(onInstalled?.());
        closeDialog();
        return;
      }
      await Promise.resolve(onInstalled?.());
    } finally {
      setIsChecking(false);
    }
  }, [closeDialog, loadInstallContext, onInstalled, toolId]);

  const canAutoInstall = Boolean(effectiveInstallCommand && homeDir);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(720px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:w-[720px] sm:!max-w-[860px]"
      >
        <DialogHeader className="border-b border-border px-6 py-5 text-left">
          <div className="flex flex-wrap items-center gap-3 pr-12">
            <DialogTitle className="flex items-center gap-2 text-base">
              <SquareTerminal className="size-4.5 text-primary" />
              {t('title', { toolName })}
            </DialogTitle>
            {effectiveInstallCommand && phase === 'guide' && (
              <Button variant="outline" size="sm" onClick={() => void handleCopyCommand()} className="cursor-pointer">
                <Copy className="mr-1.5 size-3.5" />
                {t('actions.copyCommand')}
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 size-8 cursor-pointer opacity-70 hover:opacity-100"
            onClick={closeDialog}
          >
            <X className="size-4" />
            <span className="sr-only">{t('actions.close')}</span>
          </Button>
          <DialogDescription className="pr-12">
            {phase === 'guide'
              ? t('descriptionGuide', { toolName })
              : effectiveInstallCommand
                ? t('descriptionTerminalWithCommand', { command: effectiveInstallCommand })
                : t('descriptionTerminalFallback')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5">
          {phase === 'guide' ? (
            <>
              {isPreparing && !plan && !planError ? (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {t('detectingOptions')}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
                  <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{t('detectedHostTitle')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {plan
                        ? `${plan.platform}${plan.package_manager_label ? ` · ${plan.package_manager_label}` : ''}`
                        : t('detectedHostUnavailable')}
                    </p>
                    {effectiveInstallCommand ? (
                      <>
                        <p className="mt-3 text-xs text-muted-foreground">{t('recommendedCommandTitle')}</p>
                        <code className="mt-1 block overflow-x-auto rounded-lg bg-background px-3 py-2 text-xs text-foreground">
                          {effectiveInstallCommand}
                        </code>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t('recommendedCommandDescription')}
                          {resolved.requiresSudo ? ` ${t('recommendedCommandSudo')}` : ''}
                        </p>
                        {shouldOfferHomebrewBootstrap && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(HOMEBREW_INSTALL_URL, '_blank', 'noopener,noreferrer')}
                              className="cursor-pointer"
                            >
                              <ExternalLink className="mr-1.5 size-3.5" />
                              {t('actions.openBrew')}
                            </Button>
                            <p className="text-xs text-muted-foreground">
                              {t('homebrewFirst', { toolId })}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                        {resolved.reason || planError || t('noAutomaticCommand')}
                      </p>
                    )}
                    {homeDirError && <p className="mt-2 text-xs text-destructive">{homeDirError}</p>}
                    {planError && <p className="mt-2 text-xs text-destructive">{planError}</p>}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" onClick={closeDialog} className="cursor-pointer">
                  {t('actions.close')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleCheckAgain()}
                  disabled={isChecking}
                  className="cursor-pointer"
                >
                  {isChecking ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                  {t('actions.checkAgain')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => setPhase('terminal')}
                  disabled={!canAutoInstall}
                  className="cursor-pointer"
                >
                  <SquareTerminal className="mr-1.5 size-4" />
                  {installActionLabel}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{t('temporaryTerminalTitle')}</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {t('cwdLabel')}{' '}
                      <code className="rounded bg-background px-1 py-0.5">{homeDir || '~'}</code>
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {t('completeInShell')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      resetTerminalState();
                      setPhase('guide');
                    }}
                    className="shrink-0 cursor-pointer"
                  >
                    <X className="mr-1.5 size-3.5" />
                    {t('actions.back')}
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-background">
                <div className="flex h-10 items-center justify-between gap-3 border-b border-border px-4 text-xs text-muted-foreground">
                  <span className="truncate">{t('apiHostShell')}</span>
                  <span className="truncate text-right">{homeDir || '~'}</span>
                </div>
                <div className="min-h-0 h-full bg-background pb-2">
                  {sessionId && homeDir && (
                    <Terminal
                      ref={terminalRef}
                      sessionId={sessionId}
                      workspaceId="default"
                      projectName={t('systemProjectName')}
                      workspaceName={t('installWorkspaceName')}
                      terminalName={
                        shouldOfferHomebrewBootstrap ? 'homebrew-install' : `${toolId}-install`
                      }
                      noTmux={true}
                      cwd={homeDir}
                      onSessionReady={() => {
                        queueInstallCommand(1400);
                      }}
                      onData={() => {
                        if (!startedRef.current) {
                          queueInstallCommand(500);
                        }
                      }}
                      onSessionError={(_, error) => {
                        setSessionError(error);
                      }}
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{t('keepDialogOpen')}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleCheckAgain()}
                  disabled={isChecking}
                  className="cursor-pointer"
                >
                  {isChecking ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                  {t('actions.checkAgain')}
                </Button>
              </div>
            </>
          )}

          {sessionError && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {sessionError}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
