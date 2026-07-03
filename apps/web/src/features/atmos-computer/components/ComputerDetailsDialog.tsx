'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@workspace/ui';
import {
  systemApi,
  type GhCliStatusResponse,
  type RuntimeInfoResponse,
  type TerminalOverviewResponse,
} from '@/api/rest-api';
import {
  fetchRelayGhCliStatus,
  fetchRelayRuntimeInfo,
  fetchRelayTerminalOverview,
} from '@/api/relay';
import type { ComputerRow } from '@/features/connection/lib/atmos-computer-store';
import { fetchLocalComputerStatus } from '@/features/connection/lib/atmos-computer-local';
import { useAtmosComputerStore } from '@/features/connection/lib/atmos-computer-store';
import {
  formatRegistrationVia,
  registrationMetaFromRecord,
} from '@/features/connection/lib/registration-meta';

function formatTime(epochSec: number | null | undefined, locale: string): string {
  if (!epochSec) {
    return '—';
  }
  return new Date(epochSec * 1000).toLocaleString(locale);
}

function formatIsoTime(iso: string | null | undefined, locale: string): string {
  if (!iso?.trim()) {
    return '—';
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale);
}

function formatUptime(secs: number | null | undefined): string {
  if (secs == null || secs < 0) {
    return '—';
  }
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  if (m > 0) {
    return `${m}m`;
  }
  return `${secs}s`;
}

function formatGhCliInstallation(
  status: GhCliStatusResponse | null,
  t: ReturnType<typeof useTranslations>,
): string {
  if (!status) {
    return t('common.empty');
  }
  if (!status.installed) {
    return t('githubCli.notInstalled');
  }
  return status.version
    ? t('githubCli.installedWithVersion', { version: status.version })
    : t('githubCli.installed');
}

function formatGhCliAuthentication(
  status: GhCliStatusResponse | null,
  t: ReturnType<typeof useTranslations>,
): string {
  if (!status?.installed) {
    return t('common.empty');
  }
  if (status.authenticated) {
    return status.username
      ? t('githubCli.authenticatedAs', { username: status.username })
      : t('githubCli.authenticated');
  }
  return t('githubCli.notAuthenticated');
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-right text-foreground [&>*]:min-w-0 [&>*]:truncate">
        {value}
      </dd>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <dl className="space-y-2">{children}</dl>
    </section>
  );
}

function canFetchLiveDetails(
  computer: ComputerRow,
  isCurrent: boolean,
): 'local' | 'relay' | false {
  if (isCurrent) {
    return 'local';
  }
  const { connectionMode, relayGatewayHttpBase, relayClientToken, selectedServerId } =
    useAtmosComputerStore.getState();
  if (
    connectionMode === 'relay' &&
    relayGatewayHttpBase &&
    relayClientToken &&
    selectedServerId === computer.server_id
  ) {
    return 'relay';
  }
  return false;
}

function RuntimeTabContent({ runtimeInfo }: { runtimeInfo: RuntimeInfoResponse }) {
  const t = useTranslations('atmosComputer.detailsDialog');
  const locale = useLocale();
  const manifest = runtimeInfo.runtime_manifest;
  const relay = runtimeInfo.relay;

  return (
    <div className="space-y-3">
      <DetailSection title={t('runtimeManifest.title')}>
        {manifest ? (
          <>
            <DetailRow label={t('runtimeManifest.source')} value={manifest.source} />
            <DetailRow label={t('runtimeManifest.started')} value={formatIsoTime(manifest.started_at, locale)} />
            <DetailRow
              label={t('runtimeManifest.apiUrl')}
              value={<span className="font-mono text-xs">{manifest.api_url}</span>}
            />
            <DetailRow
              label={t('runtimeManifest.wsUrl')}
              value={<span className="font-mono text-xs">{manifest.ws_url}</span>}
            />
            {manifest.pid != null ? (
              <DetailRow
                label={t('runtimeManifest.apiProcess')}
                value={t('runtimeManifest.pid', { pid: manifest.pid })}
              />
            ) : null}
          </>
        ) : null}
      </DetailSection>

      {relay ? (
        <DetailSection title={t('relay.title')}>
          <DetailRow
            label={t('relay.registration')}
            value={relay.registered ? t('relay.registered') : t('relay.notRegistered')}
          />
          {relay.server_id ? (
            <DetailRow
              label={t('overview.serverId')}
              value={<span className="font-mono text-xs">{relay.server_id}</span>}
            />
          ) : null}
          {relay.relay_url ? (
            <DetailRow
              label={t('relay.address')}
              value={<span className="font-mono text-xs">{relay.relay_url}</span>}
            />
          ) : null}
          <DetailRow
            label={t('relay.connection')}
            value={relay.connected ? t('relay.connected') : t('relay.disconnected')}
          />
        </DetailSection>
      ) : null}
    </div>
  );
}

function HostTabContent({
  overview,
  ghCliStatus,
}: {
  overview: TerminalOverviewResponse | null;
  ghCliStatus: GhCliStatusResponse | null;
}) {
  const t = useTranslations('atmosComputer.detailsDialog');
  const shell = overview?.shell_env;
  const tmux = overview?.tmux;
  const tmuxServer = overview?.tmux_server;

  const showTmux = Boolean(tmux?.installed || tmuxServer?.running);

  return (
    <div className="space-y-3">
      {shell ? (
        <DetailSection title={t('host.systemTitle')}>
          <DetailRow
            label={t('host.os')}
            value={[shell.os, shell.arch, shell.os_version].filter(Boolean).join(' · ') || t('common.empty')}
          />
          <DetailRow label={t('host.user')} value={shell.user || t('common.empty')} />
          <DetailRow label={t('host.shell')} value={shell.shell || t('common.empty')} />
        </DetailSection>
      ) : null}

      {ghCliStatus ? (
        <DetailSection title={t('githubCli.title')}>
          <DetailRow
            label={t('githubCli.installation')}
            value={formatGhCliInstallation(ghCliStatus, t)}
          />
          <DetailRow
            label={t('githubCli.authentication')}
            value={formatGhCliAuthentication(ghCliStatus, t)}
          />
        </DetailSection>
      ) : null}

      {showTmux ? (
        <DetailSection title={t('tmux.title')}>
          {tmux ? (
            <>
              <DetailRow
                label={t('tmux.installation')}
                value={
                  tmux.installed
                    ? tmux.version
                      ? t('tmux.installedWithVersion', { version: tmux.version })
                      : t('tmux.installed')
                    : t('tmux.notInstalled')
                }
              />
              {tmux.installed ? (
                <DetailRow label={t('tmux.sessions')} value={tmux.session_count} />
              ) : null}
            </>
          ) : null}
          {tmuxServer?.running ? (
            <>
              <DetailRow label={t('tmux.serverUptime')} value={formatUptime(tmuxServer.uptime_secs)} />
              <DetailRow label={t('tmux.windows')} value={tmuxServer.total_windows} />
            </>
          ) : null}
        </DetailSection>
      ) : null}
    </div>
  );
}

export function ComputerDetailsDialog({
  open,
  onOpenChange,
  computer,
  isCurrent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  computer: ComputerRow | null;
  isCurrent: boolean;
}) {
  const t = useTranslations('atmosComputer.detailsDialog');
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<TerminalOverviewResponse | null>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfoResponse | null>(null);
  const [ghCliStatus, setGhCliStatus] = useState<GhCliStatusResponse | null>(null);
  const [displayHostname, setDisplayHostname] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveTab, setLiveTab] = useState<'runtime' | 'host'>('runtime');

  useEffect(() => {
    if (!open || !computer) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOverview(null);
    setRuntimeInfo(null);
    setGhCliStatus(null);
    setDisplayHostname(null);
    setLiveTab('runtime');

    void (async () => {
      try {
        const mode = canFetchLiveDetails(computer, isCurrent);
        if (mode === 'local') {
          const status = await fetchLocalComputerStatus();
          if (cancelled) {
            return;
          }
          setDisplayHostname(
            status?.computer_name ??
              status?.hostname ??
              status?.shell_env?.hostname ??
              null,
          );
          const [overviewData, runtimeData, ghStatus] = await Promise.all([
            systemApi.getTerminalOverview(),
            systemApi.getRuntimeInfo(),
            systemApi.getGhCliStatus(),
          ]);
          if (!cancelled) {
            setOverview(overviewData);
            setRuntimeInfo(runtimeData);
            setGhCliStatus(ghStatus);
            setLiveTab(runtimeData ? 'runtime' : 'host');
          }
          return;
        }

        if (mode === 'relay') {
          const { relayGatewayHttpBase, relayClientToken } = useAtmosComputerStore.getState();
          if (!relayGatewayHttpBase || !relayClientToken) {
            return;
          }
          const [overviewData, runtimeData, ghStatus] = await Promise.all([
            fetchRelayTerminalOverview(relayGatewayHttpBase, relayClientToken),
            fetchRelayRuntimeInfo(relayGatewayHttpBase, relayClientToken),
            fetchRelayGhCliStatus(relayGatewayHttpBase, relayClientToken),
          ]);
          if (!cancelled) {
            setOverview(overviewData);
            setRuntimeInfo(runtimeData);
            setGhCliStatus(ghStatus);
            setDisplayHostname(overviewData.shell_env?.hostname ?? null);
            setLiveTab(runtimeData ? 'runtime' : 'host');
          }
          return;
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, computer, isCurrent]);

  if (!computer) {
    return null;
  }

  const name = (computer.display_name ?? t('common.computer')).slice(0, 64);
  const registrationMeta =
    registrationMetaFromRecord(computer.registration_meta) ??
    registrationMetaFromRecord(
      runtimeInfo?.registration_meta as Record<string, unknown> | undefined,
    );
  const hasLiveData = Boolean(overview || runtimeInfo || ghCliStatus);
  const showRuntimeTab = Boolean(runtimeInfo);
  const showHostTab = Boolean(overview || ghCliStatus);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            {isCurrent ? t('overview.thisComputer') : t('overview.remoteComputer')} ·{' '}
            {computer.online ? t('overview.online') : t('overview.offline')}
          </DialogDescription>
        </DialogHeader>

        <DetailSection title={t('overview.title')}>
          <DetailRow
            label={t('overview.serverId')}
            value={<span className="font-mono text-xs">{computer.server_id}</span>}
          />
          <DetailRow label={t('overview.added')} value={formatTime(computer.created_at, locale)} />
          <DetailRow label={t('overview.lastSeen')} value={formatTime(computer.last_seen_at ?? null, locale)} />
          {displayHostname ? <DetailRow label={t('overview.hostname')} value={displayHostname} /> : null}
          {registrationMeta ? (
            <>
              <DetailRow
                label={t('overview.registeredVia')}
                value={formatRegistrationVia(registrationMeta.via)}
              />
              {registrationMeta.version ? (
                <DetailRow label={t('overview.clientVersion')} value={registrationMeta.version} />
              ) : null}
            </>
          ) : null}
        </DetailSection>

        {loading ? (
          <div className="space-y-2 pt-2">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-muted-foreground">
            {t('messages.liveDetailsUnavailable')}
          </p>
        ) : null}

        {!loading && !hasLiveData && !error ? (
          <p className="text-sm text-muted-foreground">
            {t('messages.connectToViewStats')}
          </p>
        ) : null}

        {!loading && hasLiveData && (showRuntimeTab || showHostTab) ? (
          <Tabs
            value={liveTab}
            onValueChange={(value) => setLiveTab(value as 'runtime' | 'host')}
            className="pt-1"
          >
            <TabsList
              className="grid w-full"
              style={{ gridTemplateColumns: `repeat(${showRuntimeTab && showHostTab ? 2 : 1}, minmax(0, 1fr))` }}
            >
              {showRuntimeTab ? (
                <TabsTrigger value="runtime">{t('tabs.runtime')}</TabsTrigger>
              ) : null}
              {showHostTab ? (
                <TabsTrigger value="host">{t('tabs.host')}</TabsTrigger>
              ) : null}
            </TabsList>

            {showRuntimeTab ? (
              <TabsContent value="runtime" className="mt-3 space-y-3">
                {runtimeInfo ? <RuntimeTabContent runtimeInfo={runtimeInfo} /> : null}
              </TabsContent>
            ) : null}

            {showHostTab ? (
              <TabsContent value="host" className="mt-3 space-y-3">
                <HostTabContent overview={overview} ghCliStatus={ghCliStatus} />
              </TabsContent>
            ) : null}
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
