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
let cachedHttpConfig: ApiConfig | null = null;
let hostedRuntimeOverride: ApiConfig | null = null;

export const HOSTED_ATMOS_APP_HOST = 'app.atmos.land';
const forceHostedOnboarding =
  process.env.NEXT_PUBLIC_FORCE_HOSTED_ONBOARDING === '1';

const loopbackApiPort = (): number =>
  parseInt(process.env.NEXT_PUBLIC_API_PORT || '30303', 10);

export function loopbackApiConfig(token?: string, host = '127.0.0.1'): ApiConfig {
  return {
    host,
    port: loopbackApiPort(),
    token,
  };
}

export function getHostedLoopbackCandidates(token?: string): ApiConfig[] {
  return [
    loopbackApiConfig(token, '127.0.0.1'),
    loopbackApiConfig(token, 'localhost'),
  ];
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isHostedAtmosOrigin(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.location.hostname === HOSTED_ATMOS_APP_HOST || forceHostedOnboarding)
  );
}

export function setHostedRuntimeApiOverride(cfg: ApiConfig | null): void {
  hostedRuntimeOverride = cfg;
  cachedConfig = cfg;
  cachedHttpConfig = cfg;
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
  if (hostedRuntimeOverride) {
    return hostedRuntimeOverride;
  }

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
      const maxWaitMs = 30_000;
      const startedAt = Date.now();
      while (true) {
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
          const apiNotReady = msg === 'API not ready';
          if (apiNotReady && Date.now() - startedAt < maxWaitMs) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            continue;
          }
          errorLog(`getRuntimeApiConfig: invoke FAILED err=${msg}`);
          console.warn('[desktop-runtime] invoke get_api_config failed:', e);
          throw e;
        }
      }
    }
    errorLog('getRuntimeApiConfig: __TAURI_INTERNALS__.invoke not available');
    throw new Error('Tauri runtime detected but invoke bridge is unavailable');
  }

  // Not Tauri — running in a regular browser.
  if (isHostedAtmosOrigin()) {
    cachedConfig = loopbackApiConfig(process.env.NEXT_PUBLIC_API_TOKEN || undefined);
    debugLog(`getRuntimeApiConfig: hosted loopback ${cachedConfig.host}:${cachedConfig.port}`);
    return cachedConfig;
  }

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

  cachedConfig = loopbackApiConfig(process.env.NEXT_PUBLIC_API_TOKEN || undefined);
  debugLog(`getRuntimeApiConfig: dev loopback port=${cachedConfig.port}`);
  return cachedConfig;
}

/**
 * HTTP fetch target. In browser dev, same-origin `/api` is proxied to loopback (see next.config rewrites).
 * WebSocket and PTY still use {@link getRuntimeApiConfig} (direct loopback port).
 */
export async function getRuntimeHttpConfig(): Promise<ApiConfig> {
  if (hostedRuntimeOverride) {
    return hostedRuntimeOverride;
  }

  if (cachedHttpConfig) {
    return cachedHttpConfig;
  }

  if (isTauriRuntime()) {
    cachedHttpConfig = await getRuntimeApiConfig();
    return cachedHttpConfig;
  }

  if (isHostedAtmosOrigin()) {
    cachedHttpConfig = loopbackApiConfig(process.env.NEXT_PUBLIC_API_TOKEN || undefined);
    return cachedHttpConfig;
  }

  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'development') {
    const protocol = window.location.protocol.replace(':', '');
    const host = window.location.hostname;
    const defaultPort = protocol === 'https' ? '443' : '80';
    const port = parseInt(window.location.port || defaultPort, 10);
    cachedHttpConfig = { host, port, protocol };
    return cachedHttpConfig;
  }

  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    const protocol = window.location.protocol.replace(':', '');
    const defaultPort = protocol === 'https' ? '443' : '80';
    const port = parseInt(window.location.port || defaultPort, 10);
    cachedHttpConfig = {
      host: window.location.hostname,
      port,
      protocol,
      token: process.env.NEXT_PUBLIC_API_TOKEN || undefined,
    };
    debugLog(
      `getRuntimeHttpConfig: dev proxy ${protocol}://${cachedHttpConfig.host}:${port}/api → 127.0.0.1:${loopbackApiPort()}`,
    );
    return cachedHttpConfig;
  }

  cachedHttpConfig = loopbackApiConfig(process.env.NEXT_PUBLIC_API_TOKEN || undefined);
  return cachedHttpConfig;
}

/** Loopback / dev-proxied HTTP base (never the relay gateway). */
export async function getLoopbackHttpBase(): Promise<string> {
  return httpBase(await getRuntimeHttpConfig());
}
