'use client';

import React from 'react';
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
import { Terminal, type TerminalRef } from '@/components/terminal/Terminal';

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
  const installActionLabel = shouldOfferHomebrewBootstrap ? 'Install Homebrew' : 'Install tmux';

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
      setPlanError(planResult.reason instanceof Error ? planResult.reason.message : 'Failed to detect tmux install command');
    }

    if (homeDirResult.status === 'fulfilled') {
      setHomeDir(homeDirResult.value);
      setHomeDirError(null);
    } else {
      setHomeDir(null);
      setHomeDirError(homeDirResult.reason instanceof Error ? homeDirResult.reason.message : 'Failed to resolve the API host home directory');
    }

    setIsPreparing(false);
  }, [onInstalled]);

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
        title: 'Command copied',
        description: `${installActionLabel} command copied to clipboard.`,
        type: 'success',
      });
    } catch {
      toastManager.add({
        title: 'Copy failed',
        description: 'Clipboard is not available.',
        type: 'error',
      });
    }
  }, [effectiveInstallCommand, installActionLabel]);

  const handleRetry = React.useCallback(async () => {
    await Promise.allSettled([Promise.resolve(onRetry()), loadInstallContext()]);
  }, [loadInstallContext, onRetry]);

  const warningTitle = 'Continue without tmux?';
  const warningDescription = 'Without tmux, terminal sessions may lose persistence and reconnection support, which can cause serious issues during terminal usage.';

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
              Install tmux
            </DialogTitle>
            {effectiveInstallCommand && phase === 'guide' && (
              <Button variant="outline" size="sm" onClick={handleCopyCommand} className="cursor-pointer">
                <Copy className="mr-1.5 size-3.5" />
                Copy Command
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
                <span className="sr-only">Close</span>
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
                  Keep tmux prompt
                </Button>
                <Button size="sm" variant="destructive" onClick={closeDialog} className="cursor-pointer">
                  Continue anyway
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <DialogDescription className="pr-12">
            {phase === 'guide'
              ? 'Terminal persistence requires tmux on the API host. Atmos can detect the package manager and open a temporary shell to install it for you.'
              : `A temporary shell on the API host is running ${effectiveInstallCommand ? `\`${effectiveInstallCommand}\`` : 'the install command'}. Complete any prompts there, including sudo if needed.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5">
          {phase === 'guide' ? (
            <>
              {isPreparing && !plan && !planError ? (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Detecting install options...
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
                  <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">Detected API host</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {plan ? `${plan.platform}${plan.package_manager_label ? ` · ${plan.package_manager_label}` : ''}` : 'Unable to detect host package manager'}
                    </p>
                    {effectiveInstallCommand ? (
                      <>
                        <p className="mt-3 text-xs text-muted-foreground">Recommended install command</p>
                        <code className="mt-1 block overflow-x-auto rounded-lg bg-background px-3 py-2 text-xs text-foreground">
                          {effectiveInstallCommand}
                        </code>
                        <p className="mt-2 text-xs text-muted-foreground">
                          This runs on the same machine that hosts the Atmos API.
                          {plan?.requires_sudo ? ' The terminal may prompt for your sudo password.' : ''}
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
                              Open brew.sh
                            </Button>
                            <p className="text-xs text-muted-foreground">
                              Install Homebrew first, then click <span className="font-medium">Check Again</span> and Atmos will offer <code className="rounded bg-background px-1 py-0.5">brew install tmux</code>.
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                        {plan?.reason || planError || 'Atmos could not detect an automatic install command for this host.'}
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
                    <p className="text-sm font-medium text-foreground">Manual install commands</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      You can still install tmux yourself and click <span className="font-medium">Check Again</span> afterwards.
                    </p>

                    <div className="mt-4 space-y-2">
                      <div className="rounded-md bg-muted p-3">
                        <p className="mb-1 text-xs text-muted-foreground">macOS (Homebrew)</p>
                        <code className="text-sm font-mono">brew install tmux</code>
                      </div>

                      <div className="rounded-md bg-muted p-3">
                        <p className="mb-1 text-xs text-muted-foreground">Ubuntu/Debian</p>
                        <code className="text-sm font-mono">sudo apt-get update && sudo apt-get install -y tmux</code>
                      </div>

                      <Collapsible defaultOpen={false}>
                        <CollapsibleTrigger className="group flex w-full items-center gap-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground">
                          <ChevronDown className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                          <span>More platforms</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                          <div className="flex flex-col gap-2">
                            <div className="rounded-md bg-muted p-3">
                              <p className="mb-1 text-xs text-muted-foreground">Fedora/RHEL</p>
                              <code className="text-sm font-mono">sudo dnf install -y tmux</code>
                            </div>
                            <div className="rounded-md bg-muted p-3">
                              <p className="mb-1 text-xs text-muted-foreground">Arch Linux</p>
                              <code className="text-sm font-mono">sudo pacman -S --noconfirm tmux</code>
                            </div>
                            <div className="rounded-md bg-muted p-3">
                              <p className="mb-1 text-xs text-muted-foreground">Windows (WSL, recommended)</p>
                              <code className="text-sm font-mono">sudo apt-get install -y tmux</code>
                              <p className="mt-1 text-[11px] text-muted-foreground">Run the Atmos API inside WSL so the backend can use tmux.</p>
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
                      Continue Without tmux
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
                        Keep tmux prompt
                      </Button>
                      <Button size="sm" variant="destructive" onClick={closeDialog} className="cursor-pointer">
                        Continue anyway
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button size="sm" variant="outline" onClick={() => void handleRetry()} className="cursor-pointer">
                  Check Again
                </Button>
                <Button size="sm" onClick={() => setPhase('terminal')} disabled={!canAutoInstall} className="cursor-pointer">
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
                    <p className="text-sm font-medium text-foreground">Temporary install terminal</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      CWD: <code className="rounded bg-background px-1 py-0.5">{homeDir || '~'}</code>
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      Complete the installation in this shell, then click <span className="font-medium">Check Again</span> yourself.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCloseTerminalView} className="shrink-0 cursor-pointer">
                    <X className="mr-1.5 size-3.5" />
                    Back
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-background">
                <div className="flex h-10 items-center justify-between gap-3 border-b border-border px-4 text-xs text-muted-foreground">
                  <span className="truncate">API host shell</span>
                  <span className="truncate text-right">{homeDir || '~'}</span>
                </div>
                <div className="min-h-0 h-full bg-background pb-2">
                  {sessionId && homeDir && (
                    <Terminal
                      ref={terminalRef}
                      sessionId={sessionId}
                      workspaceId="default"
                      projectName="System"
                      workspaceName="Install"
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
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Keep this dialog open until tmux is detected.
                </p>
                <Button size="sm" variant="outline" onClick={() => void handleRetry()} className="cursor-pointer">
                  Check Again
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
