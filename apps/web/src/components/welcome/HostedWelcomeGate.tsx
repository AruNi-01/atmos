'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toastManager,
} from '@workspace/ui';
import {
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Laptop,
  Link2,
  LoaderCircle,
  RefreshCw,
  Server,
} from 'lucide-react';
import WelcomePage from '@/components/welcome/WelcomePage';
import { AtmosWordmark } from '@/components/ui/AtmosWordmark';
import { HostedSloganShimmer } from '@/components/ui/HostedSloganShimmer';
import { RemoteComputerSetupBlock } from '@/components/dialogs/RemoteComputerSetupBlock';
import { useHostedConnectionStore } from '@/hooks/use-hosted-connection-store';
import { useAtmosComputerStore } from '@/lib/atmos-computer-store';
import {
  createHostedRemoteSession,
  ensureHostedAccessTokenReady,
  listHostedRemoteComputers,
} from '@/lib/hosted-connection';
import { REMOTE_COMPUTER_INSTALL_SCRIPT_URL } from '@/lib/remote-computer-setup-commands';
import {
  activateHostedLocalConnection,
  activateHostedRemoteConnection,
} from '@/lib/hosted-connection-actions';
import { isHostedAtmosOrigin } from '@/lib/desktop-runtime';
import { saveComputerClientSettingsToDisk } from '@/lib/sync-computer-client-settings';
import { AppShellLoading } from '@/components/layout/AppShellLoading';
import { useInitialProjectsLoading } from '@/hooks/use-initial-projects-loading';

type HostedWelcomeGateProps = {
  onAddProject?: () => void;
  onConnectAgent?: () => void;
  onClose?: () => void;
  className?: string;
};

export function HostedWelcomeGate(props: HostedWelcomeGateProps) {
  const [mounted, setMounted] = useState(false);
  const bootstrapState = useHostedConnectionStore(s => s.bootstrapState);
  const isInitialProjectsLoading = useInitialProjectsLoading();
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || isInitialProjectsLoading) {
    return <AppShellLoading />;
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

function HostedLocalCommandField({
  command,
  copied,
  onCopy,
}: {
  command: string;
  copied: boolean;
  onCopy: () => void;
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
        title={copied ? 'Copied' : 'Copy command'}
        aria-label={copied ? 'Copied' : 'Copy command'}
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

function HostedConnectionOnboarding() {
  const localInstallCommand = `curl -fsSL ${REMOTE_COMPUTER_INSTALL_SCRIPT_URL} | bash`;
  /** Installer appends ~/.atmos/bin to the default shell rc (see install-local-web-runtime.sh). */
  const localStartCommand = 'atmos runtime ensure';
  const {
    localProbeState,
    localApiConfig,
    localStatus,
    localError,
    remoteError,
    setConnected,
    setRemoteError,
  } = useHostedConnectionStore();
  const {
    accessToken,
    controlPlaneUrl,
    computers,
    selectedServerId,
    connectionMode,
    relayWebSocketUrl,
    setAccessToken,
    setComputers,
  } = useAtmosComputerStore();

  const [activeTab, setActiveTab] = useState<'local' | 'remote'>('local');
  const [tokenDraft, setTokenDraft] = useState(accessToken);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedStart, setCopiedStart] = useState(false);

  const activeComputers = useMemo(() => computers.filter(row => !row.revoked), [computers]);
  const hasKey = tokenDraft.trim().length >= 32;
  const connectedRemoteServerId =
    connectionMode === 'relay' && relayWebSocketUrl ? selectedServerId : null;

  useEffect(() => {
    setTokenDraft(accessToken);
  }, [accessToken]);

  const refreshRemoteList = useCallback(
    async (token = tokenDraft): Promise<void> => {
      const trimmed = token.trim();
      if (trimmed.length < 32) {
        return;
      }
      setListRefreshing(true);
      try {
        const rows = await listHostedRemoteComputers(controlPlaneUrl, trimmed);
        setComputers(rows);
        setRemoteError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not load computers.';
        setRemoteError(message);
        toastManager.add({
          title: 'Could not load computers',
          description: message,
          type: 'error',
        });
      } finally {
        setListRefreshing(false);
      }
    },
    [controlPlaneUrl, setComputers, setRemoteError, tokenDraft],
  );

  useEffect(() => {
    if (!accessToken.trim()) {
      return;
    }
    void refreshRemoteList(accessToken);
  }, [accessToken, refreshRemoteList]);

  const onSaveToken = async () => {
    const token = tokenDraft.trim();
    setBusyAction('save-token');
    try {
      await ensureHostedAccessTokenReady(controlPlaneUrl, token);
      setAccessToken(token);
      const persisted = await saveComputerClientSettingsToDisk(token, controlPlaneUrl);
      toastManager.add({
        title: persisted ? 'Access key saved' : 'Saved for this session',
        description: persisted
          ? 'Connected computers are now ready to load.'
          : 'Could not persist locally. Keep this tab open if you need the key again.',
        type: persisted ? 'success' : 'warning',
      });
      await refreshRemoteList(token);
    } catch (err) {
      toastManager.add({
        title: 'Could not save access key',
        description: err instanceof Error ? err.message : 'Try again.',
        type: 'error',
      });
    } finally {
      setBusyAction(null);
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
      toastManager.add({ title: 'Copy failed', type: 'error' });
    }
  };

  const onConnectLocal = async () => {
    if (!localApiConfig) {
      return;
    }
    setBusyAction('connect-local');
    try {
      await activateHostedLocalConnection(localApiConfig);
      setConnected('local');
    } catch (err) {
      toastManager.add({
        title: 'Could not connect locally',
        description: err instanceof Error ? err.message : 'Try again.',
        type: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const onConnectRemote = async (serverId: string) => {
    const token = tokenDraft.trim();
    setBusyAction(`connect-${serverId}`);
    try {
      const session = await createHostedRemoteSession(controlPlaneUrl, token, serverId);
      if (token && token !== accessToken) {
        setAccessToken(token);
        void saveComputerClientSettingsToDisk(token, controlPlaneUrl);
      }
      await activateHostedRemoteConnection(serverId, session);
      setConnected('relay');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Try again.';
      setRemoteError(message);
      toastManager.add({
        title: 'Could not connect remote computer',
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
    'This computer';

  return (
    <main className="flex size-full overflow-hidden bg-background px-6 py-6 sm:px-10 sm:py-8 lg:px-16 lg:py-10">
      <div className="mx-auto flex h-full w-full max-w-5xl min-h-0 flex-col items-center justify-start">
        <div className="mx-auto mb-6 flex max-w-3xl shrink-0 flex-col items-center text-center sm:mb-8">
          <AtmosWordmark
            className="w-full"
            letterClassName="text-[5.5rem] font-semibold sm:text-[7.25rem] lg:text-[8.75rem]"
            logoClassName="size-24 sm:size-28 lg:size-32"
            sloganClassName="hidden"
          />
          <HostedSloganShimmer />
          <p className="mt-8 max-w-2xl text-base leading-7 text-muted-foreground sm:mt-10 sm:text-lg">
            Connect a local Atmos Server or pick a remote computer to enter your workspace.
          </p>
        </div>

        <Card className="mx-auto flex h-[min(42rem,calc(100dvh-14rem))] w-full max-w-3xl min-h-0 min-w-0 overflow-hidden rounded-xl border border-border/70 bg-background/95 shadow-[0_28px_90px_rgba(0,0,0,0.2)] backdrop-blur-md">
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit] p-5 sm:p-7">
            <Tabs
              value={activeTab}
              onValueChange={value => setActiveTab(value as 'local' | 'remote')}
              className="flex min-h-0 flex-1 flex-col space-y-7 overflow-hidden"
            >
              <TabsList className="grid h-12 w-full shrink-0 grid-cols-2 rounded-lg border border-border/70 bg-muted/30 p-1">
                <TabsTrigger value="local" className="gap-2 rounded-md text-sm">
                  <Laptop className="size-4" />
                  Local Server
                </TabsTrigger>
                <TabsTrigger value="remote" className="gap-2 rounded-md text-sm">
                  <Server className="size-4" />
                  Remote Computer
                </TabsTrigger>
              </TabsList>

              <TabsContent value="local" className="mt-0 min-h-0 flex-1 overflow-hidden rounded-[inherit]">
                <ScrollArea className="flex-1 min-h-0 rounded-[inherit]" scrollbarGutter>
                  <div className="min-h-full space-y-4 pe-2 pb-4">
                    <section className="rounded-xl border border-border/70 bg-muted/15 p-5">
                      <div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-base font-medium text-foreground">Local Atmos Server</h2>
                            {localProbeState === 'available' ? (
                              <Badge variant="secondary" className="gap-1">
                                <CheckCircle2 className="size-3.5" />
                                Available
                              </Badge>
                            ) : localProbeState === 'checking' ? (
                              <Badge variant="secondary" className="gap-1">
                                <LoaderCircle className="size-3.5 animate-spin" />
                                Checking
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Not found</Badge>
                            )}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            We first check whether Atmos Local Runtime is available on this device.
                            If it is already running, you can connect to it directly here.
                          </p>
                          {localProbeState === 'unavailable' && localError ? (
                            <p className="mt-3 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm leading-6 text-muted-foreground">
                              {localError}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {localProbeState === 'available' ? (
                        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{localComputerName}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Loopback API found at{' '}
                              <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                                {localApiConfig?.host}:{localApiConfig?.port}
                              </code>
                            </p>
                          </div>
                          <Button onClick={() => void onConnectLocal()} disabled={busyAction === 'connect-local'}>
                            {busyAction === 'connect-local' ? (
                              <LoaderCircle className="mr-2 size-4 animate-spin" />
                            ) : (
                              <Link2 className="mr-2 size-4" />
                            )}
                            Connect
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-5 space-y-4 rounded-lg border border-border/70 bg-background/70 p-4">
                          <div>
                            <p className="text-sm font-medium text-foreground">Install and start Atmos locally</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Use the local web runtime installer below. It installs Atmos and starts the
                              local server for you.
                            </p>
                          </div>
                          <div className="space-y-3">
                            <HostedLocalCommandField
                              command={localInstallCommand}
                              copied={copiedInstall}
                              onCopy={() => void copyLocalCommand(localInstallCommand, 'install')}
                            />
                            <p className="text-xs text-muted-foreground">
                              Already installed? Run this:
                            </p>
                            <HostedLocalCommandField
                              command={localStartCommand}
                              copied={copiedStart}
                              onCopy={() => void copyLocalCommand(localStartCommand, 'start')}
                            />
                          </div>
                        </div>
                      )}
                    </section>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="remote" className="mt-0 min-h-0 flex-1 overflow-hidden rounded-[inherit]">
                <ScrollArea className="flex-1 min-h-0 rounded-[inherit]" scrollbarGutter>
                  <div className="min-h-full space-y-4 pe-2 pb-4">
                    <section className="rounded-xl border border-border/70 bg-muted/15 p-5">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-md border border-border/70 bg-background/70 p-2">
                          <KeyRound className="size-4 text-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-base font-medium text-foreground">Access Key</h2>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            Paste your Atmos access key to list all computers under that tenant and
                            connect one of them here.
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                        <Input
                          type="password"
                          value={tokenDraft}
                          onChange={event => setTokenDraft(event.target.value)}
                          placeholder="Paste access key"
                          className="flex-1"
                        />
                        <div className="flex gap-2">
                          <Button onClick={() => void onSaveToken()} disabled={!hasKey || busyAction !== null}>
                            {busyAction === 'save-token' ? (
                              <LoaderCircle className="mr-2 size-4 animate-spin" />
                            ) : null}
                            Save Key
                          </Button>
                        </div>
                      </div>

                      {remoteError ? (
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">{remoteError}</p>
                      ) : null}
                    </section>

                    <section className="rounded-xl border border-border/70 bg-background/70 p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-base font-medium text-foreground">Available Computers</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Pick a computer to create a client session and enter the app.
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
                          Refresh
                        </Button>
                      </div>

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
                                    {computer.online ? <Badge variant="secondary">Online</Badge> : null}
                                    {isConnected ? <Badge variant="secondary">Connected</Badge> : null}
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
                                  {isConnected ? 'Reconnect' : 'Connect'}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
                            {hasKey
                              ? 'No computers found for this access key yet.'
                              : 'Save an access key first, then refresh to load your computers.'}
                          </div>
                          <RemoteComputerSetupBlock
                            active={activeTab === 'remote'}
                            hasAccessToken={hasKey}
                            controlPlaneUrl={controlPlaneUrl}
                            accessToken={tokenDraft.trim()}
                            busy={busyAction !== null}
                          />
                        </div>
                      )}
                    </section>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
