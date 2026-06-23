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
  Link2,
  LoaderCircle,
  Plus,
  RotateCw,
  Server,
  Trash2,
} from 'lucide-react';
import { automationApi } from '@/api/ws/automation-api';
import {
  relayFetchWithAccessToken,
  generateAccessToken,
  registerAccessTokenOnRelay,
  rotateAccessTokenOnRelay,
} from '@/features/connection/lib/atmos-access-token';
import { createHostedRemoteSession } from '@/features/connection/lib/hosted-connection';
import {
  activateCurrentLocalConnection,
  activateHostedRemoteConnection,
} from '@/features/connection/lib/hosted-connection-actions';
import {
  loadLocalComputerStatus,
  registerLocalComputer,
  syncRelayConnection,
  unregisterLocalComputer,
  type LocalComputerStatus,
} from '@/features/connection/lib/atmos-computer-local';
import { buildRegistrationMeta } from '@/features/connection/lib/registration-meta';
import {
  resolveRelayUrl,
  useAtmosComputerStore,
  type ComputerRow,
} from '@/features/connection/lib/atmos-computer-store';
import {
  hydrateComputerClientSettingsFromDisk,
  saveComputerClientSettingsToDisk,
} from '@/features/connection/lib/sync-computer-client-settings';
import { ComputerDetailsDialog } from '@/features/atmos-computer/components/ComputerDetailsDialog';
import { RemoteComputerSetupBlock } from '@/features/atmos-computer/components/RemoteComputerSetupBlock';
import { clearRemoteComputerRegisterTokenCache } from '@/features/connection/lib/remote-computer-register-token-cache';

function SettingsBlock({
  title,
  description,
  icon,
  headerAction,
  headerEnd,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  title: string;
  description?: string;
  icon: ReactNode;
  headerAction?: ReactNode;
  headerEnd?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (collapsible) {
    return (
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
            <div className="flex min-w-0 gap-3">
              <span className="relative flex h-6 w-5 shrink-0 items-center justify-center">
                <span className="absolute flex size-5 items-center justify-center transition-opacity duration-150 group-hover:opacity-0 [&_svg]:size-5">
                  {icon}
                </span>
                <ChevronDown className="absolute size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-medium leading-6 text-foreground">{title}</h3>
                  {headerAction}
                </div>
                {description ? (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                ) : null}
              </div>
            </div>
          </CollapsibleTrigger>
          {headerEnd ? <div className="shrink-0 pt-0.5">{headerEnd}</div> : null}
        </div>
        <CollapsibleContent>
          <div className="space-y-4 border-t border-border px-6 py-5">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

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
    relayUrl,
    relaySecretKey,
    accessToken,
    accessTokenConfigured,
    computers,
    selectedServerId,
    relayWebSocketUrl,
    localServerId,
    setAccessToken,
    setAccessTokenConfigured,
    setRelayUrl,
    setComputers,
    setLocalServerId,
    setRelaySecretKey,
  } = useAtmosComputerStore();

  const [busy, setBusy] = useState<string | null>(null);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [relayUrlDraft, setRelayUrlDraft] = useState(relayUrl);
  const [relaySecretDraft, setRelaySecretDraft] = useState(relaySecretKey);
  const [tokenDraft, setTokenDraft] = useState(accessToken);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenReveal, setTokenReveal] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<LocalComputerStatus | null>(null);
  const [detailsComputer, setDetailsComputer] = useState<ComputerRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [remoteComputerExpanded, setRemoteComputerExpanded] = useState(false);
  const relayAutoSyncAttemptedRef = useRef(false);

  const hasBrowserKey = accessToken.trim().length >= 32;
  const hasConfiguredKey = hasBrowserKey || accessTokenConfigured;
  const activeComputers = computers.filter(c => !c.revoked);
  const connectedServerId =
    connectionMode === 'relay' && relayWebSocketUrl ? selectedServerId : null;

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

  const refreshComputerListFor = useCallback(async (
    token: string,
    url: string = relayUrl,
    secret: string = relaySecretKey,
  ) => {
    if (token.trim().length < 32 && !accessTokenConfigured) {
      return;
    }
    setListRefreshing(true);
    try {
      const res = await relayFetchWithAccessToken(url, token, '/v1/computers', undefined, secret);
      const data = (await res.json().catch(() => null)) as { computers?: ComputerRow[] } | null;
      if (res.ok && data?.computers) {
        setComputers(data.computers);
      }
    } finally {
      setListRefreshing(false);
    }
  }, [accessTokenConfigured, relayUrl, relaySecretKey, setComputers]);

  const refreshComputerList = useCallback(async () => {
    await refreshComputerListFor(accessToken, relayUrl);
  }, [accessToken, relayUrl, refreshComputerListFor]);

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
          description: 'This computer is available for Atmos Computer connections.',
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
    setRelayUrlDraft(relayUrl);
  }, [relayUrl]);

  useEffect(() => {
    setRelaySecretDraft(relaySecretKey);
  }, [relaySecretKey]);

  useEffect(() => {
    setTokenCopied(false);
  }, [tokenDraft]);

  useEffect(() => {
    void hydrateComputerClientSettingsFromDisk().then(() => {
      const settings = useAtmosComputerStore.getState();
      setTokenDraft(settings.accessToken);
      setRelayUrlDraft(settings.relayUrl);
      setRelaySecretDraft(settings.relaySecretKey);
    });
  }, []);

  useEffect(() => {
    void refreshLocalStatus();
  }, [refreshLocalStatus]);

  useEffect(() => {
    if (hasConfiguredKey) {
      void refreshComputerList();
    }
  }, [hasConfiguredKey, refreshComputerList]);

  /** After API restart, relay may still be connecting; sync once instead of showing a false offline state. */
  useEffect(() => {
    if (!hasConfiguredKey) {
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
  }, [hasConfiguredKey, localStatus, localServerId, refreshComputerList]);

  async function ensureAccessTokenReady(
    token: string,
    url: string = relayUrl,
    secret: string = relaySecretKey,
  ): Promise<boolean> {
    if (token.trim().length < 32) {
      toastManager.add({
        title: 'Access key is too short',
        description: 'Generate a new key or paste your saved one.',
        type: 'error',
      });
      return false;
    }
    const reg = await registerAccessTokenOnRelay(url, token, secret);
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

  async function onSaveRelaySettings({
    successTitle = 'Private Relay settings saved',
    urlDraft = relayUrlDraft,
    secretDraft = relaySecretDraft,
  }: {
    successTitle?: string;
    urlDraft?: string;
    secretDraft?: string;
  } = {}) {
    const nextUrl = resolveRelayUrl(urlDraft);
    const nextSecret = secretDraft.trim();
    setBusy('relay-settings');
    try {
      setRelayUrl(nextUrl);
      setRelaySecretKey(nextSecret);
      clearRemoteComputerRegisterTokenCache();
      const persisted = await saveComputerClientSettingsToDisk(
        accessToken,
        nextUrl,
        nextSecret,
      );
      toastManager.add({
        title: persisted ? successTitle : 'Saved for this session',
        description: persisted
          ? undefined
          : 'Could not save on this computer. Ensure Atmos is running locally.',
        type: persisted ? 'success' : 'warning',
      });
      await refreshComputerListFor(accessToken, nextUrl, nextSecret);
    } finally {
      setBusy(null);
    }
  }

  async function teardownLocalRelayIdentity() {
    setLocalServerId(null);
    setLocalStatus(prev =>
      prev
        ? {
            ...prev,
            registered: false,
            relay_connected: false,
            relay_last_error: null,
            server_id: null,
          }
        : prev,
    );
    setComputers([]);
    await activateCurrentLocalConnection().catch(() => undefined);
  }

  async function onSaveToken() {
    setBusy('token-save');
    try {
      const token = tokenDraft.trim();
      const nextUrl = resolveRelayUrl(relayUrlDraft);
      const nextSecret = relaySecretDraft.trim();
      const switchingIdentity = hasConfiguredKey && token !== accessToken.trim();
      if (!(await ensureAccessTokenReady(token, nextUrl, nextSecret))) {
        return;
      }
      let githubAutomationsMarked = 0;
      if (switchingIdentity) {
        try {
          await unregisterLocalComputer();
        } catch (err) {
          toastManager.add({
            title: 'Identity switch blocked',
            description:
              err instanceof Error
                ? `Could not stop the old local Relay identity: ${err.message}`
                : 'Could not stop the old local Relay identity. Try again.',
            type: 'error',
          });
          return;
        }

        try {
          githubAutomationsMarked =
            await automationApi.markActiveGithubAutomationsNeedsSetup();
        } catch (err) {
          await teardownLocalRelayIdentity();
          toastManager.add({
            title: 'Identity switch blocked',
            description:
              err instanceof Error
                ? `Old local Relay identity was stopped, but GitHub automations could not be marked for setup: ${err.message}`
                : 'Old local Relay identity was stopped, but GitHub automations could not be marked for setup. Try again.',
            type: 'error',
          });
          return;
        }

        await teardownLocalRelayIdentity();
      }
      setRelayUrl(nextUrl);
      setRelaySecretKey(nextSecret);
      setAccessToken(token);
      setAccessTokenConfigured(true);
      setTokenReveal(null);
      const persisted = await saveComputerClientSettingsToDisk(token, nextUrl, nextSecret);
      if (!persisted) {
        toastManager.add({
          title: switchingIdentity ? 'Identity switched for this session' : 'Saved for this session',
          description:
            'Could not save on this computer. Ensure Atmos is running locally.',
          type: 'warning',
        });
      } else {
        toastManager.add({
          title: switchingIdentity ? 'Identity switched' : 'Access key saved',
          description: switchingIdentity
            ? githubAutomationsMarked > 0
                ? `${githubAutomationsMarked} GitHub-triggered automation${githubAutomationsMarked === 1 ? '' : 's'} now need setup under this identity.`
                : 'Existing Computers and GitHub routes from the previous key stay with that key.'
            : undefined,
          type: 'success',
        });
      }
      await refreshComputerListFor(token, nextUrl, nextSecret);
    } finally {
      setBusy(null);
    }
  }

  async function onRotateToken() {
    const currentToken = accessToken.trim();
    if (currentToken.length < 32) {
      toastManager.add({
        title: 'Save your access key first',
        description: 'Rotation uses the current local access key as proof of ownership.',
        type: 'error',
      });
      return;
    }

    setBusy('token-rotate');
    try {
      const nextToken = generateAccessToken();
      const rotated = await rotateAccessTokenOnRelay(
        relayUrl,
        currentToken,
        nextToken,
        relaySecretKey,
      );
      if (!rotated.ok) {
        toastManager.add({
          title: 'Could not rotate access key',
          description: rotated.error ?? 'Try again.',
          type: 'error',
        });
        return;
      }

      const persisted = await saveComputerClientSettingsToDisk(
        nextToken,
        relayUrl,
        relaySecretKey,
      );
      setTokenDraft(nextToken);
      setAccessToken(nextToken);
      setAccessTokenConfigured(true);
      setTokenReveal(nextToken);
      void activateCurrentLocalConnection().catch(() => undefined);
      toastManager.add({
        title: 'Access key rotated',
        description: persisted
          ? 'Computers and GitHub routes stay on the same identity. Copy the new key now.'
          : 'Relay accepted the rotation, but Atmos could not save locally. Copy the new key now.',
        type: persisted ? 'success' : 'warning',
      });
      await refreshComputerListFor(nextToken, relayUrl);
    } finally {
      setBusy(null);
    }
  }

  async function onGenerateToken() {
    setBusy('token-generate');
    try {
      const token = generateAccessToken();
      const nextUrl = resolveRelayUrl(relayUrlDraft);
      const nextSecret = relaySecretDraft.trim();
      if (!(await ensureAccessTokenReady(token, nextUrl, nextSecret))) {
        return;
      }
      setRelayUrl(nextUrl);
      setRelaySecretKey(nextSecret);
      setTokenDraft(token);
      setAccessToken(token);
      setAccessTokenConfigured(true);
      setTokenReveal(token);
      const persisted = await saveComputerClientSettingsToDisk(token, nextUrl, nextSecret);
      toastManager.add({
        title: 'Access key created',
        description: persisted
          ? 'Saved on this computer. Copy it now — it will not be shown again.'
          : 'Copy it now — could not save on this computer. Ensure Atmos is running locally.',
        type: persisted ? 'success' : 'warning',
      });
      await refreshComputerListFor(token, nextUrl, nextSecret);
    } finally {
      setBusy(null);
    }
  }

  async function onRemoteToggle(enabled: boolean) {
    if (!hasConfiguredKey) {
      toastManager.add({
        title: 'Save your access key first',
        description: 'Add and save an access key before registering this computer.',
        type: 'error',
      });
      return;
    }

    setBusy('remote');
    try {
      if (enabled) {
        const displayName =
          localStatus?.computer_name ?? localStatus?.hostname ?? 'My Computer';

        const tokenRes = await relayFetchWithAccessToken(
          relayUrl,
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
          relayUrl,
          relaySecretKey,
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
          relay_url:
            prev?.relay_url ?? localStatus?.relay_url ?? relayUrl,
          relay_ws_url: prev?.relay_ws_url ?? localStatus?.relay_ws_url ?? null,
          shell_env: prev?.shell_env ?? localStatus?.shell_env,
        }));
        if (reg.relay_connected) {
          toastManager.add({
            title: 'Computer registration enabled',
            description: 'This computer is available for Atmos Computer connections.',
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
        await relayFetchWithAccessToken(
          relayUrl,
          accessToken,
          `/v1/computers/${encodeURIComponent(serverId)}/revoke`,
          { method: 'POST', body: '{}' },
        );
      }
      await unregisterLocalComputer();
      setLocalServerId(null);
      if (connectedServerId === serverId) {
        void activateCurrentLocalConnection().catch(() => undefined);
      }
      toastManager.add({
        title: 'Computer registration disabled',
        type: 'success',
      });
      await refreshLocalStatus();
      await refreshComputerList();
    } catch (err) {
      const description =
        err instanceof Error ? err.message : 'Ensure Atmos is running on this computer, then try again.';
      toastManager.add({
        title: enabled ? 'Could not register this computer' : 'Could not unregister',
        description,
        type: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  async function onConnect(serverId: string) {
    const isLocalMachine = serverId === (localStatus?.server_id ?? localServerId);
    if (isLocalMachine) {
      setBusy(`connect-${serverId}`);
      try {
        await activateCurrentLocalConnection();
        toastManager.add({ title: 'Using this computer locally', type: 'success' });
      } catch (err) {
        toastManager.add({
          title: 'Could not switch to local computer',
          description: err instanceof Error ? err.message : 'Try again.',
          type: 'error',
        });
      } finally {
        setBusy(null);
      }
      return;
    }
    if (!hasConfiguredKey) {
      toastManager.add({
        title: 'Save your access key first',
        description: 'Add and save an access key before connecting to another computer.',
        type: 'error',
      });
      return;
    }
    setBusy(`connect-${serverId}`);
    try {
      const session = await createHostedRemoteSession(relayUrl, accessToken, serverId);
      await activateHostedRemoteConnection(serverId, session);
      toastManager.add({ title: 'Connected', type: 'success' });
    } catch (err) {
      toastManager.add({
        title: 'Could not connect',
        description: err instanceof Error ? err.message : 'Try again.',
        type: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(serverId: string) {
    if (!hasConfiguredKey) {
      toastManager.add({
        title: 'Save your access key first',
        description: 'Add and save an access key before removing computers.',
        type: 'error',
      });
      return;
    }
    setBusy(`remove-${serverId}`);
    try {
      const res = await relayFetchWithAccessToken(
        relayUrl,
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
        void activateCurrentLocalConnection().catch(() => undefined);
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
  /** Local API is authoritative; relay `online` is a fallback while relay is reconnecting. */
  const isCurrentRelayReachable =
    Boolean(localStatus?.relay_connected) || Boolean(currentComputerRow?.online);
  const relayLastError = localStatus?.relay_last_error?.trim() || null;
  const showRelayReconnect = isLocalRegistered && !isCurrentRelayReachable;
  const currentDeviceName =
    localStatus?.computer_name?.trim() ||
    localStatus?.hostname?.replace(/\.local$/i, '') ||
    'This computer';
  const tokenDraftTrimmed = tokenDraft.trim();
  const tokenDraftChanged = tokenDraftTrimmed !== accessToken.trim();
  const relayUrlDraftResolved = resolveRelayUrl(relayUrlDraft);
  const relaySecretDraftTrimmed = relaySecretDraft.trim();
  const relayUrlChanged = relayUrlDraftResolved !== resolveRelayUrl(relayUrl);
  const relaySecretChanged = relaySecretDraftTrimmed !== relaySecretKey.trim();
  const isSwitchingIdentity =
    hasConfiguredKey && Boolean(tokenDraftTrimmed) && (!hasBrowserKey || tokenDraftChanged);
  const canSaveTokenDraft =
    Boolean(tokenDraftTrimmed) && (!hasConfiguredKey || !hasBrowserKey || tokenDraftChanged);
  const keyHiddenOnHostedWeb = hasConfiguredKey && !hasBrowserKey;

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
        title="Private Relay"
        icon={<Link2 className="size-5" />}
        description="Use the official relay by default, or point this app at a private relay."
        collapsible
        defaultOpen={false}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground" htmlFor="private-relay-url">
              Relay URL
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                id="private-relay-url"
                value={relayUrlDraft}
                onChange={e => setRelayUrlDraft(e.target.value)}
                placeholder="https://relay.atmos.land"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={busy !== null || !relayUrlChanged}
                onClick={() =>
                  void onSaveRelaySettings({
                    successTitle: 'Private Relay URL saved',
                    urlDraft: relayUrlDraft,
                    secretDraft: relaySecretKey,
                  })
                }
              >
                {busy === 'relay-settings' ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : null}
                Save
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground" htmlFor="private-relay-token">
              Token
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                id="private-relay-token"
                type="password"
                value={relaySecretDraft}
                onChange={e => setRelaySecretDraft(e.target.value)}
                placeholder="Required for private relay authentication"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={busy !== null || !relaySecretChanged}
                onClick={() =>
                  void onSaveRelaySettings({
                    successTitle: 'Private Relay token saved',
                    urlDraft: relayUrl,
                    secretDraft: relaySecretDraft,
                  })
                }
              >
                {busy === 'relay-settings' ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : null}
                Save
              </Button>
            </div>
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Leave Token empty for the official Atmos relay. Self-hosted relays can set{' '}
          <code className="rounded bg-muted px-1.5 py-0.5">RELAY_SECRET_KEY</code>{' '}
          and require this value on Relay requests.
        </p>
      </SettingsBlock>

      <SettingsBlock
        title="Access Key"
        icon={<KeyRound className="size-5" />}
        description="Your access key registers new Computers (via registration codes) and lists all Computers on your account."
        headerAction={
          !hasConfiguredKey ? (
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
          ) : null
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Input
                type="password"
                autoComplete="off"
                value={tokenDraft}
                onChange={e => setTokenDraft(e.target.value)}
                placeholder={
                  keyHiddenOnHostedWeb
                    ? 'Access key is saved on this Computer'
                    : 'Paste your access key or generate a new one'
                }
                className={keyHiddenOnHostedWeb ? undefined : 'pr-10'}
              />
              {keyHiddenOnHostedWeb ? null : (
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
              )}
            </div>
            <Button
              type="button"
              variant={isSwitchingIdentity ? 'secondary' : 'ghost'}
              className="shrink-0 px-3"
              disabled={busy !== null || !canSaveTokenDraft}
              onClick={() => void onSaveToken()}
            >
              {busy === 'token-save' ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : isSwitchingIdentity ? (
                'Switch Identity'
              ) : (
                'Save'
              )}
            </Button>
          </div>
          {isSwitchingIdentity || keyHiddenOnHostedWeb || !hasConfiguredKey ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {isSwitchingIdentity
                ? 'Switch Identity replaces the local key directly. Existing Computers and GitHub routes from the current key will not move.'
                : keyHiddenOnHostedWeb
                  ? 'An access key is saved on this Computer. Hosted web keeps it hidden; paste a new key only to replace it.'
                  : 'Generate or paste an access key to create or use an Atmos Computer identity.'}
            </p>
          ) : null}
        </div>
        {hasBrowserKey ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/15 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Rotate Access Token</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Use rotation when the Relay access token may be exposed or you want a security refresh.
                Existing Computers stay connected.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={busy !== null}
              onClick={() => void onRotateToken()}
            >
              {busy === 'token-rotate' ? (
                <LoaderCircle className="mr-2 size-4 animate-spin" />
              ) : (
                <RotateCw className="mr-2 size-4" />
              )}
              Rotate
            </Button>
          </div>
        ) : null}
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
              hasAccessToken={hasConfiguredKey}
              relayUrl={relayUrl}
              accessToken={accessToken}
              relaySecretKey={relaySecretKey}
              busy={busy !== null}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <SettingsBlock
        title="This Computer"
        icon={<Laptop className="size-5" />}
        description="Register this computer so other devices can connect to it."
      >
        <div className="min-w-0 space-y-3">
            <div className="space-y-2">
              <p className="text-base font-semibold tracking-tight text-foreground">
                {currentDeviceName}
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-muted/15 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Register This Computer</p>
                <p className="text-xs text-muted-foreground">
                  {isLocalRegistered
                    ? isCurrentRelayReachable
                      ? 'Online for Atmos Computer connections.'
                      : 'Connecting this computer…'
                    : 'Not registered — local use only on this computer.'}
                </p>
              </div>
              <Switch
                checked={isLocalRegistered}
                disabled={busy === 'remote' || !hasConfiguredKey}
                onCheckedChange={checked => void onRemoteToggle(checked)}
              />
            </div>
            {showRelayReconnect ? (
              <div className="space-y-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">Offline for Atmos Computer connections</p>
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
            {!hasConfiguredKey ? (
              <p className="text-xs text-muted-foreground">Save an access key above to register this computer.</p>
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
            disabled={!hasConfiguredKey || busy !== null}
            onClick={() => void refreshComputerList()}
          >
            <RotateCw className={cn('mr-2 size-4', listRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        }
      >
        {!hasConfiguredKey ? (
          <p className="text-sm text-muted-foreground">Save an access key to see your computers.</p>
        ) : activeComputers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No computers yet. Register this computer, or add another remote computer
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
