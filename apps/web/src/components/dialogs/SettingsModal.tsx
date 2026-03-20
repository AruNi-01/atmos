'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ScrollArea,
  cn,
  toastManager,
} from '@workspace/ui';
import { Check, ChevronDown, Download, ExternalLink, Info, RefreshCw, SquareTerminal } from 'lucide-react';
import { isTauriRuntime } from '@/lib/desktop-runtime';
import { AtmosWordmark } from '@/components/ui/AtmosWordmark';
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  getUpdateReleaseNotesUrl,
  type UpdateInfo,
  type UpdateStatus,
} from '@/hooks/use-updater';
import {
  useTerminalLinkSettings,
  type TerminalFileLinkOpenMode,
} from '@/hooks/use-terminal-link-settings';
import {
  QUICK_OPEN_APP_MAP,
  QUICK_OPEN_APP_OPTIONS,
  QuickOpenAppIcon,
} from '@/components/layout/quick-open-apps';

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
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Terminal preferences and link behavior',
    icon: SquareTerminal,
  },
] as const;

const TERMINAL_LINK_MODE_OPTIONS = [
  {
    value: 'atmos',
    label: 'Atmos',
    description: 'Open files in the built-in editor and reveal directories in Files.',
  },
  {
    value: 'finder',
    label: 'Finder',
    description: 'Open files and directories in Finder.',
  },
  {
    value: 'app',
    label: 'Quick Open App',
    description: 'Open terminal file links with a selected external app.',
  },
] as const;

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const installInFlightRef = React.useRef(false);
  const [status, setStatus] = useState<UpdateStatus>({ stage: 'idle' });
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const [activeSection, setActiveSection] = useState<(typeof SETTINGS_SECTIONS)[number]['id']>('about');
  const {
    fileLinkOpenMode,
    fileLinkOpenApp,
    loadSettings: loadTerminalLinkSettings,
    setFileLinkOpenMode,
    setFileLinkOpenApp,
  } = useTerminalLinkSettings();

  useEffect(() => {
    if (!isTauriRuntime()) return;
    import('@tauri-apps/api/app').then(({ getVersion }) =>
      getVersion().then(setAppVersion)
    ).catch(() => {});
  }, []);

  useEffect(() => {
    void loadTerminalLinkSettings();
  }, [loadTerminalLinkSettings]);

  const handleInstallUpdate = async (toastId?: string) => {
    if (installInFlightRef.current) {
      return;
    }
    installInFlightRef.current = true;

    if (toastId) {
      toastManager.update(toastId, {
        title: 'Preparing install…',
        description: 'Starting the updater.',
        type: 'loading',
        timeout: 0,
      });
    }

    await downloadAndInstallUpdate((nextStatus) => {
      setStatus(nextStatus);

      if (!toastId) {
        return;
      }

      if (nextStatus.stage === 'downloading') {
        toastManager.update(toastId, {
          title: 'Downloading update…',
          description: nextStatus.total
            ? `${Math.round((nextStatus.downloaded / nextStatus.total) * 100)}% downloaded`
            : 'Downloading the latest version…',
          type: 'loading',
          timeout: 0,
        });
        return;
      }

      if (nextStatus.stage === 'installing') {
        toastManager.update(toastId, {
          title: 'Installing update…',
          description: 'Atmos will restart when installation finishes.',
          type: 'loading',
          timeout: 0,
        });
        return;
      }

      if (nextStatus.stage === 'upToDate') {
        installInFlightRef.current = false;
        toastManager.update(toastId, {
          title: 'Already up to date',
          description: 'No installable update is available.',
          type: 'info',
          timeout: 4000,
        });
        return;
      }

      if (nextStatus.stage === 'done') {
        installInFlightRef.current = false;
        toastManager.update(toastId, {
          title: 'Restarting Atmos…',
          description: 'The update has been installed.',
          type: 'success',
          timeout: 2500,
        });
        return;
      }

      if (nextStatus.stage === 'error') {
        installInFlightRef.current = false;
        toastManager.update(toastId, {
          title: 'Update install failed',
          description: nextStatus.message,
          type: 'error',
          timeout: 6000,
        });
      }
    });
  };

  const handleCheckForUpdate = async () => {
    let latestStage = 'idle';
    let latestErrorMessage: string | undefined;
    const toastId = toastManager.add({
      title: 'Checking for updates…',
      description: 'Querying the desktop updater.',
      type: 'loading',
      timeout: 0,
    });

    const info = await checkForUpdate((nextStatus) => {
      latestStage = nextStatus.stage;
      latestErrorMessage = nextStatus.stage === 'error' ? nextStatus.message : undefined;
      setStatus(nextStatus);
    });
    setUpdateInfo(info);

    if (latestStage === 'error') {
      toastManager.update(toastId, {
        title: 'Update check failed',
        description: latestErrorMessage ?? 'Unable to check for updates.',
        type: 'error',
        timeout: 6000,
      });
      return;
    }

    if (latestStage === 'available' && info) {
      toastManager.update(toastId, {
        title: `Version ${info.version} is available`,
        description: (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              A newer desktop version is ready to install.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <a
                  href={getUpdateReleaseNotesUrl(info)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-1.5 size-3.5" />
                  What&apos;s New
                </a>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  void handleInstallUpdate(toastId);
                }}
              >
                <Download className="mr-1.5 size-3.5" />
                Install
              </Button>
            </div>
          </div>
        ),
        type: 'info',
        timeout: 0,
      });
      return;
    }

    toastManager.update(toastId, {
      title: 'Already up to date',
      description: 'You are already on the latest available version.',
      type: 'success',
      timeout: 4000,
    });
  };

  const isChecking = status.stage === 'checking';
  const isDownloading = status.stage === 'downloading';
  const isInstalling = status.stage === 'installing';
  const activeSectionMeta = SETTINGS_SECTIONS.find((section) => section.id === activeSection) ?? SETTINGS_SECTIONS[0];
  const activeTerminalLinkMode =
    TERMINAL_LINK_MODE_OPTIONS.find((option) => option.value === fileLinkOpenMode) ?? TERMINAL_LINK_MODE_OPTIONS[0];
  const activeQuickOpenApp = QUICK_OPEN_APP_MAP[fileLinkOpenApp];

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

            <ScrollArea className="h-full min-h-0 flex-1">
              <div className="px-8 py-6">
                {activeSection === 'about' ? (
                  <>
                    <div className="mb-10 mt-4">
                      <AtmosWordmark className="w-full" />
                    </div>
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
                            <Button
                              variant="outline"
                              onClick={handleCheckForUpdate}
                              disabled={isChecking || isDownloading || isInstalling}
                              className="cursor-pointer"
                            >
                              <RefreshCw className="mr-2 size-4" />
                              Check for Updates
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-border">
                    <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-b border-border px-6 py-5">
                      <div>
                        <p className="text-base font-medium text-foreground">File link open mode</p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          Choose how terminal file and directory links should open when clicked.
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-3">
                        {fileLinkOpenMode === 'app' && activeQuickOpenApp && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" className="min-w-44 justify-between">
                                <span className="flex min-w-0 items-center gap-2">
                                  <QuickOpenAppIcon
                                    iconName={activeQuickOpenApp.iconName}
                                    themed={activeQuickOpenApp.themed}
                                    className="size-4 shrink-0"
                                  />
                                  <span className="truncate">{activeQuickOpenApp.label}</span>
                                </span>
                                <ChevronDown className="ml-2 size-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-72">
                              {QUICK_OPEN_APP_OPTIONS.map((app) => (
                                <DropdownMenuItem
                                  key={app.name}
                                  className="cursor-pointer"
                                  onClick={() => void setFileLinkOpenApp(app.name)}
                                >
                                  <QuickOpenAppIcon
                                    iconName={app.iconName}
                                    themed={app.themed}
                                    className="mr-2 size-4"
                                  />
                                  <span className="flex-1">{app.label}</span>
                                  {fileLinkOpenApp === app.name && <Check className="size-4" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="min-w-48 justify-between">
                              <span>{activeTerminalLinkMode.label}</span>
                              <ChevronDown className="ml-2 size-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-80">
                            {TERMINAL_LINK_MODE_OPTIONS.map((option) => (
                              <DropdownMenuItem
                                key={option.value}
                                className="cursor-pointer items-start"
                                onClick={() => void setFileLinkOpenMode(option.value as TerminalFileLinkOpenMode)}
                              >
                                <div className="flex-1 pr-3">
                                  <p className="text-sm font-medium text-foreground">{option.label}</p>
                                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                    {option.description}
                                  </p>
                                </div>
                                {fileLinkOpenMode === option.value && <Check className="mt-0.5 size-4 shrink-0" />}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
