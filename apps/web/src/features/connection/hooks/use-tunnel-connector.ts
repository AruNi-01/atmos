'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { debugLog, errorLog } from '@/shared/lib/desktop-logger';
import {
  desktopInvoke,
  desktopListen,
  isDesktopRuntime,
} from '@/shared/lib/desktop-bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderKind = 'tailscale' | 'cloudflare' | 'ngrok';

export type ProviderAccessMode = 'private' | 'public';

export type ProviderStatusState = 'Unavailable' | 'Idle' | 'Running' | 'Error';

export type ProviderStatus = {
  state: ProviderStatusState;
  public_url: string | null;
  message: string | null;
  started_at: string | null;
};

export type ProviderDiagnostics = {
  provider: ProviderKind;
  binary_found: boolean;
  daemon_running: boolean | null;
  logged_in: boolean;
  warnings: string[];
  last_error: string | null;
  logs: { at: string; level: string; message: string }[];
};

export type TunnelConnectorStatus = {
  gateway_url: string | null;
  public_url: string | null;
  share_url: string | null;
  provider: ProviderKind | null;
  provider_status: ProviderStatus;
  entry_token: string | null;
  expires_at: string | null;
};

// Map of provider kind → its active status (only contains running providers).
export type TunnelConnectorStatusMap = Partial<Record<ProviderKind, TunnelConnectorStatus>>;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTunnelConnector(enabled = true) {
  // Re-check shell after mount (Electron preload can race first render).
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const refresh = () => setIsDesktop(isDesktopRuntime());
    refresh();
    const t = window.setTimeout(refresh, 100);
    return () => window.clearTimeout(t);
  }, []);
  const isActive = isDesktop && enabled;

  const [statusMap, setStatusMap] = useState<TunnelConnectorStatusMap>({});
  const [providers, setProviders] = useState<ProviderDiagnostics[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Per-provider loading states
  const [startingProviders, setStartingProviders] = useState<Set<ProviderKind>>(new Set());
  const [stoppingProviders, setStoppingProviders] = useState<Set<ProviderKind>>(new Set());

  const refreshStatus = useCallback(async () => {
    if (!isDesktop) return;
    try {
      const result = await desktopInvoke<Record<string, TunnelConnectorStatus | null | undefined>>(
        'tunnel_connector_status',
      );
      // Drop incomplete entries (missing provider_status) so Header filters
      // never read `.state` on undefined — Electron once returned a flatter shape.
      const next: TunnelConnectorStatusMap = {};
      for (const [key, value] of Object.entries(result ?? {})) {
        if (value && value.provider_status && typeof value.provider_status.state === 'string') {
          next[key as ProviderKind] = value;
        }
      }
      setStatusMap(next);
    } catch (err) {
      errorLog(`[tunnel-connector] refreshStatus failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [isDesktop]);

  const detect = useCallback(async () => {
    if (!isDesktop) return;
    setIsLoading(true);
    try {
      const result = await desktopInvoke<{ providers: ProviderDiagnostics[] }>('tunnel_connector_detect');
      setProviders(result.providers);
    } catch (err) {
      errorLog(`[tunnel-connector] detect failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [isDesktop]);

  const start = useCallback(
    async (
      provider: ProviderKind,
      mode?: ProviderAccessMode,
      targetBaseUrl?: string,
      ttlSecs?: number,
    ): Promise<TunnelConnectorStatus | undefined> => {
      if (!isDesktop) return undefined;
      setStartingProviders((prev) => new Set(prev).add(provider));
      try {
        const payload = {
          req: { provider, mode, target_base_url: targetBaseUrl, ttl_secs: ttlSecs },
        };
        debugLog(`[tunnel-connector] start: ${JSON.stringify(payload)}`);
        const result = await Promise.race([
          desktopInvoke<TunnelConnectorStatus>('tunnel_connector_start', payload),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Start tunnel timed out after 30s')), 30_000),
          ),
        ]);
        debugLog(`[tunnel-connector] start ok: provider=${result.provider} url=${result.public_url}`);
        setStatusMap((prev) => ({ ...prev, [provider]: result }));
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errorLog(`[tunnel-connector] start failed: ${msg}`);
        throw err;
      } finally {
        setStartingProviders((prev) => {
          const next = new Set(prev);
          next.delete(provider);
          return next;
        });
      }
    },
    [isDesktop],
  );

  const stop = useCallback(
    async (provider: ProviderKind) => {
      if (!isDesktop) return;
      setStoppingProviders((prev) => new Set(prev).add(provider));
      try {
        await desktopInvoke('tunnel_connector_stop', { req: { provider } });
        setStatusMap((prev) => {
          const next = { ...prev };
          delete next[provider];
          return next;
        });
      } catch (err) {
        errorLog(`[tunnel-connector] stop failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setStoppingProviders((prev) => {
          const next = new Set(prev);
          next.delete(provider);
          return next;
        });
      }
    },
    [isDesktop],
  );

  const renew = useCallback(
    async (
      provider: ProviderKind,
      ttlSecs?: number,
      reuseToken?: boolean,
    ): Promise<TunnelConnectorStatus | undefined> => {
      if (!isDesktop) return undefined;
      try {
        const result = await desktopInvoke<TunnelConnectorStatus>('tunnel_connector_renew', {
          req: { provider, ttl_secs: ttlSecs, reuse_token: reuseToken ?? true },
        });
        setStatusMap((prev) => ({ ...prev, [provider]: result }));
        return result;
      } catch (err) {
        errorLog(`[tunnel-connector] renew failed: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
    },
    [isDesktop],
  );

  const recover = useCallback(async () => {
    if (!isDesktop) return;
    setIsLoading(true);
    try {
      const result = await desktopInvoke<Record<string, TunnelConnectorStatus>>('tunnel_connector_recover');
      if (result && Object.keys(result).length > 0) {
        setStatusMap(result as TunnelConnectorStatusMap);
      }
    } catch (err) {
      errorLog(`[tunnel-connector] recover failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [isDesktop]);

  const getProviderGuide = useCallback(
    async (provider: ProviderKind): Promise<string[]> => {
      if (!isDesktop) return [];
      try {
        return await desktopInvoke<string[]>('tunnel_connector_provider_guide', { provider });
      } catch (err) {
        errorLog(`[tunnel-connector] getProviderGuide failed: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    },
    [isDesktop],
  );

  const saveCredential = useCallback(
    async (provider: ProviderKind, credential: string) => {
      if (!isDesktop) return;
      try {
        await desktopInvoke('tunnel_connector_save_credential', { req: { provider, credential } });
      } catch (err) {
        errorLog(`[tunnel-connector] saveCredential failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [isDesktop],
  );

  const clearCredential = useCallback(
    async (provider: ProviderKind) => {
      if (!isDesktop) return;
      try {
        await desktopInvoke('tunnel_connector_clear_credential', { provider });
      } catch (err) {
        errorLog(`[tunnel-connector] clearCredential failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [isDesktop],
  );

  useEffect(() => {
    if (!isActive) return;
    void refreshStatus();
  }, [isActive, refreshStatus]);

  // Listen for startup recovery event from the desktop shell.
  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void desktopListen('tunnel-connector-recovered', (payload) => {
      if (
        payload &&
        typeof payload === 'object' &&
        Object.keys(payload as object).length > 0
      ) {
        setStatusMap(payload as TunnelConnectorStatusMap);
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [isActive]);

  return {
    statusMap,
    providers,
    isLoading,
    startingProviders,
    stoppingProviders,
    isDesktop,
    refreshStatus,
    detect,
    start,
    stop,
    renew,
    recover,
    getProviderGuide,
    saveCredential,
    clearCredential,
  };
}
