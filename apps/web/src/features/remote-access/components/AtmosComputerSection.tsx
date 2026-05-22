'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  toastManager,
  Switch,
  cn,
} from '@workspace/ui';
import {
  Check,
  ChevronDown,
  Computer,
  Copy,
  FlaskConical,
  KeyRound,
  Laptop,
  LoaderCircle,
  Plus,
  RotateCw,
  Server,
  Trash2,
} from 'lucide-react';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import {
  cpFetchWithAccessToken,
  generateAccessToken,
  registerAccessTokenOnRelay,
} from '@/features/connection/lib/atmos-access-token';
import {
  loadLocalComputerStatus,
  registerLocalComputer,
  syncRelayConnection,
  unregisterLocalComputer,
  type LocalComputerStatus,
} from '@/features/connection/lib/atmos-computer-local';
import { buildRegistrationMeta } from '@/features/connection/lib/registration-meta';
import { useAtmosComputerStore, type ComputerRow } from '@/features/connection/lib/atmos-computer-store';
import {
  ensureComputerClientSettingsHydrated,
  saveComputerClientSettingsToDisk,
} from '@/features/connection/lib/sync-computer-client-settings';
import {
  syncClientSessionLocal,
  syncClientSessionRelay,
} from '@/features/connection/lib/sync-client-session';
import { ComputerDetailsDialog } from '@/features/remote-access/components/ComputerDetailsDialog';
import { RemoteComputerSetupBlock } from '@/features/remote-access/components/RemoteComputerSetupBlock';

function SettingsBlock({
  title,
  description,
  icon,
  headerAction,
  headerEnd,
  children,
}: {
  title: string;
  description?: string;
  icon: ReactNode;
  headerAction?: ReactNode;
  headerEnd?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border">
      <div className="border-b border-border/60 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 gap-3">
            <span
              className={cn(
                'flex w-5 shrink-0 items-center justify-center [&_svg]:size-5',
                headerAction ? 'h-8' : 'h-6',
              )}
            >
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  'flex flex-wrap items-center gap-2',
                  headerAction ? 'min-h-8' : 'min-h-6',
                )}
              >
                <h3 className="text-base font-medium leading-6 text-foreground">{title}</h3>
                {headerAction}
              </div>
              {description ? (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              ) : null}
            </div>
          </div>
          {headerEnd ? <div className="shrink-0 pt-0.5">{headerEnd}</div> : null}
        </div>
      </div>
      <div className="space-y-4 px-6 py-5">{children}</div>
    </section>
  );
}

export function AtmosComputerSection() {
  const {
    connectionMode,
    controlPlaneUrl,
    accessToken,
    computers,
    selectedServerId,
    relayWebSocketUrl,
    localServerId,
    setConnectionMode,
    setAccessToken,
    setComputers,
    setSelectedServerId,
    setRelayWebSocketUrl,
    setRelayGatewayHttpBase,
    setRelayClientToken,
    setLocalServerId,
    resetRelaySession,
  } = useAtmosComputerStore();

  const [busy, setBusy] = useState<string | null>(null);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [tokenDraft, setTokenDraft] = useState(accessToken);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenReveal, setTokenReveal] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<LocalComputerStatus | null>(null);
  const [detailsComputer, setDetailsComputer] = useState<ComputerRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [remoteComputerExpanded, setRemoteComputerExpanded] = useState(false);
  const relayAutoSyncAttemptedRef = useRef(false);

  const hasKey = accessToken.trim().length >= 32;
  const activeComputers = computers.filter(c => !c.revoked);
  const connectedServerId =
    connectionMode === 'relay' && relayWebSocketUrl ? selectedServerId : null;

  const reconnectWs = () => {
    useWebSocketStore.getState().disconnect();
    void (async () => {
      const { onConnectionTargetChanged } = await import('@/app-shell/bootstrap/ConnectionBootstrapper');
      await onConnectionTargetChanged();
      await useWebSocketStore.getState().connect();
    })();
  };

  const refreshLocalStatus = useCallback(async () => {
    const knownId = useAtmosComputerStore.getState().localServerId;
    const status = await loadLocalComputerStatus(knownId);
    setLocalStatus(status);
    if (status?.server_id) {
      setLocalServerId(status.server_id);
    } else if (status && !status.registered) {
      setLocalServerId(null);
    }
  }, [setLocalServerId]);

  const refreshComputerList = useCallback(async () => {
    if (accessToken.trim().length < 32) {
      return;
    }
    setListRefreshing(true);
    try {
      const res = await cpFetchWithAccessToken(controlPlaneUrl, accessToken, '/v1/computers');
      const data = (await res.json().catch(() => null)) as { computers?: ComputerRow[] } | null;
      if (res.ok && data?.computers) {
        setComputers(data.computers);
      }
    } finally {
      setListRefreshing(false);
    }
  }, [accessToken, controlPlaneUrl, setComputers]);

  const onRelayReconnect = useCallback(async () => {
    setBusy('relay-sync');
    try {
      const sync = await syncRelayConnection();
      const knownId = useAtmosComputerStore.getState().localServerId;
      const status = await loadLocalComputerStatus(knownId);
      if (status) {
        setLocalStatus({
          ...status,
          relay_connected: sync.relay_connected,
          relay_last_error: sync.relay_last_error ?? null,
        });
      }
      await refreshComputerList();
      if (sync.relay_connected) {
        toastManager.add({
          title: 'Remote connection restored',
          description: 'This computer is available for remote access.',
          type: 'success',
        });
      } else {
        toastManager.add({
          title: 'Could not connect relay',
          description:
            sync.relay_last_error ??
            'Ensure Atmos is running on this computer, then try again.',
          type: 'error',
        });
      }
    } catch (err) {
      const description =
        err instanceof Error ? err.message : 'Ensure Atmos is running on this computer.';
      setLocalStatus(prev =>
        prev ? { ...prev, relay_connected: false, relay_last_error: description } : prev,
      );
      toastManager.add({
        title: 'Could not connect relay',
        description,
        type: 'error',
      });
    } finally {
      setBusy(null);
    }
  }, [refreshComputerList]);

  useEffect(() => {
    setTokenDraft(accessToken);
  }, [accessToken]);

  useEffect(() => {
    setTokenCopied(false);
  }, [tokenDraft]);

  useEffect(() => {
    void ensureComputerClientSettingsHydrated().then(() => {
      setTokenDraft(useAtmosComputerStore.getState().accessToken);
    });
  }, []);

  useEffect(() => {
    void refreshLocalStatus();
  }, [refreshLocalStatus]);

  useEffect(() => {
    if (hasKey) {
      void refreshComputerList();
    }
  }, [hasKey, refreshComputerList]);

  /** After API restart, relay may still be connecting; sync once instead of showing a false offline state. */
  useEffect(() => {
    if (!hasKey) {
      relayAutoSyncAttemptedRef.current = false;
      return;
    }
    const serverId = localStatus?.server_id ?? localServerId;
    const registered =
      Boolean(localStatus?.registered && serverId) ||
      Boolean(localServerId && serverId === localServerId);
    if (!registered) {
      relayAutoSyncAttemptedRef.current = false;
      return;
    }
    if (localStatus?.relay_connected || relayAutoSyncAttemptedRef.current) {
      return;
    }
    relayAutoSyncAttemptedRef.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const sync = await syncRelayConnection();
        if (cancelled) {
          return;
        }
        const knownId = useAtmosComputerStore.getState().localServerId;
        const status = await loadLocalComputerStatus(knownId);
        if (status) {
          setLocalStatus({
            ...status,
            relay_connected: sync.relay_connected,
            relay_last_error: sync.relay_last_error ?? null,
          });
        }
        await refreshComputerList();
      } catch {
        /* keep banner + Reconnect; user can retry manually */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasKey, localStatus, localServerId, refreshComputerList]);

  async function ensureAccessTokenReady(token: string): Promise<boolean> {
    if (token.trim().length < 32) {
      toastManager.add({
        title: 'Access key is too short',
        description: 'Generate a new key or paste your saved one.',
        type: 'error',
      });
      return false;
    }
    const reg = await registerAccessTokenOnRelay(controlPlaneUrl, token);
    if (!reg.ok) {
      toastManager.add({
        title: 'Could not save access key',
        description: reg.error ?? 'Try again.',
        type: 'error',
      });
      return false;
    }
    return true;
  }

  async function onCopyToken() {
    const token = tokenDraft.trim();
    if (!token) {
      return;
    }
    try {
      await navigator.clipboard.writeText(token);
      setTokenCopied(true);
      window.setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      toastManager.add({
        title: 'Could not copy',
        description: 'Check clipboard permissions.',
        type: 'error',
      });
    }
  }

  async function onSaveToken() {
    setBusy('token-save');
    try {
      const token = tokenDraft.trim();
      if (!(await ensureAccessTokenReady(token))) {
        return;
      }
      setAccessToken(token);
      const persisted = await saveComputerClientSettingsToDisk(token, controlPlaneUrl);
      if (!persisted) {
        toastManager.add({
          title: 'Saved for this session',
          description:
            'Could not save on this computer. Ensure Atmos is running locally.',
          type: 'warning',
        });
      } else {
        toastManager.add({ title: 'Access key saved', type: 'success' });
      }
      await refreshComputerList();
    } finally {
      setBusy(null);
    }
  }

  async function onGenerateToken() {
    setBusy('token-generate');
    try {
      const token = generateAccessToken();
      if (!(await ensureAccessTokenReady(token))) {
        return;
      }
      setTokenDraft(token);
      setAccessToken(token);
      setTokenReveal(token);
      const persisted = await saveComputerClientSettingsToDisk(token, controlPlaneUrl);
      toastManager.add({
        title: 'Access key created',
        description: persisted
          ? 'Saved on this computer. Copy it now — it will not be shown again.'
          : 'Copy it now — could not save on this computer. Ensure Atmos is running locally.',
        type: persisted ? 'success' : 'warning',
      });
      await refreshComputerList();
    } finally {
      setBusy(null);
    }
  }

  async function onRemoteToggle(enabled: boolean) {
    if (!hasKey) {
      toastManager.add({
        title: 'Save your access key first',
        description: 'Add and save an access key before enabling remote access.',
        type: 'error',
      });
      return;
    }

    setBusy('remote');
    try {
      if (enabled) {
        const displayName =
          localStatus?.computer_name ?? localStatus?.hostname ?? 'My Computer';

        const tokenRes = await cpFetchWithAccessToken(
          controlPlaneUrl,
          accessToken,
          '/v1/register_tokens',
          { method: 'POST', body: JSON.stringify({}) },
        );
        const tokenData = (await tokenRes.json().catch(() => null)) as {
          register_token?: string;
          error?: string;
        } | null;
        if (!tokenRes.ok || !tokenData?.register_token) {
          toastManager.add({
            title: 'Could not start registration',
            description: tokenData?.error ?? 'Try again.',
            type: 'error',
          });
          return;
        }

        const reg = await registerLocalComputer(
          tokenData.register_token,
          displayName,
          await buildRegistrationMeta(),
        );
        setLocalServerId(reg.server_id);
        setLocalStatus(prev => ({
          hostname: prev?.hostname ?? localStatus?.hostname ?? null,
          computer_name: displayName,
          registered: true,
          relay_connected: reg.relay_connected ?? false,
          relay_last_error: reg.relay_last_error ?? null,
          server_id: reg.server_id,
          control_plane_url:
            prev?.control_plane_url ?? localStatus?.control_plane_url ?? controlPlaneUrl,
          relay_ws_url: prev?.relay_ws_url ?? localStatus?.relay_ws_url ?? null,
          shell_env: prev?.shell_env ?? localStatus?.shell_env,
        }));
        if (reg.relay_connected) {
          toastManager.add({
            title: 'Remote access enabled',
            description: 'This computer is available for remote connection.',
            type: 'success',
          });
        } else {
          toastManager.add({
            title: 'Registered, not yet online',
            description:
              reg.relay_last_error ??
              'Use Reconnect below after checking your network connection.',
            type: 'error',
          });
        }
        await refreshLocalStatus();
        await refreshComputerList();
        return;
      }

      const serverId = localStatus?.server_id ?? localServerId;
      if (serverId) {
        await cpFetchWithAccessToken(
          controlPlaneUrl,
          accessToken,
          `/v1/computers/${encodeURIComponent(serverId)}/revoke`,
          { method: 'POST', body: '{}' },
        );
      }
      await unregisterLocalComputer();
      setLocalServerId(null);
      if (connectedServerId === serverId) {
        resetRelaySession();
        setConnectionMode('local');
        void syncClientSessionLocal().catch(() => undefined);
        reconnectWs();
      }
      toastManager.add({
        title: 'Remote access disabled',
        type: 'success',
      });
      await refreshLocalStatus();
      await refreshComputerList();
    } catch (err) {
      const description =
        err instanceof Error ? err.message : 'Ensure Atmos is running on this computer, then try again.';
      toastManager.add({
        title: enabled ? 'Could not register to remote' : 'Could not unregister',
        description,
        type: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  async function onConnect(serverId: string) {
    if (!(await ensureAccessTokenReady(accessToken))) {
      return;
    }
    const isLocalMachine = serverId === (localStatus?.server_id ?? localServerId);
    if (isLocalMachine) {
      setBusy(`connect-${serverId}`);
      try {
        resetRelaySession();
        setConnectionMode('local');
        void syncClientSessionLocal().catch(() => undefined);
        reconnectWs();
        toastManager.add({ title: 'Using this computer locally', type: 'success' });
      } finally {
        setBusy(null);
      }
      return;
    }
    setBusy(`connect-${serverId}`);
    try {
      const res = await cpFetchWithAccessToken(
        controlPlaneUrl,
        accessToken,
        `/v1/computers/${encodeURIComponent(serverId)}/client_sessions`,
        { method: 'POST', body: JSON.stringify({ client_kind: 'web' }) },
      );
      const data = (await res.json().catch(() => null)) as {
        ws_url?: string;
        gateway_url?: string;
        client_token?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.ws_url || !data?.gateway_url || !data?.client_token) {
        toastManager.add({
          title: 'Could not connect',
          description: data?.error ?? 'Is that computer online?',
          type: 'error',
        });
        return;
      }
      setSelectedServerId(serverId);
      setRelayWebSocketUrl(data.ws_url);
      setRelayGatewayHttpBase(data.gateway_url);
      setRelayClientToken(data.client_token);
      setConnectionMode('relay');
      void syncClientSessionRelay(serverId, data.gateway_url, data.client_token).catch(
        () => undefined,
      );
      toastManager.add({ title: 'Connected', type: 'success' });
      reconnectWs();
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(serverId: string) {
    if (!(await ensureAccessTokenReady(accessToken))) {
      return;
    }
    setBusy(`remove-${serverId}`);
    try {
      const res = await cpFetchWithAccessToken(
        controlPlaneUrl,
        accessToken,
        `/v1/computers/${encodeURIComponent(serverId)}/revoke`,
        { method: 'POST', body: '{}' },
      );
      if (!res.ok) {
        toastManager.add({ title: 'Could not remove', type: 'error' });
        return;
      }
      const isLocal = serverId === (localStatus?.server_id ?? localServerId);
      if (isLocal) {
        await unregisterLocalComputer().catch(() => undefined);
        setLocalServerId(null);
        await refreshLocalStatus();
      }
      if (connectedServerId === serverId) {
        resetRelaySession();
        setConnectionMode('local');
        void syncClientSessionLocal().catch(() => undefined);
        reconnectWs();
      }
      toastManager.add({ title: 'Computer removed', type: 'success' });
      await refreshComputerList();
    } finally {
      setBusy(null);
    }
  }

  const currentServerId = localStatus?.server_id ?? localServerId;
  const currentComputerRow = currentServerId
    ? activeComputers.find(c => c.server_id === currentServerId)
    : undefined;
  const isLocalRegistered = Boolean(
    localStatus?.registered && currentServerId,
  ) || Boolean(localServerId && currentServerId === localServerId);
  /** Local API is authoritative; control-plane `online` is a fallback while relay is reconnecting. */
  const isCurrentRelayReachable =
    Boolean(localStatus?.relay_connected) || Boolean(currentComputerRow?.online);
  const relayLastError = localStatus?.relay_last_error?.trim() || null;
  const showRelayReconnect = isLocalRegistered && !isCurrentRelayReachable;
  const currentDeviceName =
    localStatus?.computer_name?.trim() ||
    localStatus?.hostname?.replace(/\.local$/i, '') ||
    'This computer';

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-amber-500/35 bg-amber-500/10">
        <div className="flex items-start gap-3 px-6 py-5">
          <FlaskConical className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground">
            Atmos Computer is still in active development, you may encounter bugs or incomplete
            behavior.
          </p>
        </div>
      </div>

      <SettingsBlock
        title="Access Key"
        icon={<KeyRound className="size-5" />}
        description="Your access key registers new Computers (via registration codes) and lists all Computers on your account."
        headerAction={
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null || !!tokenDraft.trim()}
            onClick={() => void onGenerateToken()}
          >
            {busy === 'token-generate' ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            Generate
          </Button>
        }
      >
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Input
              type="password"
              autoComplete="off"
              value={tokenDraft}
              onChange={e => setTokenDraft(e.target.value)}
              placeholder="Paste your access key or generate a new one"
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0.5 top-1/2 size-8 -translate-y-1/2"
              disabled={busy !== null || !tokenDraft.trim()}
              onClick={() => void onCopyToken()}
              title={tokenCopied ? 'Copied' : 'Copy access key'}
              aria-label={tokenCopied ? 'Copied' : 'Copy access key'}
            >
              {tokenCopied ? (
                <Check className="size-4 text-emerald-500" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="shrink-0 px-3"
            disabled={busy !== null || !tokenDraft.trim()}
            onClick={() => void onSaveToken()}
          >
            {busy === 'token-save' ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              'Save'
            )}
          </Button>
        </div>
        {tokenReveal ? (
          <div className="space-y-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3">
            <p className="text-sm font-medium">Copy your access key now</p>
            <pre className="overflow-x-auto break-all rounded-lg bg-background/60 px-3 py-2 font-mono text-xs">
              {tokenReveal}
            </pre>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(tokenReveal);
                setTokenReveal(null);
                toastManager.add({ title: 'Copied', type: 'success' });
              }}
            >
              <Copy className="mr-2 size-4" />
              Copy and dismiss
            </Button>
          </div>
        ) : null}
      </SettingsBlock>

      <Collapsible
        open={remoteComputerExpanded}
        onOpenChange={setRemoteComputerExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
            <div className="flex gap-3">
              <span className="relative flex h-6 w-5 shrink-0 items-center justify-center">
                <Server className="absolute size-5 transition-opacity duration-150 group-hover:opacity-0" />
                <ChevronDown className="absolute size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-medium leading-6 text-foreground">Register Computer</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Register another computer on your network or in the cloud.
                </p>
              </div>
            </div>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="border-t border-border px-6 py-5">
            <RemoteComputerSetupBlock
              active={remoteComputerExpanded}
              hasAccessToken={hasKey}
              controlPlaneUrl={controlPlaneUrl}
              accessToken={accessToken}
              busy={busy !== null}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <SettingsBlock
        title="This Computer"
        icon={<Laptop className="size-5" />}
        description="Register to remote so other computers can connect to this computer."
      >
        <div className="min-w-0 space-y-3">
            <div className="space-y-2">
              <p className="text-base font-semibold tracking-tight text-foreground">
                {currentDeviceName}
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-muted/15 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Register to Remote</p>
                <p className="text-xs text-muted-foreground">
                  {isLocalRegistered
                    ? isCurrentRelayReachable
                      ? 'Online in the remote registration center.'
                      : 'Connecting to the remote registration center…'
                    : 'Not registered to remote — local use only on this computer.'}
                </p>
              </div>
              <Switch
                checked={isLocalRegistered}
                disabled={busy === 'remote' || !hasKey}
                onCheckedChange={checked => void onRemoteToggle(checked)}
              />
            </div>
            {showRelayReconnect ? (
              <div className="space-y-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">Offline in remote registration center</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void onRelayReconnect()}
                  >
                    {busy === 'relay-sync' ? (
                      <LoaderCircle className="mr-2 size-4 animate-spin" />
                    ) : (
                      <RotateCw className="mr-2 size-4" />
                    )}
                    Reconnect
                  </Button>
                </div>
                {relayLastError ? (
                  <p className="text-xs leading-5 text-destructive">{relayLastError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Other computers cannot connect yet. Tap Reconnect to try again.
                  </p>
                )}
              </div>
            ) : null}
            {!hasKey ? (
              <p className="text-xs text-muted-foreground">Save an access key above to use Register to Remote.</p>
            ) : null}
        </div>
      </SettingsBlock>

      <SettingsBlock
        title="My Computers"
        icon={<Computer className="size-5" />}
        description="Computers linked to your account."
        headerEnd={
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasKey || busy !== null}
            onClick={() => void refreshComputerList()}
          >
            <RotateCw className={cn('mr-2 size-4', listRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        }
      >
        {!hasKey ? (
          <p className="text-sm text-muted-foreground">Save an access key to see your computers.</p>
        ) : activeComputers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No computers yet. Enable remote access on this computer, or add another remote computer
            with the same access key.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {activeComputers.map(c => {
              const isCurrent = c.server_id === currentServerId;
              const isConnected = connectedServerId === c.server_id;
              const relayReachable = isCurrent
                ? isCurrentRelayReachable
                : Boolean(c.online);
              const name = (c.display_name ?? 'Computer').slice(0, 64);
              return (
                <li
                  key={c.server_id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{name}</span>
                      {isCurrent ? (
                        <Badge variant="secondary" className="text-xs">
                          Current
                        </Badge>
                      ) : null}
                      {isConnected ? (
                        <Badge className="bg-primary/15 text-xs text-primary">Connected</Badge>
                      ) : null}
                      <span
                        className={cn(
                          'text-xs',
                          relayReachable
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-muted-foreground',
                        )}
                      >
                        {relayReachable ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isCurrent && showRelayReconnect ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => void onRelayReconnect()}
                      >
                        {busy === 'relay-sync' ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <>
                            <RotateCw className="mr-2 size-4" />
                            Reconnect
                          </>
                        )}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant={isConnected ? 'secondary' : 'default'}
                      disabled={
                        busy !== null ||
                        (!relayReachable && !isCurrent) ||
                        (isCurrent && connectionMode === 'local')
                      }
                      onClick={() => void onConnect(c.server_id)}
                    >
                      {busy === `connect-${c.server_id}` ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : isConnected ? (
                        'In use'
                      ) : isCurrent ? (
                        'Use locally'
                      ) : (
                        'Connect'
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDetailsComputer(c);
                        setDetailsOpen(true);
                      }}
                    >
                      Details
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={busy !== null}
                      onClick={() => void onRemove(c.server_id)}
                    >
                      {busy === `remove-${c.server_id}` ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsBlock>

      <ComputerDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        computer={detailsComputer}
        isCurrent={detailsComputer?.server_id === currentServerId}
      />
    </div>
  );
}
