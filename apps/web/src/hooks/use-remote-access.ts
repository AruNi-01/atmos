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
  active_session_id: string | null;
  expires_at: string | null;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRemoteAccess() {
  const isDesktop = useMemo(() => isTauriRuntime(), []);

  const [status, setStatus] = useState<RemoteAccessStatus | null>(null);
  const [providers, setProviders] = useState<ProviderDiagnostics[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!isDesktop) return;
    setIsLoading(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<RemoteAccessStatus>('remote_access_status');
      setStatus(result);
    } catch (err) {
      errorLog(`[remote-access] refreshStatus failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
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
      useSavedCredential?: boolean,
    ): Promise<RemoteAccessStatus | undefined> => {
      if (!isDesktop) return undefined;
      setIsStarting(true);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const payload = {
          req: {
            provider,
            mode,
            target_base_url: targetBaseUrl,
            ttl_secs: ttlSecs,
            use_saved_credential: useSavedCredential,
          },
        };
        debugLog(`[remote-access] start: ${JSON.stringify(payload)}`);
        const result = await Promise.race([
          invoke<RemoteAccessStatus>('remote_access_start', payload),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Start tunnel timed out after 30s')), 30_000),
          ),
        ]);
        debugLog(`[remote-access] start ok: provider=${result.provider} url=${result.public_url}`);
        setStatus(result);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errorLog(`[remote-access] start failed: ${msg}`);
        throw err;
      } finally {
        setIsStarting(false);
      }
    },
    [isDesktop],
  );

  const stop = useCallback(async () => {
    if (!isDesktop) return;
    setIsStopping(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('remote_access_stop');
      setStatus(null);
    } catch (err) {
      errorLog(`[remote-access] stop failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsStopping(false);
    }
  }, [isDesktop]);

  const recover = useCallback(async () => {
    if (!isDesktop) return;
    setIsLoading(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<RemoteAccessStatus | null>('remote_access_recover');
      if (result) {
        setStatus(result);
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

  return {
    status,
    providers,
    isLoading,
    isStarting,
    isStopping,
    isDesktop,
    refreshStatus,
    detect,
    start,
    stop,
    recover,
    getProviderGuide,
    saveCredential,
    clearCredential,
  };
}
