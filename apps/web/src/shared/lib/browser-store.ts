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

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) {
    return fallback;
  }
  try {
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
  if (!canUseStorage()) {
    return false;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // quota / private mode
    return false;
  }
}

export function removeKey(key: string): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** True when `key` exists in localStorage (safe under blocked storage). */
export function hasStorageKey(key: string): boolean {
  if (!canUseStorage()) {
    return false;
  }
  try {
    return localStorage.getItem(key) != null;
  } catch {
    return false;
  }
}

export const ACTIVE_INSTANCE_GLOBAL_KEY = globalKey('activeInstance');

export function readActiveInstanceIdRaw(): string | null {
  if (!canUseStorage()) {
    return null;
  }
  try {
    return localStorage.getItem(ACTIVE_INSTANCE_GLOBAL_KEY);
  } catch {
    return null;
  }
}

export function writeActiveInstanceIdRaw(id: string): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    localStorage.setItem(ACTIVE_INSTANCE_GLOBAL_KEY, id);
  } catch {
    // ignore
  }
}
