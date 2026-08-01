/**
 * Namespaced browser localStorage helpers.
 *
 * - global:* — device/browser preferences (theme, panel sizes)
 * - inst:{instanceId}:* — per Atmos Server UI state (editor tabs, agent defaults, …)
 */

import type { ConnectionInstanceId } from '@/features/connection/lib/connection-instance';

const VERSION = 'v1';
const PREFIX_GLOBAL = `atmos:${VERSION}:global:`;
const PREFIX_INST = `atmos:${VERSION}:inst:`;

export function globalKey(name: string): string {
  return `${PREFIX_GLOBAL}${name}`;
}

export function instKey(instanceId: ConnectionInstanceId, slice: string): string {
  return `${PREFIX_INST}${instanceId}:${slice}`;
}

/**
 * Storage availability. Must not throw: some browsers throw SecurityError on
 * any `localStorage` access when storage is denied (not only on setItem).
 */
function canUseStorage(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    if (!canUseStorage()) {
      return fallback;
    }
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Returns true when the value was written successfully. */
export function writeJson(key: string, value: unknown): boolean {
  try {
    if (!canUseStorage()) {
      return false;
    }
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // quota / private mode / denied storage
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    if (!canUseStorage()) {
      return;
    }
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** True when `key` exists in localStorage (safe under blocked storage). */
export function hasStorageKey(key: string): boolean {
  try {
    if (!canUseStorage()) {
      return false;
    }
    return localStorage.getItem(key) != null;
  } catch {
    return false;
  }
}

export const ACTIVE_INSTANCE_GLOBAL_KEY = globalKey('activeInstance');

export function readActiveInstanceIdRaw(): string | null {
  try {
    if (!canUseStorage()) {
      return null;
    }
    return localStorage.getItem(ACTIVE_INSTANCE_GLOBAL_KEY);
  } catch {
    return null;
  }
}

export function writeActiveInstanceIdRaw(id: string): void {
  try {
    if (!canUseStorage()) {
      return;
    }
    localStorage.setItem(ACTIVE_INSTANCE_GLOBAL_KEY, id);
  } catch {
    // ignore
  }
}
