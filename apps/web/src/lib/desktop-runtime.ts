'use client';

import { debugLog, errorLog } from './desktop-logger';

export type ApiConfig = { host: string; port: number; token: string; protocol?: string };

let cachedConfig: ApiConfig | null = null;

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Build an HTTP base URL from the resolved config. */
export function httpBase(cfg: ApiConfig): string {
  const scheme = cfg.protocol ?? 'http';
  return `${scheme}://${cfg.host}:${cfg.port}`;
}

/** Build a WebSocket base URL from the resolved config. */
export function wsBase(cfg: ApiConfig): string {
  const scheme = cfg.protocol === 'https' ? 'wss' : 'ws';
  return `${scheme}://${cfg.host}:${cfg.port}`;
}

export async function getRuntimeApiConfig(): Promise<ApiConfig> {
  if (cachedConfig) {
    debugLog(`getRuntimeApiConfig: cache hit ${cachedConfig.host}:${cachedConfig.port}`);
    return cachedConfig;
  }

  if (isTauriRuntime()) {
    type TauriResult = { port: number; token: string };
    const internals = (window as { __TAURI_INTERNALS__?: { invoke?: (cmd: string, payload?: unknown) => Promise<TauriResult> } })
      .__TAURI_INTERNALS__;
    if (internals?.invoke) {
      try {
        debugLog('getRuntimeApiConfig: invoking get_api_config...');
        const result = await internals.invoke('get_api_config');
        cachedConfig = { host: '127.0.0.1', port: result.port, token: result.token };
        debugLog(`getRuntimeApiConfig: success port=${cachedConfig.port} tokenLen=${cachedConfig.token?.length}`);
        console.log('[desktop-runtime] got api config: port=' + cachedConfig.port);
        return cachedConfig;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errorLog(`getRuntimeApiConfig: invoke FAILED err=${msg}`);
        console.warn('[desktop-runtime] invoke get_api_config failed:', e);
        throw e;
      }
    }
    errorLog('getRuntimeApiConfig: __TAURI_INTERNALS__.invoke not available');
    throw new Error('Tauri runtime detected but invoke bridge is unavailable');
  }

  // Not Tauri — running in a regular browser.
  // Two scenarios:
  //   1) Production (desktop sidecar serves static files): browser loaded from
  //      http://{host}:30303 — use window.location as the API address so
  //      same-machine and LAN browsers work automatically.
  //   2) Dev mode (localhost:3030): API runs separately on port 30303.
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'development') {
    const protocol = window.location.protocol.replace(':', ''); // 'http' or 'https'
    const host = window.location.hostname;
    const defaultPort = protocol === 'https' ? '443' : '80';
    const port = parseInt(window.location.port || defaultPort, 10);
    cachedConfig = { host, port, token: '', protocol };
    debugLog(`getRuntimeApiConfig: same-origin ${protocol}://${host}:${port}`);
    return cachedConfig;
  }

  cachedConfig = {
    host: '127.0.0.1',
    port: parseInt(process.env.NEXT_PUBLIC_API_PORT || '30303', 10),
    token: process.env.NEXT_PUBLIC_API_TOKEN || '',
  };
  debugLog(`getRuntimeApiConfig: dev-mode port=${cachedConfig.port}`);
  return cachedConfig;
}
