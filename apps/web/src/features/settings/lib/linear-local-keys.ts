/**
 * Machine-local Linear personal API keys.
 *
 * Primary store: `~/.atmos/credentials/linear_local_keys.json` via local Atmos API
 * (`GET/PUT /api/system/linear-local-keys`).
 *
 * Fallback: browser localStorage only when no Computer API is reachable
 * (e.g. pure hosted tab without relay session). Prefer disk on Desktop/local.
 */

import {
  getLoopbackHttpBase,
  isHostedAtmosOrigin,
} from "@/shared/lib/desktop-runtime";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";

export const LINEAR_API_KEYS_CREATE_URL =
  "https://linear.app/land-atmos/settings/account/security/api-keys/new";

const LEGACY_STORAGE_KEYS = "atmos.linear.local_api_keys";
const LEGACY_STORAGE_SELECTION = "atmos.linear.auth_selection";

export type LinearLocalApiKey = {
  id: string;
  name: string;
  api_key: string;
  viewer_name?: string | null;
  viewer_email?: string | null;
  created_at: number;
};

/** Which credential drives Linear requests. */
export type LinearAuthSelection =
  | { mode: "none" }
  | { mode: "oauth" }
  | { mode: "local"; keyId: string };

export type LinearLocalStoreSnapshot = {
  keys: LinearLocalApiKey[];
  selection: LinearAuthSelection;
  /** Disk path when loaded/saved via Computer API. */
  path: string | null;
  /** true when last hydrate/persist used ~/.atmos via API. */
  onDisk: boolean;
};

let cache: LinearLocalStoreSnapshot = {
  keys: [],
  selection: { mode: "none" },
  path: null,
  onDisk: false,
};
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Default display name when user leaves the field empty. */
export function defaultLinearKeyName(): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `Key-${suffix}`;
}

function apiTokenHeader(): Record<string, string> {
  const token =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_TOKEN : undefined;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function computerApiTarget(): Promise<{
  base: string;
  headers: Record<string, string>;
} | null> {
  if (typeof window !== "undefined" && isHostedAtmosOrigin()) {
    const store = useAtmosComputerStore.getState();
    if (
      store.connectionMode === "relay" &&
      store.relayGatewayHttpBase &&
      store.relayClientToken
    ) {
      return {
        base: store.relayGatewayHttpBase.replace(/\/$/, ""),
        headers: { Authorization: `Bearer ${store.relayClientToken}` },
      };
    }
    // Hosted without an active Computer relay session cannot reach ~/.atmos.
    return null;
  }

  try {
    const base = (await getLoopbackHttpBase()).replace(/\/$/, "");
    return { base, headers: apiTokenHeader() };
  } catch {
    return null;
  }
}

function readLegacyLocalStorage(): LinearLocalStoreSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const rawKeys = localStorage.getItem(LEGACY_STORAGE_KEYS);
    const rawSel = localStorage.getItem(LEGACY_STORAGE_SELECTION);
    if (!rawKeys && !rawSel) return null;
    const keys = rawKeys
      ? ((JSON.parse(rawKeys) as LinearLocalApiKey[]) ?? [])
      : [];
    let selection: LinearAuthSelection = { mode: "none" };
    if (rawSel) {
      const parsed = JSON.parse(rawSel) as LinearAuthSelection;
      if (parsed?.mode === "oauth") selection = { mode: "oauth" };
      else if (parsed?.mode === "local" && typeof parsed.keyId === "string") {
        selection = { mode: "local", keyId: parsed.keyId };
      }
    }
    return {
      keys: Array.isArray(keys) ? keys : [],
      selection,
      path: null,
      onDisk: false,
    };
  } catch {
    return null;
  }
}

function clearLegacyLocalStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEYS);
    localStorage.removeItem(LEGACY_STORAGE_SELECTION);
  } catch {
    /* ignore */
  }
}

function writeLegacyLocalStorage(snapshot: LinearLocalStoreSnapshot): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LEGACY_STORAGE_KEYS, JSON.stringify(snapshot.keys));
    localStorage.setItem(
      LEGACY_STORAGE_SELECTION,
      JSON.stringify(snapshot.selection),
    );
  } catch {
    /* quota */
  }
}

function normalizeSelection(
  raw: unknown,
  keys: LinearLocalApiKey[],
): LinearAuthSelection {
  if (!raw || typeof raw !== "object") return { mode: "none" };
  const obj = raw as { mode?: string; keyId?: string; key_id?: string };
  if (obj.mode === "oauth") return { mode: "oauth" };
  if (obj.mode === "local") {
    const keyId = (obj.keyId ?? obj.key_id ?? "").trim();
    if (keyId && keys.some((k) => k.id === keyId)) {
      return { mode: "local", keyId };
    }
    return { mode: "none" };
  }
  return { mode: "none" };
}

async function fetchFromDisk(): Promise<LinearLocalStoreSnapshot | null> {
  const target = await computerApiTarget();
  if (!target) return null;
  let res: Response;
  try {
    res = await fetch(`${target.base}/api/system/linear-local-keys`, {
      headers: target.headers,
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: {
      path?: string;
      keys?: Array<LinearLocalApiKey & { api_key_configured?: boolean }>;
      selection?: unknown;
    };
  } | null;
  if (!json?.success || !json.data) return null;
  const keys = (json.data.keys ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    api_key: k.api_key ?? "",
    viewer_name: k.viewer_name ?? null,
    viewer_email: k.viewer_email ?? null,
    created_at: k.created_at ?? 0,
  }));
  return {
    keys,
    selection: normalizeSelection(json.data.selection, keys),
    path: json.data.path ?? null,
    onDisk: true,
  };
}

async function persistToDisk(
  snapshot: LinearLocalStoreSnapshot,
): Promise<LinearLocalStoreSnapshot | null> {
  const target = await computerApiTarget();
  if (!target) return null;
  let res: Response;
  try {
    res = await fetch(`${target.base}/api/system/linear-local-keys`, {
      method: "PUT",
      headers: {
        ...target.headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        keys: snapshot.keys.map((k) => ({
          id: k.id,
          name: k.name,
          api_key: k.api_key,
          viewer_name: k.viewer_name,
          viewer_email: k.viewer_email,
          created_at: k.created_at,
        })),
        selection:
          snapshot.selection.mode === "local"
            ? { mode: "local", keyId: snapshot.selection.keyId }
            : { mode: snapshot.selection.mode },
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: {
      path?: string;
      keys?: LinearLocalApiKey[];
      selection?: unknown;
    };
  } | null;
  if (!json?.success || !json.data) return null;
  const keys = (json.data.keys ?? snapshot.keys).map((k) => ({
    id: k.id,
    name: k.name,
    // API may redact when not expose_secrets; keep cache secret if empty response.
    api_key: k.api_key?.trim()
      ? k.api_key
      : (snapshot.keys.find((x) => x.id === k.id)?.api_key ?? ""),
    viewer_name: k.viewer_name ?? null,
    viewer_email: k.viewer_email ?? null,
    created_at: k.created_at ?? 0,
  }));
  return {
    keys,
    selection: normalizeSelection(json.data.selection, keys),
    path: json.data.path ?? snapshot.path,
    onDisk: true,
  };
}

async function applySnapshot(next: LinearLocalStoreSnapshot): Promise<void> {
  const disk = await persistToDisk(next);
  if (disk) {
    cache = disk;
    clearLegacyLocalStorage();
    return;
  }
  // No Computer API: last-resort browser store (hosted without relay).
  cache = { ...next, onDisk: false, path: null };
  writeLegacyLocalStorage(cache);
}

/**
 * Load from disk (preferred) or migrate legacy localStorage once.
 * Safe to call multiple times; concurrent callers share one promise.
 */
/** Test helper: drop in-memory + legacy browser state. */
export function __resetLinearLocalKeysForTests(): void {
  cache = {
    keys: [],
    selection: { mode: "none" },
    path: null,
    onDisk: false,
  };
  hydrated = false;
  hydratePromise = null;
  clearLegacyLocalStorage();
}

export async function ensureLinearLocalKeysHydrated(): Promise<LinearLocalStoreSnapshot> {
  if (hydrated) return cache;
  if (hydratePromise) {
    await hydratePromise;
    return cache;
  }
  hydratePromise = (async () => {
    const disk = await fetchFromDisk();
    if (disk) {
      cache = disk;
      // One-shot migrate browser leftovers up to disk if disk empty but legacy has data.
      const legacy = readLegacyLocalStorage();
      if (disk.keys.length === 0 && legacy && legacy.keys.length > 0) {
        await applySnapshot({
          keys: legacy.keys,
          selection: legacy.selection,
          path: disk.path,
          onDisk: true,
        });
      } else {
        clearLegacyLocalStorage();
      }
      hydrated = true;
      return;
    }
    const legacy = readLegacyLocalStorage();
    cache = legacy ?? {
      keys: [],
      selection: { mode: "none" },
      path: null,
      onDisk: false,
    };
    hydrated = true;
  })().finally(() => {
    hydratePromise = null;
  });
  await hydratePromise;
  return cache;
}

export function getLinearLocalStoreSnapshot(): LinearLocalStoreSnapshot {
  return cache;
}

export function listLinearLocalKeys(): LinearLocalApiKey[] {
  return cache.keys;
}

export function getLinearAuthSelection(): LinearAuthSelection {
  return cache.selection;
}

/**
 * Active local API key for requests/UI when not on the OAuth path.
 * - mode "local": key matching keyId (falls back to first key if id missing)
 * - mode "none": first stored key (implicit local — no Hub login required)
 * - mode "oauth": null (explicit OAuth path)
 */
export function getActiveLinearLocalKey(): LinearLocalApiKey | null {
  const sel = cache.selection;
  if (sel.mode === "oauth") return null;
  if (sel.mode === "local") {
    return (
      cache.keys.find((k) => k.id === sel.keyId) ?? cache.keys[0] ?? null
    );
  }
  // mode "none": treat first key as active so local keys work without
  // an explicit selection / Hub session.
  return cache.keys[0] ?? null;
}

/** API key string for WS when a local key is active (not OAuth). */
export function getActiveLinearApiKeyForRequest(): string | undefined {
  const key = getActiveLinearLocalKey()?.api_key?.trim();
  return key || undefined;
}

export async function setLinearAuthSelection(
  selection: LinearAuthSelection,
): Promise<void> {
  await ensureLinearLocalKeysHydrated();
  await applySnapshot({ ...cache, selection });
}

export async function upsertLinearLocalKey(input: {
  id?: string;
  name: string;
  api_key: string;
  viewer_name?: string | null;
  viewer_email?: string | null;
}): Promise<LinearLocalApiKey> {
  await ensureLinearLocalKeysHydrated();
  const id = input.id?.trim() || randomId();
  const name = input.name.trim() || defaultLinearKeyName();
  const api_key = input.api_key.trim();
  const keys = [...cache.keys];
  const idx = keys.findIndex((k) => k.id === id);
  const next: LinearLocalApiKey = {
    id,
    name,
    api_key,
    viewer_name: input.viewer_name ?? null,
    viewer_email: input.viewer_email ?? null,
    created_at: idx >= 0 ? keys[idx]!.created_at : Date.now(),
  };
  if (idx >= 0) keys[idx] = next;
  else keys.push(next);
  await applySnapshot({
    ...cache,
    keys,
    selection: { mode: "local", keyId: id },
  });
  return next;
}

export async function removeLinearLocalKey(id: string): Promise<void> {
  await ensureLinearLocalKeysHydrated();
  const keys = cache.keys.filter((k) => k.id !== id);
  let selection = cache.selection;
  if (selection.mode === "local" && selection.keyId === id) {
    selection = keys[0]
      ? { mode: "local", keyId: keys[0].id }
      : { mode: "none" };
  }
  await applySnapshot({ ...cache, keys, selection });
}

export async function selectLinearLocalKey(keyId: string): Promise<void> {
  await setLinearAuthSelection({ mode: "local", keyId });
}

export async function selectLinearOauth(): Promise<void> {
  await setLinearAuthSelection({ mode: "oauth" });
}

export async function clearLinearAuthSelection(): Promise<void> {
  await setLinearAuthSelection({ mode: "none" });
}

/** Chip / status label source. */
export type LinearCredentialSource = "none" | "oauth" | "local";

export function resolveLinearCredentialSource(opts: {
  selection: LinearAuthSelection;
  oauthConnected: boolean;
  hasLocalKey: boolean;
}): LinearCredentialSource {
  // Explicit OAuth selection always uses the OAuth path (Hub).
  if (opts.selection.mode === "oauth") {
    return opts.oauthConnected ? "oauth" : "none";
  }
  // Not OAuth: prefer machine-local API keys when present.
  if (opts.hasLocalKey) return "local";
  if (opts.oauthConnected) return "oauth";
  if (opts.selection.mode === "local") return "local";
  return "none";
}
