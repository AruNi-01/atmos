'use client';

import { debugLog, errorLog } from './desktop-logger';

export type ApiConfig = {
  host: string;
  port: number;
  /** Optional loopback token; unified runtime uses no local auth by default. */
  token?: string;
  protocol?: string;
};

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
    type TauriApiConfig = { host?: string; port: number; token?: string };
    const internals = (window as {
      __TAURI_INTERNALS__?: {
        invoke?: (cmd: string, payload?: unknown) => Promise<TauriApiConfig>;
      };
    }).__TAURI_INTERNALS__;
    if (internals?.invoke) {
      try {
        debugLog('getRuntimeApiConfig: invoking get_api_config...');
        const result = await internals.invoke('get_api_config');
        cachedConfig = {
          host: result.host ?? '127.0.0.1',
          port: result.port,
          token: result.token,
        };
        debugLog(`getRuntimeApiConfig: success port=${cachedConfig.port}`);
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
  // Production static/runtime: same-origin API (no token on loopback).
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'development') {
    const protocol = window.location.protocol.replace(':', '');
    const host = window.location.hostname;
    const defaultPort = protocol === 'https' ? '443' : '80';
    const port = parseInt(window.location.port || defaultPort, 10);
    cachedConfig = { host, port, protocol };
    debugLog(`getRuntimeApiConfig: same-origin ${protocol}://${host}:${port}`);
    return cachedConfig;
  }

  cachedConfig = {
    host: '127.0.0.1',
    port: parseInt(process.env.NEXT_PUBLIC_API_PORT || '30303', 10),
    token: process.env.NEXT_PUBLIC_API_TOKEN || undefined,
  };
  debugLog(`getRuntimeApiConfig: dev-mode port=${cachedConfig.port}`);
  return cachedConfig;
}
