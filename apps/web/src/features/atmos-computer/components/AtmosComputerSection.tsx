'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
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
  ChevronDown,
  Computer,
  FlaskConical,
  Laptop,
  Link2,
  LoaderCircle,
  RotateCw,
  Server,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { getWebRelayClient } from '@/features/connection/lib/create-web-relay-client';
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
import { applyIdentityBearingComputerSettings } from '@/features/connection/lib/query-identity-lifecycle';
import { ensureLocalHubDevice } from '@/features/connection/lib/ensure-local-hub-device';
import {
  activeComputerRows,
  isCurrentLocalComputer,
} from '@/features/connection/lib/computer-list';
import { ComputerDetailsDialog } from '@/features/atmos-computer/components/ComputerDetailsDialog';
import { MobilePairQrPanel } from '@/features/atmos-computer/components/MobilePairQrPanel';
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
  const t = useTranslations("atmosComputer.section");
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
    setComputers,
    setLocalServerId,
  } = useAtmosComputerStore();

  const [busy, setBusy] = useState<string | null>(null);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [relayUrlDraft, setRelayUrlDraft] = useState(relayUrl);
  const [relaySecretDraft, setRelaySecretDraft] = useState(relaySecretKey);
  const [localStatus, setLocalStatus] = useState<LocalComputerStatus | null>(null);
  const [detailsComputer, setDetailsComputer] = useState<ComputerRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [remoteComputerExpanded, setRemoteComputerExpanded] = useState(false);
  const [accountSyncBusy, setAccountSyncBusy] = useState(false);
  const relayAutoSyncAttemptedRef = useRef(false);

  const hasConfiguredKey =
    accessToken.trim().length >= 32 || accessTokenConfigured;
  const activeComputers = activeComputerRows(computers);
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
      const computers = await getWebRelayClient({
        relayUrl: url,
        relaySecretKey: secret,
      })
        .withDeviceCredential(token)
        .listComputers();
      setComputers(computers);
    } catch {
      /* keep previous list on transient relay errors */
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
          title: t("toasts.remoteConnectionRestored"),
          description: t("toasts.computerAvailable"),
          type: 'success',
        });
      } else {
        toastManager.add({
          title: t("toasts.couldNotConnectRelay"),
          description:
            sync.relay_last_error ??
            t("toasts.ensureAtmosRunningThenRetry"),
          type: 'error',
        });
      }
    } catch (err) {
      const description =
        err instanceof Error ? err.message : t("toasts.ensureAtmosRunning");
      setLocalStatus(prev =>
        prev ? { ...prev, relay_connected: false, relay_last_error: description } : prev,
      );
      toastManager.add({
        title: t("toasts.couldNotConnectRelay"),
        description,
        type: 'error',
      });
    } finally {
      setBusy(null);
    }
  }, [refreshComputerList, t]);

  useEffect(() => {
    setRelayUrlDraft(relayUrl);
  }, [relayUrl]);

  useEffect(() => {
    setRelaySecretDraft(relaySecretKey);
  }, [relaySecretKey]);

  useEffect(() => {
    void hydrateComputerClientSettingsFromDisk().then(() => {
      const settings = useAtmosComputerStore.getState();
      setRelayUrlDraft(settings.relayUrl);
      setRelaySecretDraft(settings.relaySecretKey);
    });
  }, []);

  /** Device credential is Hub-minted on sign-in — never shown; sync silently from Account. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setAccountSyncBusy(true);
      try {
        await ensureLocalHubDevice();
      } finally {
        if (!cancelled) {
          setAccountSyncBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
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

  async function onSaveRelaySettings({
    successTitle = t("toasts.privateRelaySettingsSaved"),
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
      await applyIdentityBearingComputerSettings({
        relayUrl: nextUrl,
        relaySecretKey: nextSecret,
      });
      clearRemoteComputerRegisterTokenCache();
      const persisted = await saveComputerClientSettingsToDisk(
        accessToken,
        nextUrl,
        nextSecret,
      );
      toastManager.add({
        title: persisted ? successTitle : t("toasts.savedForSession"),
        description: persisted
          ? undefined
          : t("toasts.couldNotSaveLocally"),
        type: persisted ? 'success' : 'warning',
      });
      await refreshComputerListFor(accessToken, nextUrl, nextSecret);
    } finally {
      setBusy(null);
    }
  }

  async function onRemoteToggle(enabled: boolean) {
    if (!hasConfiguredKey) {
      toastManager.add({
        title: t("toasts.signInRequired"),
        description: t("toasts.signInBeforeRegistering"),
        type: 'error',
      });
      return;
    }

    setBusy('remote');
    try {
      if (enabled) {
        const displayName =
          localStatus?.computer_name ??
          localStatus?.hostname ??
          t("fallbacks.myComputer");

        let registerToken: string;
        try {
          const tokenData = await getWebRelayClient({ relayUrl, relaySecretKey })
            .withDeviceCredential(accessToken)
            .createRegisterToken();
          registerToken = tokenData.register_token;
        } catch (err) {
          toastManager.add({
            title: t("toasts.couldNotStartRegistration"),
            description: err instanceof Error ? err.message : t("toasts.tryAgain"),
            type: 'error',
          });
          return;
        }

        const reg = await registerLocalComputer(
          registerToken,
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
            title: t("toasts.computerRegistrationEnabled"),
            description: t("toasts.computerAvailable"),
            type: 'success',
          });
        } else {
          toastManager.add({
            title: t("toasts.registeredNotYetOnline"),
            description:
              reg.relay_last_error ??
              t("toasts.useReconnectAfterNetworkCheck"),
            type: 'error',
          });
        }
        await refreshLocalStatus();
        await refreshComputerList();
        return;
      }

      const serverId = localStatus?.server_id ?? localServerId;
      if (serverId) {
        await getWebRelayClient({ relayUrl, relaySecretKey })
          .withDeviceCredential(accessToken)
          .revokeComputer(serverId)
          .catch(() => undefined);
      }
      await unregisterLocalComputer();
      setLocalServerId(null);
      if (connectedServerId === serverId) {
        void activateCurrentLocalConnection().catch(() => undefined);
      }
      toastManager.add({
        title: t("toasts.computerRegistrationDisabled"),
        type: 'success',
      });
      await refreshLocalStatus();
      await refreshComputerList();
    } catch (err) {
      const description =
        err instanceof Error ? err.message : t("toasts.ensureAtmosRunningThenRetry");
      toastManager.add({
        title: enabled ? t("toasts.couldNotRegisterThisComputer") : t("toasts.couldNotUnregister"),
        description,
        type: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  async function switchToLocalConnection(busyKey: string) {
    setBusy(busyKey);
    try {
      await activateCurrentLocalConnection();
      toastManager.add({ title: t("toasts.usingThisComputerLocally"), type: 'success' });
    } catch (err) {
      toastManager.add({
        title: t("toasts.couldNotSwitchToLocalComputer"),
        description: err instanceof Error ? err.message : t("toasts.tryAgain"),
        type: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  async function onConnect(serverId: string) {
    const isLocalMachine = serverId === (localStatus?.server_id ?? localServerId);
    if (isLocalMachine) {
      await switchToLocalConnection(`connect-${serverId}`);
      return;
    }
    if (!hasConfiguredKey) {
      toastManager.add({
        title: t("toasts.signInRequired"),
        description: t("toasts.signInBeforeConnecting"),
        type: 'error',
      });
      return;
    }
    setBusy(`connect-${serverId}`);
    try {
      const session = await createHostedRemoteSession(relayUrl, accessToken, serverId);
      await activateHostedRemoteConnection(serverId, session);
      toastManager.add({ title: t("toasts.connected"), type: 'success' });
    } catch (err) {
      toastManager.add({
        title: t("toasts.couldNotConnect"),
        description: err instanceof Error ? err.message : t("toasts.tryAgain"),
        type: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(serverId: string) {
    if (!hasConfiguredKey) {
      toastManager.add({
        title: t("toasts.signInRequired"),
        description: t("toasts.signInBeforeRemoving"),
        type: 'error',
      });
      return;
    }
    setBusy(`remove-${serverId}`);
    try {
      try {
        await getWebRelayClient({ relayUrl, relaySecretKey })
          .withDeviceCredential(accessToken)
          .revokeComputer(serverId);
      } catch {
        toastManager.add({ title: t("toasts.couldNotRemove"), type: 'error' });
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
      toastManager.add({ title: t("toasts.computerRemoved"), type: 'success' });
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
    t("fallbacks.thisComputer");
  const relayUrlDraftResolved = resolveRelayUrl(relayUrlDraft);
  const relaySecretDraftTrimmed = relaySecretDraft.trim();
  const relayUrlChanged = relayUrlDraftResolved !== resolveRelayUrl(relayUrl);
  const relaySecretChanged = relaySecretDraftTrimmed !== relaySecretKey.trim();

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

      {!hasConfiguredKey ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-muted/15 px-6 py-5">
          <p className="text-sm font-medium text-foreground">{t("panels.accountRequired.title")}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {accountSyncBusy
              ? t("panels.accountRequired.syncing")
              : t("panels.accountRequired.description")}
          </p>
        </div>
      ) : null}

      <SettingsBlock
        title={t("panels.mobilePair.title")}
        icon={<Smartphone className="size-5" />}
        description={t("panels.mobilePair.description")}
        collapsible
        defaultOpen={false}
      >
        <MobilePairQrPanel enabled={hasConfiguredKey} />
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
                <p className="text-base font-medium leading-6 text-foreground">{t("panels.registerComputer.title")}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t("panels.registerComputer.description")}
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
        title={t("panels.thisComputer.title")}
        icon={<Laptop className="size-5" />}
        description={t("panels.thisComputer.description")}
      >
        <div className="min-w-0 space-y-3">
            <div className="space-y-2">
              <p className="text-base font-semibold tracking-tight text-foreground">
                {currentDeviceName}
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-muted/15 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{t("panels.thisComputer.registerTitle")}</p>
                <p className="text-xs text-muted-foreground">
                  {isLocalRegistered
                    ? isCurrentRelayReachable
                      ? t("panels.thisComputer.status.online")
                      : t("panels.thisComputer.status.connecting")
                    : t("panels.thisComputer.status.notRegistered")}
                </p>
              </div>
              <Switch
                checked={isLocalRegistered}
                disabled={busy === 'remote' || !hasConfiguredKey}
                onCheckedChange={checked => void onRemoteToggle(checked)}
              />
            </div>
            {connectionMode === 'relay' ? (
              <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/15 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t("panels.thisComputer.useLocalTitle")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("panels.thisComputer.useLocalDescription")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  disabled={busy !== null}
                  onClick={() => void switchToLocalConnection('local-switch')}
                >
                  {busy === 'local-switch' ? (
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Laptop className="mr-2 size-4" />
                  )}
                  {t("panels.thisComputer.useLocalButton")}
                </Button>
              </div>
            ) : null}
            {showRelayReconnect ? (
              <div className="space-y-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{t("panels.thisComputer.reconnectTitle")}</p>
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
                    {t("panels.thisComputer.reconnectButton")}
                  </Button>
                </div>
                {relayLastError ? (
                  <p className="text-xs leading-5 text-destructive">{relayLastError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("panels.thisComputer.reconnectHelper")}
                  </p>
                )}
              </div>
            ) : null}
            {!hasConfiguredKey ? (
              <p className="text-xs text-muted-foreground">{t("panels.thisComputer.signInPrompt")}</p>
            ) : null}
        </div>
      </SettingsBlock>

      <SettingsBlock
        title={t("panels.myComputers.title")}
        icon={<Computer className="size-5" />}
        description={t("panels.myComputers.description")}
        headerEnd={
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasConfiguredKey || busy !== null}
            onClick={() => void refreshComputerList()}
          >
            <RotateCw className={cn('mr-2 size-4', listRefreshing && 'animate-spin')} />
            {t("panels.myComputers.refresh")}
          </Button>
        }
      >
        {!hasConfiguredKey ? (
          <p className="text-sm text-muted-foreground">{t("panels.myComputers.signInPrompt")}</p>
        ) : activeComputers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("panels.myComputers.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {activeComputers.map(c => {
              const isCurrent = isCurrentLocalComputer(c, currentServerId);
              const isUsingLocal = isCurrent && connectionMode === 'local';
              const isConnected = !isCurrent && connectedServerId === c.server_id;
              const relayReachable = isCurrent
                ? isCurrentRelayReachable
                : Boolean(c.online);
              const name = (c.display_name ?? t("panels.myComputers.fallbackName")).slice(0, 64);
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
                          {t("panels.myComputers.current")}
                        </Badge>
                      ) : null}
                      {isConnected ? (
                        <Badge className="bg-primary/15 text-xs text-primary">{t("panels.myComputers.connected")}</Badge>
                      ) : null}
                      <span
                        className={cn(
                          'text-xs',
                          relayReachable
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-muted-foreground',
                        )}
                      >
                        {relayReachable ? t("panels.myComputers.online") : t("panels.myComputers.offline")}
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
                            {t("panels.myComputers.reconnect")}
                          </>
                        )}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant={isConnected || isUsingLocal ? 'secondary' : 'default'}
                      disabled={
                        busy !== null ||
                        isConnected ||
                        isUsingLocal
                      }
                      onClick={() => void onConnect(c.server_id)}
                    >
                      {busy === `connect-${c.server_id}` ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : isCurrent ? (
                        t("panels.myComputers.useLocally")
                      ) : isConnected ? (
                        t("panels.myComputers.inUse")
                      ) : (
                        t("panels.myComputers.connect")
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
                      {t("panels.myComputers.details")}
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

      <SettingsBlock
        title={t("panels.privateRelay.title")}
        icon={<Link2 className="size-5" />}
        description={t("panels.privateRelay.description")}
        collapsible
        defaultOpen={false}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground" htmlFor="private-relay-url">
              {t("panels.privateRelay.urlLabel")}
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                id="private-relay-url"
                value={relayUrlDraft}
                onChange={e => setRelayUrlDraft(e.target.value)}
                placeholder={t("panels.privateRelay.urlPlaceholder")}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={busy !== null || !relayUrlChanged}
                onClick={() =>
                  void onSaveRelaySettings({
                    successTitle: t("panels.privateRelay.urlSaved"),
                    urlDraft: relayUrlDraft,
                    secretDraft: relaySecretKey,
                  })
                }
              >
                {busy === 'relay-settings' ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : null}
                {t("panels.privateRelay.save")}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground" htmlFor="private-relay-token">
              {t("panels.privateRelay.tokenLabel")}
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                id="private-relay-token"
                type="password"
                value={relaySecretDraft}
                onChange={e => setRelaySecretDraft(e.target.value)}
                placeholder={t("panels.privateRelay.tokenPlaceholder")}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={busy !== null || !relaySecretChanged}
                onClick={() =>
                  void onSaveRelaySettings({
                    successTitle: t("panels.privateRelay.tokenSaved"),
                    urlDraft: relayUrl,
                    secretDraft: relaySecretDraft,
                  })
                }
              >
                {busy === 'relay-settings' ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : null}
                {t("panels.privateRelay.save")}
              </Button>
            </div>
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {t("panels.privateRelay.footerPrefix")}{' '}
          <code className="rounded bg-muted px-1.5 py-0.5">RELAY_SECRET_KEY</code>{' '}
          {t("panels.privateRelay.footerSuffix")}
        </p>
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
