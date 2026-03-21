'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  cn,
  toastManager,
} from '@workspace/ui';
import { BrainCircuit, Check, ChevronDown, Download, ExternalLink, Info, Languages, RefreshCw, SlidersHorizontal, SquareTerminal } from 'lucide-react';
import { isTauriRuntime } from '@/lib/desktop-runtime';
import { AtmosWordmark } from '@/components/ui/AtmosWordmark';
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  getUpdateReleaseNotesUrl,
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
import { llmProvidersApi, type LlmProvidersFile, type SessionTitleFormatConfig } from '@/api/ws-api';
import { LlmProviderEditorDialog } from '@/components/layout/LlmProvidersModal';
import { WIKI_LANGUAGE_OPTIONS } from '@/components/wiki/wiki-languages';
import { useWebSocketStore } from '@/hooks/use-websocket';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSectionOverride?: SettingsSectionId | null;
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
  {
    id: 'ai',
    label: 'AI & Provider',
    description: 'Providers and lightweight task routing',
    icon: BrainCircuit,
  },
] as const;

type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

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

const FEATURE_LANGUAGE_OPTIONS = WIKI_LANGUAGE_OPTIONS.filter(
  (option) => option.value !== 'other',
);

function fallbackProviderLabel(providerId: string): string {
  return providerId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeSessionTitleFormat(
  value?: SessionTitleFormatConfig | null,
): SessionTitleFormatConfig {
  return {
    include_agent_name: !!value?.include_agent_name,
    include_project_name: !!value?.include_project_name,
    include_intent_emoji: !!value?.include_intent_emoji,
  };
}

function sessionTitleFormatPreview(format: SessionTitleFormatConfig): string {
  const segments: string[] = [];
  if (format.include_agent_name) segments.push('[agentName]');
  if (format.include_project_name) segments.push('[projectName]');
  segments.push(format.include_intent_emoji ? '🎨 title desc' : 'title desc');
  return segments.join(' | ');
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  activeSectionOverride,
}) => {
  const installInFlightRef = React.useRef(false);
  const [status, setStatus] = useState<UpdateStatus>({ stage: 'idle' });
  const [appVersion, setAppVersion] = useState('');
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('about');
  const [llmConfig, setLlmConfig] = useState<LlmProvidersFile | null>(null);
  const [isLlmConfigLoading, setIsLlmConfigLoading] = useState(false);
  const [providerDialogState, setProviderDialogState] = useState<{
    open: boolean;
    providerId: string | null;
  }>({ open: false, providerId: null });
  const [providersExpanded, setProvidersExpanded] = useState(true);
  const [routingExpanded, setRoutingExpanded] = useState(true);
  const [providerToggleId, setProviderToggleId] = useState<string | null>(null);
  const [routingSavingKey, setRoutingSavingKey] = useState<string | null>(null);
  const [sessionTitleFormatOpen, setSessionTitleFormatOpen] = useState(false);
  const [providerTests, setProviderTests] = useState<Record<string, {
    open: boolean;
    status: 'idle' | 'testing' | 'pass' | 'fail';
    output: string;
  }>>({});
  const providerTestUnsubscribeRef = useRef<Record<string, (() => void) | null>>({});
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

  useEffect(() => {
    if (!isOpen || !activeSectionOverride) return;
    setActiveSection(activeSectionOverride);
  }, [activeSectionOverride, isOpen]);

  const loadLlmConfig = React.useCallback(async () => {
    setIsLlmConfigLoading(true);
    try {
      const config = await llmProvidersApi.get();
      setLlmConfig(config);
    } catch (error) {
      toastManager.add({
        title: 'Failed to load LLM settings',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setIsLlmConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadLlmConfig();
  }, [isOpen, loadLlmConfig]);

  useEffect(() => {
    const testUnsubscribeRef = providerTestUnsubscribeRef;
    return () => {
      const unsubscribers = Object.values(testUnsubscribeRef.current);
      unsubscribers.forEach((unsubscribe) => {
        unsubscribe?.();
      });
    };
  }, []);

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
  const providerEntries = React.useMemo(
    () =>
      Object.entries(llmConfig?.providers ?? {}).map(([id, provider]) => ({
        id,
        label: provider.displayName?.trim() || fallbackProviderLabel(id),
        enabled: provider.enabled,
        model: provider.model?.trim() || null,
        kind: provider.kind,
      })),
    [llmConfig],
  );
  const sessionTitleFormat = React.useMemo(
    () => normalizeSessionTitleFormat(llmConfig?.features?.session_title_format),
    [llmConfig],
  );

  const handleProviderEnabledChange = React.useCallback(async (providerId: string, enabled: boolean) => {
    if (!llmConfig?.providers?.[providerId]) return;

    const nextConfig: LlmProvidersFile = {
      ...llmConfig,
      providers: {
        ...llmConfig.providers,
        [providerId]: {
          ...llmConfig.providers[providerId],
          enabled,
        },
      },
    };

    setProviderToggleId(providerId);
    setLlmConfig(nextConfig);

    try {
      await llmProvidersApi.update(nextConfig);
    } catch (error) {
      setLlmConfig(llmConfig);
      toastManager.add({
        title: 'Failed to update provider',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setProviderToggleId(null);
    }
  }, [llmConfig]);

  const handleLlmConfigUpdate = React.useCallback(async (
    key: string,
    updater: (current: LlmProvidersFile) => LlmProvidersFile,
  ) => {
    if (!llmConfig) return;

    const previousConfig = llmConfig;
    const nextConfig = updater(previousConfig);

    setRoutingSavingKey(key);
    setLlmConfig(nextConfig);

    try {
      await llmProvidersApi.update(nextConfig);
    } catch (error) {
      setLlmConfig(previousConfig);
      toastManager.add({
        title: 'Failed to update routing',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setRoutingSavingKey(null);
    }
  }, [llmConfig]);

  const runProviderTest = React.useCallback(async (
    providerId: string,
    provider: NonNullable<LlmProvidersFile['providers'][string]>,
  ) => {
    providerTestUnsubscribeRef.current[providerId]?.();

    const streamId = crypto.randomUUID();
    let streamedOutput = '';

    setProviderTests((current) => ({
      ...current,
      [providerId]: {
        open: true,
        status: 'testing',
        output: '',
      },
    }));

    providerTestUnsubscribeRef.current[providerId] = useWebSocketStore
      .getState()
      .onEvent('llm_provider_test_chunk', (payload) => {
        if (
          typeof payload !== 'object' ||
          payload === null ||
          (payload as { stream_id?: unknown }).stream_id !== streamId
        ) {
          return;
        }

        const chunk = (payload as { chunk?: unknown }).chunk;
        if (typeof chunk !== 'string' || chunk.length === 0) return;

        streamedOutput += chunk;
        setProviderTests((current) => ({
          ...current,
          [providerId]: {
            open: true,
            status: 'testing',
            output: streamedOutput,
          },
        }));
      });

    try {
      const result = await llmProvidersApi.testProvider({
        stream_id: streamId,
        provider_id: providerId,
        provider,
      });
      setProviderTests((current) => ({
        ...current,
        [providerId]: {
          open: true,
          status: 'pass',
          output: streamedOutput || result.text || '',
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setProviderTests((current) => ({
        ...current,
        [providerId]: {
          open: true,
          status: 'fail',
          output: streamedOutput
            ? `${streamedOutput}\n\n[ERROR] ${message}`
            : `[ERROR] ${message}`,
        },
      }));
    } finally {
      providerTestUnsubscribeRef.current[providerId]?.();
      providerTestUnsubscribeRef.current[providerId] = null;
    }
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()} className="h-[min(90vh,820px)] w-[min(96vw,1360px)] max-w-[min(96vw,1360px)] overflow-hidden border-border bg-background p-0 sm:!max-w-[min(96vw,1360px)]">
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
                ) : activeSection === 'terminal' ? (
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
                ) : (
                  <div className="space-y-4">
                    <Collapsible
                      open={providersExpanded}
                      onOpenChange={setProvidersExpanded}
                      className="overflow-hidden rounded-2xl border border-border"
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
                        <CollapsibleTrigger className="flex min-w-0 cursor-pointer items-start gap-2 pt-0.5 text-left">
                          <ChevronDown
                            className={cn(
                              'mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                              providersExpanded && 'rotate-180'
                            )}
                          />
                          <div className="min-w-0">
                            <p className="text-base font-medium text-foreground">Providers</p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              Manage API keys, endpoints, and default models for lightweight background tasks.
                            </p>
                          </div>
                        </CollapsibleTrigger>
                        <div className="flex items-center justify-end gap-3">
                          {isLlmConfigLoading ? (
                            <Skeleton className="h-10 w-28 rounded-xl" />
                          ) : (
                            <Button
                              variant="outline"
                              onClick={() => setProviderDialogState({ open: true, providerId: null })}
                            >
                              Add Provider
                            </Button>
                          )}
                        </div>
                      </div>

                      <CollapsibleContent>
                        <div className="border-t border-border px-6 py-3">
                          {isLlmConfigLoading ? (
                            <div className="space-y-3 py-2">
                              <Skeleton className="h-16 w-full rounded-xl" />
                              <Skeleton className="h-16 w-full rounded-xl" />
                            </div>
                          ) : providerEntries.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                              No providers configured yet.
                            </div>
                          ) : (
                            <div className="divide-y divide-border">
                              {providerEntries.map((provider) => (
                                <div key={provider.id} className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 py-4">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2.5">
                                      <p className="truncate text-sm font-medium text-foreground">
                                        {provider.label}
                                      </p>
                                      <Popover
                                        open={providerTests[provider.id]?.open ?? false}
                                        onOpenChange={(open) =>
                                          setProviderTests((current) => ({
                                            ...current,
                                            [provider.id]: {
                                              open,
                                              status: current[provider.id]?.status ?? 'idle',
                                              output: current[provider.id]?.output ?? '',
                                            },
                                          }))
                                        }
                                      >
                                        <PopoverTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className={cn(
                                              'h-7 px-2 text-[11px]',
                                              providerTests[provider.id]?.status === 'pass' &&
                                                'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300',
                                              providerTests[provider.id]?.status === 'fail' &&
                                                'border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/15',
                                              providerTests[provider.id]?.status === 'testing' &&
                                                'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300',
                                            )}
                                            onClick={() => {
                                              if (!llmConfig?.providers?.[provider.id]) return;
                                              void runProviderTest(provider.id, llmConfig.providers[provider.id]);
                                            }}
                                          >
                                            {providerTests[provider.id]?.status === 'testing'
                                              ? 'TESTING...'
                                              : providerTests[provider.id]?.status === 'pass'
                                                ? 'PASS'
                                                : providerTests[provider.id]?.status === 'fail'
                                                  ? 'FAIL'
                                                  : 'TEST'}
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent align="start" className="w-[420px] p-4">
                                          <div className="space-y-2">
                                            <div className="flex items-center justify-between gap-3">
                                              <p className="text-sm font-medium text-foreground">
                                                Provider Test
                                              </p>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2 text-[11px]"
                                                onClick={() => {
                                                  if (!llmConfig?.providers?.[provider.id]) return;
                                                  void runProviderTest(provider.id, llmConfig.providers[provider.id]);
                                                }}
                                              >
                                                RETEST
                                              </Button>
                                            </div>
                                            <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/20 p-3 text-xs whitespace-pre-wrap text-foreground">
                                              {providerTests[provider.id]?.output ||
                                                (providerTests[provider.id]?.status === 'testing'
                                                  ? 'Streaming response...'
                                                  : 'Click TEST to start.')}
                                            </pre>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                    <p className="mt-1 truncate text-xs text-muted-foreground">
                                      {provider.model || provider.kind}
                                    </p>
                                  </div>
                                  <div className="flex items-center justify-end gap-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">Enabled</span>
                                      <Switch
                                        checked={provider.enabled}
                                        disabled={providerToggleId === provider.id}
                                        onCheckedChange={(checked) => {
                                          void handleProviderEnabledChange(provider.id, !!checked);
                                        }}
                                      />
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setProviderDialogState({ open: true, providerId: provider.id })
                                      }
                                    >
                                      Edit
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible
                      open={routingExpanded}
                      onOpenChange={setRoutingExpanded}
                      className="overflow-hidden rounded-2xl border border-border"
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
                        <CollapsibleTrigger className="flex min-w-0 cursor-pointer items-start gap-2 pt-0.5 text-left">
                          <ChevronDown
                            className={cn(
                              'mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                              routingExpanded && 'rotate-180'
                            )}
                          />
                          <div className="min-w-0">
                            <p className="text-base font-medium text-foreground">Routing</p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              Choose which provider handles tasks.
                            </p>
                          </div>
                        </CollapsibleTrigger>
                        <div />
                      </div>

                      <CollapsibleContent>
                        <div className="border-t border-border px-6 py-3">
                          {isLlmConfigLoading ? (
                            <div className="space-y-3 py-2">
                              <Skeleton className="h-16 w-full rounded-xl" />
                              <Skeleton className="h-16 w-full rounded-xl" />
                              <Skeleton className="h-16 w-full rounded-xl" />
                            </div>
                          ) : (
                            <div className="divide-y divide-border">
                              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 py-4">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">Session title generator</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {sessionTitleFormat.include_agent_name ||
                                    sessionTitleFormat.include_project_name ||
                                    sessionTitleFormat.include_intent_emoji
                                      ? 'Custom title format enabled'
                                      : 'Default title format'}
                                  </p>
                                </div>
                                <div className="flex items-center justify-end gap-3">
                                  <Select
                                    value={llmConfig?.features?.session_title ?? '__none__'}
                                    onValueChange={(value) => {
                                      void handleLlmConfigUpdate('session_title', (current) => ({
                                        ...current,
                                        features: {
                                          ...current.features,
                                          session_title: value === '__none__' ? null : value,
                                        },
                                      }));
                                    }}
                                    disabled={routingSavingKey === 'session_title'}
                                  >
                                    <SelectTrigger className="w-[180px]">
                                      <SelectValue placeholder="Disabled" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">Disabled</SelectItem>
                                      {providerEntries.map((provider) => (
                                        <SelectItem key={provider.id} value={provider.id}>
                                          {provider.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Popover open={sessionTitleFormatOpen} onOpenChange={setSessionTitleFormatOpen}>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" size="sm">
                                        <SlidersHorizontal className="size-4" />
                                        Format
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" className="w-80 space-y-4 p-4">
                                      <p className="text-sm font-medium text-foreground">Session title format</p>
                                      <div className="rounded-2xl border border-border bg-muted/20 p-4">
                                        <p className="text-xs font-semibold text-muted-foreground">
                                          Final format
                                        </p>
                                        <p className="mt-2 font-mono text-sm text-foreground">
                                          {sessionTitleFormatPreview(sessionTitleFormat)}
                                        </p>
                                      </div>
                                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                                        <div>
                                          <p className="text-sm text-foreground">Intent emoji</p>
                                        </div>
                                        <Switch
                                          checked={!!sessionTitleFormat.include_intent_emoji}
                                          onCheckedChange={(checked) => {
                                            void handleLlmConfigUpdate('session_title_format', (current) => ({
                                              ...current,
                                              features: {
                                                ...current.features,
                                                session_title_format: {
                                                  ...normalizeSessionTitleFormat(current.features.session_title_format),
                                                  include_intent_emoji: !!checked,
                                                },
                                              },
                                            }));
                                          }}
                                          disabled={routingSavingKey === 'session_title_format'}
                                        />
                                      </label>
                                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                                        <div>
                                          <p className="text-sm text-foreground">Agent name</p>
                                        </div>
                                        <Switch
                                          checked={!!sessionTitleFormat.include_agent_name}
                                          onCheckedChange={(checked) => {
                                            void handleLlmConfigUpdate('session_title_format', (current) => ({
                                              ...current,
                                              features: {
                                                ...current.features,
                                                session_title_format: {
                                                  ...normalizeSessionTitleFormat(current.features.session_title_format),
                                                  include_agent_name: !!checked,
                                                },
                                              },
                                            }));
                                          }}
                                          disabled={routingSavingKey === 'session_title_format'}
                                        />
                                      </label>
                                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                                        <div>
                                          <p className="text-sm text-foreground">Project name</p>
                                        </div>
                                        <Switch
                                          checked={!!sessionTitleFormat.include_project_name}
                                          onCheckedChange={(checked) => {
                                            void handleLlmConfigUpdate('session_title_format', (current) => ({
                                              ...current,
                                              features: {
                                                ...current.features,
                                                session_title_format: {
                                                  ...normalizeSessionTitleFormat(current.features.session_title_format),
                                                  include_project_name: !!checked,
                                                },
                                              },
                                            }));
                                          }}
                                          disabled={routingSavingKey === 'session_title_format'}
                                        />
                                      </label>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              </div>

                              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 py-4">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">Git commit generator</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {llmConfig?.features?.git_commit_language?.trim() || 'Prompt default language'}
                                  </p>
                                </div>
                                <div className="flex items-center justify-end gap-3">
                                  <Select
                                    value={llmConfig?.features?.git_commit ?? '__none__'}
                                    onValueChange={(value) => {
                                      void handleLlmConfigUpdate('git_commit', (current) => ({
                                        ...current,
                                        features: {
                                          ...current.features,
                                          git_commit: value === '__none__' ? null : value,
                                        },
                                      }));
                                    }}
                                    disabled={routingSavingKey === 'git_commit'}
                                  >
                                    <SelectTrigger className="w-[180px]">
                                      <SelectValue placeholder="Disabled" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">Disabled</SelectItem>
                                      {providerEntries.map((provider) => (
                                        <SelectItem key={provider.id} value={provider.id}>
                                          {provider.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="outline" size="sm">
                                        <Languages className="size-4" />
                                        Language
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-64">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          void handleLlmConfigUpdate('git_commit_language', (current) => ({
                                            ...current,
                                            features: {
                                              ...current.features,
                                              git_commit_language: null,
                                            },
                                          }));
                                        }}
                                      >
                                        Prompt default
                                      </DropdownMenuItem>
                                      {FEATURE_LANGUAGE_OPTIONS.map((option) => (
                                        <DropdownMenuItem
                                          key={option.value}
                                          onClick={() => {
                                            void handleLlmConfigUpdate('git_commit_language', (current) => ({
                                              ...current,
                                              features: {
                                                ...current.features,
                                                git_commit_language: option.label,
                                              },
                                            }));
                                          }}
                                        >
                                          {option.label}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>

                              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 py-4">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">Workspace issue TODO extraction</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {llmConfig?.features?.workspace_issue_todo_language?.trim() || 'Prompt default language'}
                                  </p>
                                </div>
                                <div className="flex items-center justify-end gap-3">
                                  <Select
                                    value={llmConfig?.features?.workspace_issue_todo ?? '__none__'}
                                    onValueChange={(value) => {
                                      void handleLlmConfigUpdate('workspace_issue_todo', (current) => ({
                                        ...current,
                                        features: {
                                          ...current.features,
                                          workspace_issue_todo: value === '__none__' ? null : value,
                                        },
                                      }));
                                    }}
                                    disabled={routingSavingKey === 'workspace_issue_todo'}
                                  >
                                    <SelectTrigger className="w-[180px]">
                                      <SelectValue placeholder="Disabled" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">Disabled</SelectItem>
                                      {providerEntries.map((provider) => (
                                        <SelectItem key={provider.id} value={provider.id}>
                                          {provider.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="outline" size="sm">
                                        <Languages className="size-4" />
                                        Language
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-64">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          void handleLlmConfigUpdate('workspace_issue_todo_language', (current) => ({
                                            ...current,
                                            features: {
                                              ...current.features,
                                              workspace_issue_todo_language: null,
                                            },
                                          }));
                                        }}
                                      >
                                        Prompt default
                                      </DropdownMenuItem>
                                      {FEATURE_LANGUAGE_OPTIONS.map((option) => (
                                        <DropdownMenuItem
                                          key={option.value}
                                          onClick={() => {
                                            void handleLlmConfigUpdate('workspace_issue_todo_language', (current) => ({
                                              ...current,
                                              features: {
                                                ...current.features,
                                                workspace_issue_todo_language: option.label,
                                              },
                                            }));
                                          }}
                                        >
                                          {option.label}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}
              </div>
            </ScrollArea>
          </section>
        </div>

        <LlmProviderEditorDialog
          open={providerDialogState.open}
          providerId={providerDialogState.providerId}
          onOpenChange={(open) =>
            setProviderDialogState((current) => ({ ...current, open }))
          }
          onSaved={() => {
            void loadLlmConfig();
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
