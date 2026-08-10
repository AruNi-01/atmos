'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { useShallow } from 'zustand/react/shallow';
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  toastManager,
} from '@workspace/ui';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  KeyRound,
  Laptop,
  Link2,
  LoaderCircle,
  RefreshCw,
  Server,
} from 'lucide-react';
import WelcomePage from '@/features/welcome/components/WelcomePage';
import { AtmosWordmark } from '@/shared/components/ui/AtmosWordmark';
import { HostedSloganShimmer } from '@/shared/components/ui/HostedSloganShimmer';
import { RemoteComputerSetupBlock } from '@/features/atmos-computer/components/RemoteComputerSetupBlock';
import { useHostedConnectionStore } from '@/features/connection/store/hosted-connection-store';
import {
  resolveRelayUrl,
  useAtmosComputerStore,
} from '@/features/connection/lib/atmos-computer-store';
import {
  createHostedRemoteSession,
  detectHostedLocalServer,
  ensureHostedAccessTokenReady,
  listHostedRemoteComputers,
} from '@/features/connection/lib/hosted-connection';
import { getStoredDeviceCredential } from '@/api/hub-client';
import { isPlausibleDeviceCredential } from '@/features/connection/lib/atmos-access-token';
import { REMOTE_COMPUTER_INSTALL_SCRIPT_URL } from '@/features/connection/lib/remote-computer-setup-commands';
import {
  activateHostedLocalConnection,
  activateHostedRemoteConnection,
} from '@/features/connection/lib/hosted-connection-actions';
import { isHostedAtmosOrigin } from '@/shared/lib/desktop-runtime';
import {
  saveComputerClientSettings,
  saveComputerClientSettingsToDisk,
  type ComputerClientSettingsSaveLocation,
} from '@/features/connection/lib/sync-computer-client-settings';
import { applyIdentityBearingComputerSettings } from '@/features/connection/lib/query-identity-lifecycle';
import { HostedLandingLoading } from '@/app-shell/HostedLandingLoading';
import { useInitialProjectsLoading } from '@/features/project/store/use-initial-projects-loading';
import { useAppRouter } from '@/shared/hooks/use-app-router';

type HostedWelcomeGateProps = {
  onAddProject?: () => void;
  onConnectAgent?: () => void;
  onClose?: () => void;
  className?: string;
};

let mountedSnapshot = false;
let mountedNotificationScheduled = false;
const mountedListeners = new Set<() => void>();

function subscribeMounted(listener: () => void): () => void {
  mountedListeners.add(listener);
  if (!mountedSnapshot && !mountedNotificationScheduled) {
    mountedNotificationScheduled = true;
    queueMicrotask(() => {
      mountedSnapshot = true;
      mountedNotificationScheduled = false;
      mountedListeners.forEach(notify => notify());
    });
  }
  return () => {
    mountedListeners.delete(listener);
  };
}

function getMountedSnapshot(): boolean {
  return mountedSnapshot;
}

function getMountedServerSnapshot(): boolean {
  return false;
}

export function HostedWelcomeGate(props: HostedWelcomeGateProps) {
  const mounted = useMounted();
  const bootstrapState = useHostedConnectionStore(s => s.bootstrapState);
  const isInitialProjectsLoading = useInitialProjectsLoading();

  if (!mounted || isInitialProjectsLoading) {
    return <HostedLandingLoading />;
  }

  const hosted = isHostedAtmosOrigin();
  const showOnboarding = hosted && bootstrapState !== 'connected';

  if (showOnboarding) {
    return (
      <div className="size-full animate-in fade-in slide-in-from-bottom-2 duration-200">
        <HostedConnectionOnboarding />
      </div>
    );
  }

  return (
    <div className="size-full animate-in fade-in slide-in-from-bottom-1 duration-200">
      <WelcomePage {...props} />
    </div>
  );
}

export function HostedConnectionSetupPage() {
  const mounted = useMounted();
  const router = useAppRouter();

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {mounted ? (
        <HostedConnectionOnboarding
          defaultTab="remote"
          onConnected={() => router.replace('/')}
        />
      ) : (
        <HostedLandingLoading />
      )}
    </div>
  );
}

function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getMountedServerSnapshot,
  );
}

function HostedLocalCommandField({
  command,
  copied,
  onCopy,
  copiedLabel,
  copyLabel,
}: {
  command: string;
  copied: boolean;
  onCopy: () => void;
  copiedLabel: string;
  copyLabel: string;
}) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md border border-border/70 bg-muted/30 py-2 pl-3 pr-11 font-mono text-xs leading-relaxed text-foreground">
        {command}
      </pre>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-0.5 top-1/2 size-8 -translate-y-1/2"
        onClick={onCopy}
        title={copied ? copiedLabel : copyLabel}
        aria-label={copied ? copiedLabel : copyLabel}
      >
        {copied ? (
          <Check className="size-4 text-emerald-500" />
        ) : (
          <Copy className="size-4" />
        )}
      </Button>
    </div>
  );
}

function HostedConnectionOnboarding({
  defaultTab = 'local',
  onConnected,
}: {
  defaultTab?: 'local' | 'remote';
  onConnected?: () => void;
}) {
  const t = useTranslations("Welcome.components");
  const localInstallCommand = `curl -fsSL ${REMOTE_COMPUTER_INSTALL_SCRIPT_URL} | bash`;
  /** Installer appends ~/.atmos/bin to the default shell rc (see install-local-web-runtime.sh). */
  const localStartCommand = 'atmos runtime ensure';
  const {
    localProbeState,
    localApiConfig,
    localStatus,
    localError,
    remoteError,
    startChecking,
    setConnected,
    setLocalAvailable,
    setLocalUnavailable,
    setOnboarding,
    setRemoteError,
  } = useHostedConnectionStore(
    useShallow((s) => ({
      localProbeState: s.localProbeState,
      localApiConfig: s.localApiConfig,
      localStatus: s.localStatus,
      localError: s.localError,
      remoteError: s.remoteError,
      startChecking: s.startChecking,
      setConnected: s.setConnected,
      setLocalAvailable: s.setLocalAvailable,
      setLocalUnavailable: s.setLocalUnavailable,
      setOnboarding: s.setOnboarding,
      setRemoteError: s.setRemoteError,
    })),
  );
  const {
    accessToken,
    relayUrl,
    relaySecretKey,
    computers,
    selectedServerId,
    connectionMode,
    relayWebSocketUrl,
    setComputers,
  } = useAtmosComputerStore();

  const [activeTab, setActiveTab] = useState<'local' | 'remote'>(defaultTab);
  const [relayUrlDraft, setRelayUrlDraft] = useState(relayUrl);
  const [relaySecretDraft, setRelaySecretDraft] = useState(relaySecretKey);
  const [tokenDraft, setTokenDraft] = useState(accessToken);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedStart, setCopiedStart] = useState(false);
  const [generatedTokenReveal, setGeneratedTokenReveal] = useState<string | null>(null);
  const [generatedTokenLocation, setGeneratedTokenLocation] =
    useState<ComputerClientSettingsSaveLocation | null>(null);
  const [generatedTokenCopied, setGeneratedTokenCopied] = useState(false);
  const [accessKeyNotice, setAccessKeyNotice] = useState<{
    tone: 'default' | 'warning';
    message: string;
  } | null>(null);
  const localProbeStartedRef = useRef(false);

  const activeComputers = useMemo(() => computers.filter(row => !row.revoked), [computers]);
  const hasKey = tokenDraft.trim().length >= 32;
  const connectedRemoteServerId =
    connectionMode === 'relay' && relayWebSocketUrl ? selectedServerId : null;

  useEffect(() => {
    setTokenDraft(accessToken);
  }, [accessToken]);

  useEffect(() => {
    setRelayUrlDraft(relayUrl);
  }, [relayUrl]);

  useEffect(() => {
    setRelaySecretDraft(relaySecretKey);
  }, [relaySecretKey]);

  const onTokenDraftChange = (value: string) => {
    setTokenDraft(value);
    setGeneratedTokenReveal(null);
    setGeneratedTokenLocation(null);
    setGeneratedTokenCopied(false);
    setAccessKeyNotice(null);
  };

  const runLocalProbe = useCallback(async () => {
    startChecking();
    try {
      const local = await detectHostedLocalServer();
      setLocalAvailable(local.config, local.status);
    } catch (err) {
      setLocalUnavailable(
        err instanceof Error ? err.message : t('hosted.local.errors.cannotReachServer'),
      );
    } finally {
      setOnboarding();
    }
  }, [setLocalAvailable, setLocalUnavailable, setOnboarding, startChecking]);

  useEffect(() => {
    if (localProbeStartedRef.current || localProbeState !== 'idle') {
      return;
    }
    localProbeStartedRef.current = true;
    void runLocalProbe();
  }, [localProbeState, runLocalProbe]);

  const refreshRemoteList = useCallback(
    async (
      token = tokenDraft,
      relayUrl = relayUrlDraft,
      secretKey = relaySecretDraft,
    ): Promise<void> => {
      const trimmed = token.trim();
      if (trimmed.length < 32) {
        return;
      }
      setListRefreshing(true);
      try {
        const rows = await listHostedRemoteComputers(relayUrl, trimmed, secretKey);
        setComputers(rows);
        setRemoteError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('hosted.remote.errors.couldNotLoadComputers');
        setRemoteError(message);
        toastManager.add({
          title: t('hosted.remote.toast.couldNotLoadComputersTitle'),
          description: message,
          type: 'error',
        });
      } finally {
        setListRefreshing(false);
      }
    },
    [relaySecretDraft, relayUrlDraft, setComputers, setRemoteError, t, tokenDraft],
  );

  useEffect(() => {
    if (!accessToken.trim()) {
      return;
    }
    void refreshRemoteList(accessToken, relayUrl, relaySecretKey);
  }, [accessToken, relayUrl, refreshRemoteList, relaySecretKey]);

  const onSaveToken = async () => {
    const token = tokenDraft.trim();
    const nextRelayUrl = resolveRelayUrl(relayUrlDraft);
    const nextRelaySecret = relaySecretDraft.trim();
    setBusyAction('save-token');
    try {
      await ensureHostedAccessTokenReady(nextRelayUrl, token, nextRelaySecret);
      await applyIdentityBearingComputerSettings({
        relayUrl: nextRelayUrl,
        relaySecretKey: nextRelaySecret,
        accessToken: token,
      });
      const saveResult = await saveComputerClientSettings(
        token,
        nextRelayUrl,
        nextRelaySecret,
      );
      setAccessKeyNotice({
        tone: saveResult.persisted ? 'default' : 'warning',
        message:
          saveResult.location === 'api'
            ? t('hosted.remote.notice.savedOnConnectedComputer')
            : t('hosted.remote.notice.notConnectedCopyBeforeClose'),
      });
      await refreshRemoteList(token, nextRelayUrl, nextRelaySecret);
    } catch (err) {
      toastManager.add({
        title: t('hosted.remote.toast.couldNotSaveAccessKeyTitle'),
        description: err instanceof Error ? err.message : t('hosted.common.tryAgain'),
        type: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const onGenerateToken = async () => {
    // APP-056: device credentials come from Hub Account enroll, not local generation.
    const token = (getStoredDeviceCredential() ?? '').trim();
    if (!isPlausibleDeviceCredential(token)) {
      toastManager.add({
        title: t('hosted.remote.toast.couldNotSaveAccessKeyTitle'),
        description:
          'Sign in under Settings → Account, trust this device, then import the device credential.',
        type: 'error',
      });
      return;
    }
    const nextRelayUrl = resolveRelayUrl(relayUrlDraft);
    const nextRelaySecret = relaySecretDraft.trim();
    setBusyAction('generate-token');
    try {
      await ensureHostedAccessTokenReady(nextRelayUrl, token, nextRelaySecret);
      await applyIdentityBearingComputerSettings({
        relayUrl: nextRelayUrl,
        relaySecretKey: nextRelaySecret,
        accessToken: token,
      });
      setTokenDraft(token);
      setGeneratedTokenReveal(token);
      setGeneratedTokenLocation(null);
      setGeneratedTokenCopied(false);
      setAccessKeyNotice(null);
      const saveResult = await saveComputerClientSettings(
        token,
        nextRelayUrl,
        nextRelaySecret,
      );
      setGeneratedTokenLocation(saveResult.location);
      await refreshRemoteList(token, nextRelayUrl, nextRelaySecret);
    } catch (err) {
      toastManager.add({
        title: t('hosted.remote.toast.couldNotCreateAccessKeyTitle'),
        description: err instanceof Error ? err.message : t('hosted.common.tryAgain'),
        type: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const copyGeneratedToken = async () => {
    if (!generatedTokenReveal) {
      return;
    }
    try {
      await navigator.clipboard.writeText(generatedTokenReveal);
      setGeneratedTokenCopied(true);
      window.setTimeout(() => setGeneratedTokenCopied(false), 2000);
    } catch {
      toastManager.add({ title: t('hosted.common.copyFailed'), type: 'error' });
    }
  };

  const copyLocalCommand = async (text: string, which: 'install' | 'start') => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'install') {
        setCopiedInstall(true);
        window.setTimeout(() => setCopiedInstall(false), 2000);
      } else {
        setCopiedStart(true);
        window.setTimeout(() => setCopiedStart(false), 2000);
      }
    } catch {
      toastManager.add({ title: t('hosted.common.copyFailed'), type: 'error' });
    }
  };

  const onRefreshLocal = async () => {
    await runLocalProbe();
  };

  const onConnectLocal = async () => {
    if (!localApiConfig) {
      return;
    }
    setBusyAction('connect-local');
    try {
      await activateHostedLocalConnection(localApiConfig);
      setConnected('local');
      onConnected?.();
    } catch (err) {
      toastManager.add({
        title: t('hosted.local.toast.couldNotConnectTitle'),
        description: err instanceof Error ? err.message : t('hosted.common.tryAgain'),
        type: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const onConnectRemote = async (serverId: string) => {
    const token = tokenDraft.trim();
    const nextRelayUrl = resolveRelayUrl(relayUrlDraft);
    const nextRelaySecret = relaySecretDraft.trim();
    setBusyAction(`connect-${serverId}`);
    try {
      await applyIdentityBearingComputerSettings({
        relayUrl: nextRelayUrl,
        relaySecretKey: nextRelaySecret,
      });
      const session = await createHostedRemoteSession(
        nextRelayUrl,
        token,
        serverId,
        nextRelaySecret,
      );
      if (token && token !== accessToken) {
        await applyIdentityBearingComputerSettings({ accessToken: token });
        void saveComputerClientSettingsToDisk(token, nextRelayUrl, nextRelaySecret);
      }
      await activateHostedRemoteConnection(serverId, session);
      setConnected('relay');
      onConnected?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('hosted.common.tryAgain');
      setRemoteError(message);
      toastManager.add({
        title: t('hosted.remote.toast.couldNotConnectTitle'),
        description: message,
        type: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const localComputerName =
    localStatus?.computer_name?.trim() ||
    localStatus?.hostname?.trim() ||
    t('hosted.local.thisComputer');

  return (
    <main className="size-full overflow-y-auto bg-background px-6 py-6 sm:px-10 sm:py-8 lg:px-16 lg:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-start pb-10">
        <div className="mx-auto mb-6 flex max-w-3xl shrink-0 flex-col items-center text-center sm:mb-8">
          <AtmosWordmark
            className="w-full"
            letterClassName="text-[5.5rem] font-semibold sm:text-[7.25rem] lg:text-[8.75rem]"
            logoClassName="size-24 sm:size-28 lg:size-32"
            sloganClassName="hidden"
          />
          <HostedSloganShimmer />
          <p className="mt-8 max-w-2xl text-base leading-7 text-muted-foreground sm:mt-10 sm:text-lg">
            {t('hosted.hero.description')}
          </p>
        </div>

        <div className="mx-auto w-full max-w-3xl min-w-0">
          <Tabs
            value={activeTab}
            onValueChange={value => setActiveTab(value as 'local' | 'remote')}
            className="flex flex-col space-y-7"
          >
            <TabsList className="grid h-12 w-full shrink-0 grid-cols-2 rounded-lg border border-border/70 bg-muted/30 p-1">
              <TabsTrigger value="local" className="gap-2 rounded-md text-sm">
                <Laptop className="size-4" />
                {t('hosted.tabs.local')}
              </TabsTrigger>
              <TabsTrigger value="remote" className="gap-2 rounded-md text-sm">
                <Server className="size-4" />
                {t('hosted.tabs.remote')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="local" className="mt-0">
              <div className="space-y-4 pb-4">
                <section className="rounded-xl border border-border/70 bg-muted/15 p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <h2 className="text-base font-medium text-foreground">{t('hosted.local.title')}</h2>
                        {localProbeState === 'available' ? (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle2 className="size-3.5" />
                            {t('hosted.local.status.available')}
                          </Badge>
                        ) : localProbeState === 'checking' ? (
                          <Badge variant="secondary" className="gap-1">
                            <LoaderCircle className="size-3.5 animate-spin" />
                            {t('hosted.local.status.checking')}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{t('hosted.local.status.notFound')}</Badge>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="ml-auto shrink-0"
                        onClick={() => void onRefreshLocal()}
                        disabled={localProbeState === 'checking' || busyAction !== null}
                      >
                        {localProbeState === 'checking' ? (
                          <LoaderCircle className="mr-2 size-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 size-4" />
                        )}
                        {t('hosted.local.checkAgain')}
                      </Button>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {t('hosted.local.description')}
                    </p>
                    {localProbeState === 'unavailable' && localError ? (
                      <p className="mt-3 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm leading-6 text-muted-foreground">
                        {localError}
                      </p>
                    ) : null}
                  </div>

                  {localProbeState === 'available' ? (
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{localComputerName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('hosted.local.loopbackFoundAt', {
                            provider: `${localApiConfig?.host}:${localApiConfig?.port}`,
                          })}
                        </p>
                      </div>
                      <Button onClick={() => void onConnectLocal()} disabled={busyAction === 'connect-local'}>
                        {busyAction === 'connect-local' ? (
                          <LoaderCircle className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Link2 className="mr-2 size-4" />
                        )}
                        {t('hosted.common.connect')}
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-4 rounded-lg border border-border/70 bg-background/70 p-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{t('hosted.local.installStartTitle')}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('hosted.local.installStartDescription')}
                        </p>
                      </div>
                      <div className="space-y-3">
                        <HostedLocalCommandField
                          command={localInstallCommand}
                          copied={copiedInstall}
                          onCopy={() => void copyLocalCommand(localInstallCommand, 'install')}
                          copiedLabel={t('hosted.common.copied')}
                          copyLabel={t('hosted.common.copyCommand')}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t('hosted.local.alreadyInstalled')}
                        </p>
                        <HostedLocalCommandField
                          command={localStartCommand}
                          copied={copiedStart}
                          onCopy={() => void copyLocalCommand(localStartCommand, 'start')}
                          copiedLabel={t('hosted.common.copied')}
                          copyLabel={t('hosted.common.copyCommand')}
                        />
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </TabsContent>

            <TabsContent value="remote" className="mt-0">
              <div className="space-y-4 pb-4">
                <section className="rounded-xl border border-border/70 bg-muted/15 p-5">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md border border-border/70 bg-background/70 p-2">
                      <KeyRound className="size-4 text-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-medium text-foreground">{t('hosted.remote.accessKeyTitle')}</h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {t('hosted.remote.accessKeyDescription')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <Input
                        type="password"
                        value={tokenDraft}
                        onChange={event => onTokenDraftChange(event.target.value)}
                        placeholder={t('hosted.remote.accessKeyPlaceholder')}
                        className="flex-1"
                      />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void onGenerateToken()}
                        disabled={busyAction !== null}
                      >
                        {busyAction === 'generate-token' ? (
                          <LoaderCircle className="mr-2 size-4 animate-spin" />
                        ) : (
                          <KeyRound className="mr-2 size-4" />
                        )}
                        {t('hosted.remote.generateKey')}
                      </Button>
                      <Button onClick={() => void onSaveToken()} disabled={!hasKey || busyAction !== null}>
                        {busyAction === 'save-token' ? (
                          <LoaderCircle className="mr-2 size-4 animate-spin" />
                        ) : null}
                        {t('hosted.remote.useKey')}
                      </Button>
                    </div>
                  </div>

                  <Collapsible className="mt-4 overflow-hidden rounded-lg border border-border/70 bg-background/70">
                    <CollapsibleTrigger className="group flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left">
                        <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                          <Link2 className="absolute size-4 transition-opacity duration-150 group-hover:opacity-0" />
                          <ChevronDown className="absolute size-4 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
                        </span>
                        <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">{t('hosted.remote.privateRelayTitle')}</span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {t('hosted.remote.privateRelayDescription')}
                        </span>
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="grid gap-3 border-t border-border/70 px-4 py-4 md:grid-cols-2">
                        <label className="space-y-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {t('hosted.remote.relayUrlLabel')}
                          </span>
                          <Input
                            value={relayUrlDraft}
                            onChange={event => setRelayUrlDraft(event.target.value)}
                            placeholder={t('hosted.remote.relayUrlPlaceholder')}
                            autoComplete="off"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {t('hosted.remote.privateRelayTokenLabel')}
                          </span>
                          <Input
                            type="password"
                            value={relaySecretDraft}
                            onChange={event => setRelaySecretDraft(event.target.value)}
                            placeholder={t('hosted.remote.privateRelayTokenPlaceholder')}
                            autoComplete="off"
                          />
                        </label>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {accessKeyNotice ? (
                    <p
                      className={cn(
                        'mt-3 text-sm',
                        accessKeyNotice.tone === 'warning'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-muted-foreground',
                      )}
                    >
                      {accessKeyNotice.message}
                    </p>
                  ) : null}

                  {generatedTokenReveal ? (
                    <div className="mt-4 space-y-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{t('hosted.remote.copyAccessKeyNow')}</p>
                      <p className="text-xs text-muted-foreground">
                        {generatedTokenLocation === 'api'
                          ? t('hosted.remote.generatedKeySaved')
                          : t('hosted.remote.generatedKeyNotSaved')}
                      </p>
                      <pre className="overflow-x-auto break-all rounded-md bg-background/70 px-3 py-2 font-mono text-xs text-foreground">
                        {generatedTokenReveal}
                      </pre>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void copyGeneratedToken()}
                      >
                        {generatedTokenCopied ? (
                          <Check className="mr-2 size-4 text-emerald-500" />
                        ) : (
                          <Copy className="mr-2 size-4" />
                        )}
                        {generatedTokenCopied ? t('hosted.common.copied') : t('hosted.remote.copyKey')}
                      </Button>
                    </div>
                  ) : null}

                  {remoteError ? (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{remoteError}</p>
                  ) : null}
                </section>

                <section className="rounded-xl border border-border/70 bg-background/70 p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-medium text-foreground">{t('hosted.remote.availableComputersTitle')}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('hosted.remote.availableComputersDescription')}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void refreshRemoteList()}
                      disabled={!hasKey || listRefreshing || busyAction !== null}
                    >
                      {listRefreshing ? (
                        <LoaderCircle className="mr-2 size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 size-4" />
                      )}
                      {t('hosted.common.refresh')}
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {activeComputers.length > 0 ? (
                      <div className="space-y-3">
                        {activeComputers.map(computer => {
                          const isConnected = connectedRemoteServerId === computer.server_id;
                          return (
                            <div
                              key={computer.server_id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-medium text-foreground">
                                    {computer.display_name?.trim() || computer.server_id}
                                  </p>
                                  {computer.online ? <Badge variant="secondary">{t('hosted.remote.badge.online')}</Badge> : null}
                                  {isConnected ? <Badge variant="secondary">{t('hosted.remote.badge.connected')}</Badge> : null}
                                </div>
                                <p className="mt-1 truncate text-xs text-muted-foreground">
                                  {computer.server_id}
                                </p>
                              </div>
                              <Button
                                variant={isConnected ? 'outline' : 'default'}
                                onClick={() => void onConnectRemote(computer.server_id)}
                                disabled={!hasKey || busyAction !== null}
                              >
                                {busyAction === `connect-${computer.server_id}` ? (
                                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                                ) : null}
                                {isConnected ? t('hosted.remote.reconnect') : t('hosted.common.connect')}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
                        {hasKey
                          ? t('hosted.remote.emptyWithKey')
                          : t('hosted.remote.emptyWithoutKey')}
                      </div>
                    )}
                    <RemoteComputerSetupBlock
                      active={activeTab === 'remote'}
                      hasAccessToken={hasKey}
                      relayUrl={relayUrlDraft}
                      accessToken={tokenDraft.trim()}
                      relaySecretKey={relaySecretDraft}
                      busy={busyAction !== null}
                    />
                  </div>
                </section>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}
