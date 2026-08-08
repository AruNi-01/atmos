'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  Popover,
  PopoverContent,
  PopoverTrigger,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  toastManager,
} from '@workspace/ui';
import { AlertTriangle, ChevronDown, Copy, ExternalLink, Loader2, SquareTerminal, X } from 'lucide-react';
import { fsApi } from '@/api/ws-api';
import { systemApi, type TmuxInstallPlanResponse } from '@/api/rest-api';
import { Terminal, type TerminalRef } from '@/features/terminal/components/Terminal';

interface TmuxInstallDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void | Promise<void>;
  onInstalled?: () => void | Promise<void>;
}

type InstallPhase = 'guide' | 'terminal';
type CloseConfirmSource = 'close' | 'continue' | null;

const HOMEBREW_INSTALL_URL = 'https://brew.sh';
const HOMEBREW_INSTALL_COMMAND = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';

export const TmuxInstallDialog: React.FC<TmuxInstallDialogProps> = ({
  isOpen,
  onClose,
  onRetry,
  onInstalled,
}) => {
  const t = useTranslations('Terminal.chrome');
  const terminalRef = React.useRef<TerminalRef | null>(null);
  const startedRef = React.useRef(false);
  const commandStartTimerRef = React.useRef<number | null>(null);

  const [phase, setPhase] = React.useState<InstallPhase>('guide');
  const [plan, setPlan] = React.useState<TmuxInstallPlanResponse | null>(null);
  const [planError, setPlanError] = React.useState<string | null>(null);
  const [homeDir, setHomeDir] = React.useState<string | null>(null);
  const [homeDirError, setHomeDirError] = React.useState<string | null>(null);
  const [isPreparing, setIsPreparing] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sessionError, setSessionError] = React.useState<string | null>(null);
  const [closeConfirmSource, setCloseConfirmSource] = React.useState<CloseConfirmSource>(null);

  const installCommand = plan?.command ?? null;
  const shouldOfferHomebrewBootstrap = plan?.platform === 'macOS' && !plan?.supported && !installCommand;
  const effectiveInstallCommand = shouldOfferHomebrewBootstrap ? HOMEBREW_INSTALL_COMMAND : installCommand;
  const installActionLabel = shouldOfferHomebrewBootstrap ? t('tmuxInstall.actions.installHomebrew') : t('tmuxInstall.actions.installTmux');

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

  const handleCloseTerminalView = React.useCallback(() => {
    resetTerminalState();
    setPhase('guide');
  }, [resetTerminalState]);

  const closeDialog = React.useCallback(() => {
    resetTerminalState();
    setPhase('guide');
    setCloseConfirmSource(null);
    onClose();
  }, [onClose, resetTerminalState, setCloseConfirmSource]);

  const loadInstallContext = React.useCallback(async () => {
    setIsPreparing(true);
    setPlanError(null);

    const [planResult, homeDirResult] = await Promise.allSettled([
      systemApi.getTmuxInstallPlan(),
      fsApi.getHomeDir(),
    ]);

    if (planResult.status === 'fulfilled') {
      setPlan(planResult.value);
      if (planResult.value.installed) {
        await Promise.resolve(onInstalled?.());
      }
    } else {
      setPlan(null);
      setPlanError(planResult.reason instanceof Error ? planResult.reason.message : t('tmuxInstall.errors.detectCommand'));
    }

    if (homeDirResult.status === 'fulfilled') {
      setHomeDir(homeDirResult.value);
      setHomeDirError(null);
    } else {
      setHomeDir(null);
      setHomeDirError(homeDirResult.reason instanceof Error ? homeDirResult.reason.message : t('tmuxInstall.errors.resolveHomeDir'));
    }

    setIsPreparing(false);
  }, [onInstalled, t]);

  React.useEffect(() => {
    if (!isOpen) {
      resetTerminalState();
      setPhase('guide');
      setPlan(null);
      setPlanError(null);
      setHomeDir(null);
      setHomeDirError(null);
      setIsPreparing(false);
      setCloseConfirmSource(null);
      return;
    }

    void loadInstallContext();
  }, [isOpen, loadInstallContext, resetTerminalState, setCloseConfirmSource]);

  React.useEffect(() => {
    if (!isOpen || phase !== 'terminal' || !effectiveInstallCommand || !homeDir) {
      setSessionId(null);
      return;
    }

    resetTerminalState();
    setSessionId(`tmux-install-${Date.now()}`);
  }, [effectiveInstallCommand, homeDir, isOpen, phase, resetTerminalState]);

  const sendInstallCommand = React.useCallback(() => {
    if (startedRef.current || !effectiveInstallCommand) {
      return;
    }

    startedRef.current = true;
    resetCommandTimer();
    terminalRef.current?.sendText(`${effectiveInstallCommand}\r`);
  }, [effectiveInstallCommand, resetCommandTimer]);

  const queueInstallCommand = React.useCallback((delayMs: number) => {
    if (startedRef.current || !effectiveInstallCommand) {
      return;
    }

    resetCommandTimer();
    commandStartTimerRef.current = window.setTimeout(() => {
      commandStartTimerRef.current = null;
      sendInstallCommand();
    }, delayMs);
  }, [effectiveInstallCommand, resetCommandTimer, sendInstallCommand]);

  const handleCopyCommand = React.useCallback(async () => {
    if (!effectiveInstallCommand) {
      return;
    }

    try {
      await navigator.clipboard.writeText(effectiveInstallCommand);
      toastManager.add({
        title: t('tmuxInstall.toast.copySuccessTitle'),
        description: t('tmuxInstall.toast.copySuccessDescription', { action: installActionLabel }),
        type: 'success',
      });
    } catch {
      toastManager.add({
        title: t('tmuxInstall.toast.copyFailedTitle'),
        description: t('tmuxInstall.toast.copyFailedDescription'),
        type: 'error',
      });
    }
  }, [effectiveInstallCommand, installActionLabel, t]);

  const handleRetry = React.useCallback(async () => {
    await Promise.allSettled([Promise.resolve(onRetry()), loadInstallContext()]);
  }, [loadInstallContext, onRetry]);

  const warningTitle = t('tmuxInstall.warning.title');
  const warningDescription = t('tmuxInstall.warning.description');

  const canAutoInstall = !!effectiveInstallCommand && !!homeDir;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => {
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
        }}
        className="flex h-[min(760px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:w-[760px] sm:!max-w-[900px]"
      >
        <DialogHeader className="border-b border-border px-6 py-5 text-left">
          <div className="flex flex-wrap items-center gap-3 pr-12">
            <DialogTitle className="flex items-center gap-2 text-base">
              <SquareTerminal className="size-4.5 text-primary" />
              {t('tmuxInstall.title')}
            </DialogTitle>
            {effectiveInstallCommand && phase === 'guide' && (
              <Button variant="outline" size="sm" onClick={handleCopyCommand} className="cursor-pointer">
                <Copy className="mr-1.5 size-3.5" />
                {t('tmuxInstall.actions.copyCommand')}
              </Button>
            )}
          </div>
          <Popover open={closeConfirmSource === 'close'} onOpenChange={(open) => setCloseConfirmSource(open ? 'close' : null)}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 size-8 cursor-pointer opacity-70 hover:opacity-100"
                onClick={() => setCloseConfirmSource('close')}
              >
                <X className="size-4" />
                <span className="sr-only">{t('common.close')}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-5 text-amber-500" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{warningTitle}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{warningDescription}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setCloseConfirmSource(null)} className="cursor-pointer">
                  {t('tmuxInstall.actions.keepPrompt')}
                </Button>
                <Button size="sm" variant="destructive" onClick={closeDialog} className="cursor-pointer">
                  {t('tmuxInstall.actions.continueAnyway')}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <DialogDescription className="pr-12">
            {phase === 'guide'
              ? t('tmuxInstall.descriptionGuide')
              : effectiveInstallCommand
                ? t('tmuxInstall.descriptionTerminalWithCommand', { command: effectiveInstallCommand })
                : t('tmuxInstall.descriptionTerminalFallback')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5">
          {phase === 'guide' ? (
            <>
              {isPreparing && !plan && !planError ? (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {t('tmuxInstall.detectingOptions')}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
                  <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{t('tmuxInstall.detectedHostTitle')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {plan ? `${plan.platform}${plan.package_manager_label ? ` · ${plan.package_manager_label}` : ''}` : t('tmuxInstall.detectedHostUnavailable')}
                    </p>
                    {effectiveInstallCommand ? (
                      <>
                        <p className="mt-3 text-xs text-muted-foreground">{t('tmuxInstall.recommendedCommandTitle')}</p>
                        <code className="mt-1 block overflow-x-auto rounded-lg bg-background px-3 py-2 text-xs text-foreground">
                          {effectiveInstallCommand}
                        </code>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t('tmuxInstall.recommendedCommandDescription')}
                          {plan?.requires_sudo ? ` ${t('tmuxInstall.recommendedCommandSudo')}` : ''}
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
                              {t('tmuxInstall.actions.openBrew')}
                            </Button>
                            <p className="text-xs text-muted-foreground">
                              {t('tmuxInstall.homebrewFirstPrefix')}{' '}
                              <span className="font-medium">{t('tmuxInstall.actions.checkAgain')}</span>{' '}
                              {t('tmuxInstall.homebrewFirstMiddle')}{' '}
                              <code className="rounded bg-background px-1 py-0.5">brew install tmux</code>.
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                        {plan?.reason || planError || t('tmuxInstall.noAutomaticCommand')}
                      </p>
                    )}
                    {homeDirError && (
                      <p className="mt-2 text-xs text-destructive">{homeDirError}</p>
                    )}
                    {planError && (
                      <p className="mt-2 text-xs text-destructive">{planError}</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-border bg-background p-4">
                    <p className="text-sm font-medium text-foreground">{t('tmuxInstall.manualCommandsTitle')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('tmuxInstall.manualCommandsDescriptionPrefix')}{' '}
                      <span className="font-medium">{t('tmuxInstall.actions.checkAgain')}</span>{' '}
                      {t('tmuxInstall.manualCommandsDescriptionSuffix')}
                    </p>

                    <div className="mt-4 space-y-2">
                      <div className="rounded-md bg-muted p-3">
                        <p className="mb-1 text-xs text-muted-foreground">{t('tmuxInstall.platforms.macosHomebrew')}</p>
                        <code className="text-sm font-mono">brew install tmux</code>
                      </div>

                      <div className="rounded-md bg-muted p-3">
                        <p className="mb-1 text-xs text-muted-foreground">{t('tmuxInstall.platforms.ubuntuDebian')}</p>
                        <code className="text-sm font-mono">sudo apt-get update && sudo apt-get install -y tmux</code>
                      </div>

                      <Collapsible defaultOpen={false}>
                        <CollapsibleTrigger className="group flex w-full items-center gap-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground">
                          <ChevronDown className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                          <span>{t('tmuxInstall.morePlatforms')}</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                          <div className="flex flex-col gap-2">
                            <div className="rounded-md bg-muted p-3">
                              <p className="mb-1 text-xs text-muted-foreground">{t('tmuxInstall.platforms.fedoraRhel')}</p>
                              <code className="text-sm font-mono">sudo dnf install -y tmux</code>
                            </div>
                            <div className="rounded-md bg-muted p-3">
                              <p className="mb-1 text-xs text-muted-foreground">{t('tmuxInstall.platforms.archLinux')}</p>
                              <code className="text-sm font-mono">sudo pacman -S --noconfirm tmux</code>
                            </div>
                            <div className="rounded-md bg-muted p-3">
                              <p className="mb-1 text-xs text-muted-foreground">{t('tmuxInstall.platforms.windowsWsl')}</p>
                              <code className="text-sm font-mono">sudo apt-get install -y tmux</code>
                              <p className="mt-1 text-[11px] text-muted-foreground">{t('tmuxInstall.windowsWslDescription')}</p>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Popover open={closeConfirmSource === 'continue'} onOpenChange={(open) => setCloseConfirmSource(open ? 'continue' : null)}>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" onClick={() => setCloseConfirmSource('continue')} className="cursor-pointer">
                      {t('tmuxInstall.actions.continueWithoutTmux')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="mt-0.5 size-5 text-amber-500" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">{warningTitle}</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">{warningDescription}</p>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setCloseConfirmSource(null)} className="cursor-pointer">
                        {t('tmuxInstall.actions.keepPrompt')}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={closeDialog} className="cursor-pointer">
                        {t('tmuxInstall.actions.continueAnyway')}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button size="sm" variant="outline" onClick={() => void handleRetry()} className="cursor-pointer">
                  {t('tmuxInstall.actions.checkAgain')}
                </Button>
                <Button size="sm" onClick={() => setPhase('terminal')} disabled={!canAutoInstall} className="cursor-pointer">
                  <SquareTerminal className="mr-1.5 size-4" />
                  {installActionLabel}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="shrink-0 rounded-xl border border-border bg-muted/20 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{t('tmuxInstall.temporaryTerminalTitle')}</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {t('tmuxInstall.cwdLabel')} <code className="rounded bg-background px-1 py-0.5">{homeDir || '~'}</code>
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {t('tmuxInstall.completeInShellPrefix')}{' '}
                      <span className="font-medium">{t('tmuxInstall.actions.checkAgain')}</span>{' '}
                      {t('tmuxInstall.completeInShellSuffix')}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCloseTerminalView} className="shrink-0 cursor-pointer">
                    <X className="mr-1.5 size-3.5" />
                    {t('common.back')}
                  </Button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background">
                <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-4 text-xs text-muted-foreground">
                  <span className="truncate">{t('tmuxInstall.apiHostShell')}</span>
                  <span className="truncate text-right">{homeDir || '~'}</span>
                </div>
                <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
                  {sessionId && homeDir && (
                    <div className="absolute inset-0">
                      <Terminal
                        ref={terminalRef}
                        sessionId={sessionId}
                        workspaceId="default"
                        projectName={t('tmuxInstall.systemProjectName')}
                        workspaceName={t('tmuxInstall.installWorkspaceName')}
                        terminalName={shouldOfferHomebrewBootstrap ? 'homebrew-install' : 'tmux-install'}
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
                    </div>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {t('tmuxInstall.keepDialogOpen')}
                </p>
                <Button size="sm" variant="outline" onClick={() => void handleRetry()} className="cursor-pointer">
                  {t('tmuxInstall.actions.checkAgain')}
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
};
