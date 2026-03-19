'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  cn,
} from '@workspace/ui';
import { Check, Download, Info, RefreshCw } from 'lucide-react';
import { isTauriRuntime } from '@/lib/desktop-runtime';
import { AtmosWordmark } from '@/components/ui/AtmosWordmark';
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

const SETTINGS_SECTIONS = [
  {
    id: 'about',
    label: 'About',
    description: 'Product overview and desktop updates',
    icon: Info,
  },
] as const;

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<UpdateStatus>({ stage: 'idle' });
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const [activeSection, setActiveSection] = useState<(typeof SETTINGS_SECTIONS)[number]['id']>('about');
  const [updatePopoverOpen, setUpdatePopoverOpen] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    import('@tauri-apps/api/app').then(({ getVersion }) =>
      getVersion().then(setAppVersion)
    ).catch(() => {});
  }, []);

  const handleCheckForUpdate = async () => {
    const info = await checkForUpdate(setStatus);
    setUpdateInfo(info);
    setUpdatePopoverOpen(true);
  };

  const handleInstallUpdate = async () => {
    setUpdatePopoverOpen(true);
    await downloadAndInstallUpdate(setStatus);
  };

  const isChecking = status.stage === 'checking';
  const isUpToDate = status.stage === 'upToDate';
  const isAvailable = status.stage === 'available';
  const isDownloading = status.stage === 'downloading';
  const isInstalling = status.stage === 'installing';
  const activeSectionMeta = SETTINGS_SECTIONS.find((section) => section.id === activeSection) ?? SETTINGS_SECTIONS[0];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-[min(90vh,820px)] w-[min(96vw,1360px)] max-w-[min(96vw,1360px)] overflow-hidden border-border bg-background p-0 sm:!max-w-[min(96vw,1360px)]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Manage ATMOS settings, product information, and desktop updates.
        </DialogDescription>

        <div className="grid h-full grid-cols-[240px_minmax(0,1fr)]">
          <aside className="flex h-full flex-col border-r border-border bg-muted/20">
            <div className="border-b border-border px-5 py-5">
              <p className="text-[12px] font-semibold text-muted-foreground">
                Settings
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Setting atmos to personalize your experience.
              </p>
            </div>

            <nav className="flex flex-1 flex-col gap-1 p-3">
              {SETTINGS_SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                      isActive
                        ? 'border-border bg-background text-foreground shadow-sm'
                        : 'border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground'
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="min-w-0 truncate text-sm font-medium">{section.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden">
            <div className="px-8 py-4">
              <h2 className="text-[28px] font-semibold tracking-tight text-foreground">
                {activeSectionMeta.label}
              </h2>
              <p className="mt-1 max-w-md text-sm leading-5 text-muted-foreground">
                {activeSectionMeta.description}
              </p>
            </div>
            <div className="px-8">
              <div className="border-b border-border" />
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="px-8 py-6 mt-10">
                <AtmosWordmark className="mb-20 w-full" />

                <div className="overflow-hidden rounded-2xl border border-border">
                  <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-b border-border px-6 py-5">
                    <div>
                      <p className="text-base font-medium text-foreground">Runtime</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Current environment that is rendering this settings panel.
                      </p>
                    </div>
                    <div className="flex items-center text-sm font-medium text-foreground">
                      {isTauriRuntime() ? 'Desktop' : 'Web'}
                    </div>
                  </div>

                  <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-b border-border px-6 py-5">
                    <div>
                      <p className="text-base font-medium text-foreground">Version</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Current app version reported by the desktop runtime.
                      </p>
                    </div>
                    <div className="flex items-center text-sm font-medium text-foreground">
                      {appVersion || 'Unavailable'}
                    </div>
                  </div>

                  {isTauriRuntime() && (
                    <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
                      <div>
                        <p className="text-base font-medium text-foreground">Check for updates</p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          Query the desktop updater for the latest available release.
                        </p>
                      </div>
                      <div className="flex items-center">
                        <Popover open={updatePopoverOpen} onOpenChange={setUpdatePopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              onClick={handleCheckForUpdate}
                              disabled={isChecking || isDownloading || isInstalling}
                              className="cursor-pointer"
                            >
                              <RefreshCw className={cn('mr-2 size-4', (isChecking || isDownloading || isInstalling) && 'animate-spin')} />
                              {isChecking ? 'Checking…' : 'Check for Updates'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" side="top" sideOffset={10} className="w-80">
                            <div className="space-y-3 text-sm">
                              {isChecking && (
                                <p className="flex items-center gap-1.5 text-muted-foreground">
                                  <RefreshCw className="size-4 animate-spin" />
                                  Checking for updates…
                                </p>
                              )}

                              {isUpToDate && (
                                <p className="flex items-center gap-1.5 text-muted-foreground">
                                  <Check className="size-4 text-green-500" />
                                  Up to date
                                </p>
                              )}

                              {status.stage === 'error' && (
                                <p className="text-destructive">{status.message}</p>
                              )}

                              {isAvailable && updateInfo && (
                                <div className="space-y-3">
                                  <p className="text-foreground">
                                    Version <span className="font-semibold">{updateInfo.version}</span> is available
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
                                <p className="flex items-center gap-1.5 text-muted-foreground">
                                  <RefreshCw className="size-4 animate-spin" />
                                  {isInstalling ? 'Installing…' : 'Downloading…'}
                                </p>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
