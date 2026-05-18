'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toastManager,
} from '@workspace/ui';
import {
  CheckCircle2,
  KeyRound,
  Laptop,
  LoaderCircle,
  RefreshCw,
  Server,
  Sparkles,
} from 'lucide-react';
import WelcomePage from '@/components/welcome/WelcomePage';
import { AtmosWordmark } from '@/components/ui/AtmosWordmark';
import { RemoteComputerSetupBlock } from '@/components/dialogs/RemoteComputerSetupBlock';
import { useHostedConnectionStore } from '@/hooks/use-hosted-connection-store';
import { useAtmosComputerStore } from '@/lib/atmos-computer-store';
import {
  createHostedRemoteSession,
  ensureHostedAccessTokenReady,
  listHostedRemoteComputers,
} from '@/lib/hosted-connection';
import {
  activateHostedLocalConnection,
  activateHostedRemoteConnection,
} from '@/lib/hosted-connection-actions';
import { isHostedAtmosOrigin } from '@/lib/desktop-runtime';
import { saveComputerClientSettingsToDisk } from '@/lib/sync-computer-client-settings';

type HostedWelcomeGateProps = {
  onAddProject?: () => void;
  onConnectAgent?: () => void;
  onClose?: () => void;
  className?: string;
};

export function HostedWelcomeGate(props: HostedWelcomeGateProps) {
  const [mounted, setMounted] = useState(false);
  const bootstrapState = useHostedConnectionStore(s => s.bootstrapState);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="size-full bg-background" />;
  }

  const hosted = isHostedAtmosOrigin();
  const showOnboarding = hosted && bootstrapState !== 'connected';

  return (
    <AnimatePresence initial={false} mode="wait">
      {showOnboarding ? (
        <motion.div
          key="hosted-onboarding"
          initial={{ opacity: 0, y: 12, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.985 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="size-full"
        >
          <HostedConnectionOnboarding />
        </motion.div>
      ) : (
        <motion.div
          key="welcome-page"
          initial={{ opacity: 0, y: 10, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.992 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="size-full"
        >
          <WelcomePage {...props} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function HostedConnectionOnboarding() {
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
    <main className="flex size-full items-center justify-center overflow-auto bg-background px-6 py-10">
      <div className="w-full max-w-3xl">
        <div className="mx-auto mb-10 flex max-w-xl flex-col items-center text-center">
          <AtmosWordmark
            className="w-full"
            letterClassName="text-[4.25rem] sm:text-[5.5rem]"
            logoClassName="size-16 sm:size-20"
            sloganClassName="pt-4 text-base sm:text-lg"
          />
          <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">
            Connect a local Atmos Server or pick a remote computer to enter your workspace.
          </p>
        </div>

        <Card className="rounded-[1.75rem] border border-border/70 bg-background/95 shadow-[0_22px_70px_rgba(0,0,0,0.16)] backdrop-blur-md">
          <CardContent className="p-4 sm:p-6">
            <Tabs
              value={activeTab}
              onValueChange={value => setActiveTab(value as 'local' | 'remote')}
              className="space-y-6"
            >
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl border border-border/70 bg-muted/30 p-1">
                <TabsTrigger value="local" className="gap-2 rounded-lg">
                  <Laptop className="size-4" />
                  Local Server
                </TabsTrigger>
                <TabsTrigger value="remote" className="gap-2 rounded-lg">
                  <Server className="size-4" />
                  Remote Computer
                </TabsTrigger>
              </TabsList>

              <TabsContent value="local" className="mt-0 space-y-4">
                <section className="rounded-2xl border border-border/70 bg-muted/15 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
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
                        We look for Atmos on this machine first. If it is running, you can use it
                        directly from `app.atmos.land`.
                      </p>
                    </div>
                    {localProbeState === 'available' ? (
                      <Button onClick={() => void onConnectLocal()} disabled={busyAction === 'connect-local'}>
                        {busyAction === 'connect-local' ? (
                          <LoaderCircle className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 size-4" />
                        )}
                        Connect
                      </Button>
                    ) : null}
                  </div>

                  {localProbeState === 'available' ? (
                    <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <p className="text-sm font-medium text-foreground">{localComputerName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Loopback API found at{' '}
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                          {localApiConfig?.host}:{localApiConfig?.port}
                        </code>
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Start the local API</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Run Atmos locally, then refresh this tab or try the remote option.
                        </p>
                      </div>
                      <div className="space-y-3">
                        <pre className="overflow-x-auto rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-foreground">
just dev-api
                        </pre>
                        <pre className="overflow-x-auto rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-foreground">
atmos runtime ensure
                        </pre>
                      </div>
                      {localError ? (
                        <p className="text-xs leading-5 text-muted-foreground">{localError}</p>
                      ) : null}
                    </div>
                  )}
                </section>
              </TabsContent>

              <TabsContent value="remote" className="mt-0 space-y-4">
                <section className="rounded-2xl border border-border/70 bg-muted/15 p-5">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg border border-border/70 bg-background/70 p-2">
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
                      value={tokenDraft}
                      onChange={event => setTokenDraft(event.target.value)}
                      placeholder="Paste access key"
                      className="flex-1"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
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

                <section className="rounded-2xl border border-border/70 bg-background/70 p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-medium text-foreground">Available Computers</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Pick a computer to create a client session and enter the app.
                      </p>
                    </div>
                    {listRefreshing ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" /> : null}
                  </div>

                  {activeComputers.length > 0 ? (
                    <div className="space-y-3">
                      {activeComputers.map(computer => {
                        const isConnected = connectedRemoteServerId === computer.server_id;
                        return (
                          <div
                            key={computer.server_id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3"
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
                      <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
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
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
