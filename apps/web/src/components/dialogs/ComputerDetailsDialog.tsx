'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Skeleton,
} from '@workspace/ui';
import { systemApi, type TerminalOverviewResponse } from '@/api/rest-api';
import { fetchRelayTerminalOverview } from '@/api/relay';
import type { ComputerRow } from '@/lib/atmos-computer-store';
import { fetchLocalComputerStatus } from '@/lib/atmos-computer-local';
import { useAtmosComputerStore } from '@/lib/atmos-computer-store';

function formatTime(epochSec: number | null | undefined): string {
  if (!epochSec) {
    return '—';
  }
  return new Date(epochSec * 1000).toLocaleString();
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
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<TerminalOverviewResponse | null>(null);
  const [localHost, setLocalHost] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !computer) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOverview(null);

    void (async () => {
      try {
        if (isCurrent) {
          const status = await fetchLocalComputerStatus();
          if (cancelled) {
            return;
          }
          setLocalHost(status.hostname ?? status.shell_env?.hostname ?? null);
          const data = await systemApi.getTerminalOverview();
          if (!cancelled) {
            setOverview(data);
          }
          return;
        }

        const { connectionMode, relayGatewayHttpBase, relayClientToken, selectedServerId } =
          useAtmosComputerStore.getState();
        if (
          connectionMode === 'relay' &&
          relayGatewayHttpBase &&
          relayClientToken &&
          selectedServerId === computer.server_id
        ) {
          const data = await fetchRelayTerminalOverview(
            relayGatewayHttpBase,
            relayClientToken,
          );
          if (!cancelled) {
            setOverview(data);
          }
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

  const name = (computer.display_name ?? 'Computer').slice(0, 64);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            {isCurrent ? 'This device' : 'Remote computer'} ·{' '}
            {computer.online ? 'Online' : 'Offline'}
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">ID</dt>
            <dd className="mt-0.5 break-all font-mono text-xs">{computer.server_id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Added</dt>
            <dd className="mt-0.5">{formatTime(computer.created_at)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last seen</dt>
            <dd className="mt-0.5">{formatTime(computer.last_seen_at ?? null)}</dd>
          </div>
          {localHost ? (
            <div>
              <dt className="text-muted-foreground">Hostname</dt>
              <dd className="mt-0.5">{localHost}</dd>
            </div>
          ) : null}
        </dl>

        {loading ? (
          <div className="space-y-2 pt-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-muted-foreground">
            Runtime details unavailable. Connect to this computer to see live stats.
          </p>
        ) : null}

        {overview ? (
          <div className="mt-4 space-y-2 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">Runtime</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>Active sessions: {overview.active_session_count}</li>
              <li>WebSocket clients: {overview.ws_connection_count}</li>
              <li>
                OS: {overview.shell_env?.os ?? '—'} {overview.shell_env?.arch ?? ''}
              </li>
              <li>User: {overview.shell_env?.user ?? '—'}</li>
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
