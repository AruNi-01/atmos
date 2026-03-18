'use client';

import React, { useState, useEffect } from 'react';
import { GeistPixelCircle } from 'geist/font/pixel';
import { Dialog, DialogContent, DialogTitle, DialogDescription, Button, cn } from '@workspace/ui';
import LogoSvg from '@workspace/ui/components/logo-svg';
import { RefreshCw, Check, Download } from 'lucide-react';
import { isTauriRuntime } from '@/lib/desktop-runtime';
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  type UpdateInfo,
  type UpdateStatus,
} from '@/hooks/use-updater';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<UpdateStatus>({ stage: 'idle' });
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    if (!isTauriRuntime()) return;
    import('@tauri-apps/api/app').then(({ getVersion }) =>
      getVersion().then(setAppVersion)
    ).catch(() => {});
  }, []);

  const handleCheckForUpdate = async () => {
    const info = await checkForUpdate(setStatus);
    setUpdateInfo(info);
  };

  const handleInstallUpdate = async () => {
    await downloadAndInstallUpdate(setStatus);
  };

  const isChecking = status.stage === 'checking';
  const isUpToDate = status.stage === 'upToDate';
  const isAvailable = status.stage === 'available';
  const isDownloading = status.stage === 'downloading';
  const isInstalling = status.stage === 'installing';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex flex-col items-center pt-8 pb-2">
          {/* Logo — same style as WelcomePage, scaled down */}
          <div className={`flex w-full max-w-xs items-center justify-between group cursor-default select-none ${GeistPixelCircle.className}`}>
            <span className="text-[4rem] font-normal uppercase leading-[0.75] tracking-normal text-foreground drop-shadow-sm">
              A
            </span>
            <span className="text-[4rem] font-normal uppercase leading-[0.75] tracking-normal text-foreground drop-shadow-sm">
              t
            </span>
            <span className="text-[4rem] font-normal uppercase leading-[0.75] tracking-normal text-foreground drop-shadow-sm">
              m
            </span>
            <LogoSvg className="size-14 shrink-0 transition-transform duration-1000 group-hover:rotate-90 text-foreground drop-shadow-sm" />
            <span className="text-[4rem] font-normal uppercase leading-[0.75] tracking-normal text-foreground drop-shadow-sm">
              s
            </span>
          </div>

          <p className="mt-4 text-sm text-muted-foreground font-medium tracking-wide">
            Atmosphere for Agentic Builders
          </p>

          {isTauriRuntime() && (
            <div className="mt-6 flex flex-col items-center gap-3">
              <Button
                variant="outline"
                onClick={handleCheckForUpdate}
                disabled={isChecking || isDownloading || isInstalling}
                className="cursor-pointer"
              >
                <RefreshCw className={cn('mr-2 size-4', isChecking && 'animate-spin')} />
                {isChecking ? 'Checking…' : 'Check for Updates'}
              </Button>

              {isUpToDate && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Check className="size-4 text-green-500" />
                  Up to date
                </p>
              )}

              {status.stage === 'error' && (
                <p className="text-sm text-destructive">{status.message}</p>
              )}

              {isAvailable && updateInfo && (
                <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-muted/50 px-4 py-3">
                  <p className="text-sm">
                    Version <span className="font-semibold">{updateInfo.version}</span> is
                    available
                  </p>
                  <Button
                    onClick={handleInstallUpdate}
                    disabled={isDownloading || isInstalling}
                    className="cursor-pointer"
                  >
                    <Download className="mr-2 size-4" />
                    Update Now
                  </Button>
                </div>
              )}

              {(isDownloading || isInstalling) && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <RefreshCw className="size-4 animate-spin" />
                  {isInstalling ? 'Installing…' : 'Downloading…'}
                </p>
              )}

              <p className="mt-3 text-xs text-muted-foreground">Version {appVersion}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
