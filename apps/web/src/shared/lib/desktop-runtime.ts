'use client';

import {
  desktopInvoke,
  isDesktopRuntime as bridgeIsDesktopRuntime,
  isTauriShell,
} from './desktop-bridge';
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
const isDesktopBuild =
  process.env.NEXT_PUBLIC_BUILD_TARGET === 'desktop' ||
  process.env.BUILD_TARGET === 'desktop';

const loopbackApiPort = (): number =>
  parseInt(process.env.NEXT_PUBLIC_API_PORT || '30303', 10);

function currentOriginApiConfig(token?: string): ApiConfig | null {
  if (typeof window === 'undefined') return null;
  const protocol = window.location.protocol.replace(':', '') || 'http';
  if (protocol !== 'http' && protocol !== 'https') return null;
  const defaultPort = protocol === 'https' ? '443' : '80';
  const port = parseInt(window.location.port || defaultPort, 10);
  if (!Number.isFinite(port)) return null;
  return {
    host: window.location.hostname || '127.0.0.1',
    port,
    protocol,
    token,
  };
}

function desktopBuildFallbackApiConfig(token?: string): ApiConfig {
  return currentOriginApiConfig(token) ?? loopbackApiConfig(token);
}

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

/**
 * True when running inside the Tauri desktop shell.
 * Prefer {@link isDesktopRuntime} for features that apply to any desktop shell
 * (Tauri or Electron).
 */
export function isTauriRuntime(): boolean {
  return isTauriShell();
}

/** True when running inside Tauri or Electron desktop shells. */
export function isDesktopRuntime(): boolean {
  return bridgeIsDesktopRuntime();
}

/**
 * True when this UI should start desktop OAuth (system browser + atmos:// return).
 * Includes desktop static export even if the preload bridge is not injected.
 */
export function isDesktopAuthSurface(): boolean {
  return (
    isDesktopRuntime() ||
    process.env.NEXT_PUBLIC_BUILD_TARGET === "desktop" ||
    process.env.BUILD_TARGET === "desktop"
  );
}

export function isHostedAtmosOrigin(): boolean {
  // Desktop shells (Tauri / Electron) are never "hosted web origin".
  if (isDesktopRuntime()) {
    return false;
  }

  return (
    typeof window !== 'undefined' &&
    (window.location.hostname === HOSTED_ATMOS_APP_HOST || forceHostedOnboarding)
  );
}

/** Public Token Usage / leaderboard share pages — no workbench WebSocket. */
export function isPublicTokPath(
  pathname = typeof window === 'undefined' ? '' : window.location.pathname,
): boolean {
  return pathname === '/tok' || pathname.startsWith('/tok/');
}

export function setHostedRuntimeApiOverride(cfg: ApiConfig | null): void {
  hostedRuntimeOverride = cfg;
  cachedConfig = cfg;
  cachedHttpConfig = cfg;
}

export function clearRuntimeApiConfigCache(): void {
  cachedConfig = null;
  cachedHttpConfig = null;
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

  if (isDesktopRuntime()) {
    type DesktopApiConfig = { host?: string; port: number; token?: string };
    const maxWaitMs = 30_000;
    const startedAt = Date.now();
    while (true) {
      try {
        debugLog('getRuntimeApiConfig: invoking get_api_config via desktop bridge...');
        const result = await desktopInvoke<DesktopApiConfig>('get_api_config');
        cachedConfig = {
          host: result.host ?? '127.0.0.1',
          port: result.port,
          token: result.token,
        };
        debugLog(`getRuntimeApiConfig: success port=${cachedConfig.port}`);
        return cachedConfig;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const apiNotReady = msg === 'API not ready' || msg.includes('API not ready');
        if (apiNotReady && Date.now() - startedAt < maxWaitMs) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          continue;
        }
        errorLog(`getRuntimeApiConfig: invoke FAILED err=${msg}`);
        console.warn('[desktop-runtime] invoke get_api_config failed:', e);
        if (isDesktopBuild) {
          cachedConfig = desktopBuildFallbackApiConfig(
            process.env.NEXT_PUBLIC_API_TOKEN || undefined,
          );
          console.warn(
            `[desktop-runtime] falling back to loopback ${cachedConfig.host}:${cachedConfig.port}`,
          );
          return cachedConfig;
        }
        throw e;
      }
    }
  }

  // Not a desktop shell — running in a regular browser.
  if (isHostedAtmosOrigin()) {
    cachedConfig = loopbackApiConfig(process.env.NEXT_PUBLIC_API_TOKEN || undefined);
    debugLog(`getRuntimeApiConfig: hosted loopback ${cachedConfig.host}:${cachedConfig.port}`);
    return cachedConfig;
  }

  if (isDesktopBuild) {
    cachedConfig = desktopBuildFallbackApiConfig(process.env.NEXT_PUBLIC_API_TOKEN || undefined);
    debugLog(`getRuntimeApiConfig: desktop loopback ${cachedConfig.host}:${cachedConfig.port}`);
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

  if (isDesktopRuntime()) {
    cachedHttpConfig = await getRuntimeApiConfig();
    return cachedHttpConfig;
  }

  if (isHostedAtmosOrigin()) {
    cachedHttpConfig = loopbackApiConfig(process.env.NEXT_PUBLIC_API_TOKEN || undefined);
    return cachedHttpConfig;
  }

  if (isDesktopBuild) {
    cachedHttpConfig = desktopBuildFallbackApiConfig(process.env.NEXT_PUBLIC_API_TOKEN || undefined);
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
