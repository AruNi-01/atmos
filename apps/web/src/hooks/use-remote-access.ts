'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { debugLog, errorLog } from '@/lib/desktop-logger';
import { isTauriRuntime } from '@/lib/desktop-runtime';

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

export type RemoteAccessStatus = {
  gateway_url: string | null;
  public_url: string | null;
  share_url: string | null;
  provider: ProviderKind | null;
  provider_status: ProviderStatus;
  entry_token: string | null;
  expires_at: string | null;
};

// Map of provider kind → its active status (only contains running providers).
export type RemoteAccessStatusMap = Partial<Record<ProviderKind, RemoteAccessStatus>>;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRemoteAccess() {
  const isDesktop = useMemo(() => isTauriRuntime(), []);

  const [statusMap, setStatusMap] = useState<RemoteAccessStatusMap>({});
  const [providers, setProviders] = useState<ProviderDiagnostics[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Per-provider loading states
  const [startingProviders, setStartingProviders] = useState<Set<ProviderKind>>(new Set());
  const [stoppingProviders, setStoppingProviders] = useState<Set<ProviderKind>>(new Set());

  const refreshStatus = useCallback(async () => {
    if (!isDesktop) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<Record<string, RemoteAccessStatus>>('remote_access_status');
      setStatusMap(result as RemoteAccessStatusMap);
    } catch (err) {
      errorLog(`[remote-access] refreshStatus failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [isDesktop]);

  const detect = useCallback(async () => {
    if (!isDesktop) return;
    setIsLoading(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ providers: ProviderDiagnostics[] }>('remote_access_detect');
      setProviders(result.providers);
    } catch (err) {
      errorLog(`[remote-access] detect failed: ${err instanceof Error ? err.message : String(err)}`);
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
    ): Promise<RemoteAccessStatus | undefined> => {
      if (!isDesktop) return undefined;
      setStartingProviders((prev) => new Set(prev).add(provider));
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const payload = {
          req: { provider, mode, target_base_url: targetBaseUrl, ttl_secs: ttlSecs },
        };
        debugLog(`[remote-access] start: ${JSON.stringify(payload)}`);
        const result = await Promise.race([
          invoke<RemoteAccessStatus>('remote_access_start', payload),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Start tunnel timed out after 30s')), 30_000),
          ),
        ]);
        debugLog(`[remote-access] start ok: provider=${result.provider} url=${result.public_url}`);
        setStatusMap((prev) => ({ ...prev, [provider]: result }));
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errorLog(`[remote-access] start failed: ${msg}`);
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
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('remote_access_stop', { req: { provider } });
        setStatusMap((prev) => {
          const next = { ...prev };
          delete next[provider];
          return next;
        });
      } catch (err) {
        errorLog(`[remote-access] stop failed: ${err instanceof Error ? err.message : String(err)}`);
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
    ): Promise<RemoteAccessStatus | undefined> => {
      if (!isDesktop) return undefined;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<RemoteAccessStatus>('remote_access_renew', {
          req: { provider, ttl_secs: ttlSecs, reuse_token: reuseToken ?? true },
        });
        setStatusMap((prev) => ({ ...prev, [provider]: result }));
        return result;
      } catch (err) {
        errorLog(`[remote-access] renew failed: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
    },
    [isDesktop],
  );

  const recover = useCallback(async () => {
    if (!isDesktop) return;
    setIsLoading(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<Record<string, RemoteAccessStatus>>('remote_access_recover');
      if (result && Object.keys(result).length > 0) {
        setStatusMap(result as RemoteAccessStatusMap);
      }
    } catch (err) {
      errorLog(`[remote-access] recover failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [isDesktop]);

  const getProviderGuide = useCallback(
    async (provider: ProviderKind): Promise<string[]> => {
      if (!isDesktop) return [];
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<string[]>('remote_access_provider_guide', { provider });
      } catch (err) {
        errorLog(`[remote-access] getProviderGuide failed: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    },
    [isDesktop],
  );

  const saveCredential = useCallback(
    async (provider: ProviderKind, credential: string) => {
      if (!isDesktop) return;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('remote_access_save_credential', { req: { provider, credential } });
      } catch (err) {
        errorLog(`[remote-access] saveCredential failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [isDesktop],
  );

  const clearCredential = useCallback(
    async (provider: ProviderKind) => {
      if (!isDesktop) return;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('remote_access_clear_credential', { provider });
      } catch (err) {
        errorLog(`[remote-access] clearCredential failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [isDesktop],
  );

  useEffect(() => {
    if (!isDesktop) return;
    void refreshStatus();
  }, [isDesktop, refreshStatus]);

  // Listen for the startup recovery event emitted by Rust after sidecar is ready.
  useEffect(() => {
    if (!isDesktop) return;
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<Record<string, RemoteAccessStatus>>('remote-access-recovered', (event) => {
        if (event.payload && Object.keys(event.payload).length > 0) {
          setStatusMap(event.payload as RemoteAccessStatusMap);
        }
      }).then((fn) => { unlisten = fn; });
    });
    return () => { unlisten?.(); };
  }, [isDesktop]);

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
