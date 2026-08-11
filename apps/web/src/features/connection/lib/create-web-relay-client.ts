/**
 * Workbench (browser + Electron) Relay control-plane client factory.
 *
 * Electron loads the same apps/web UI; use `workbenchRelayClientKind()` when
 * opening client sessions (`desktop` vs `web`). Prefer loopback Atmos Server
 * proxy so desktop can attach `X-Atmos-Relay-Secret` from computer-client.json.
 */
import {
  createRelayClient,
  normalizeRelayUrl,
  type AuthenticatedRelayClient,
  type RelayClient,
  type RelayTransport,
} from "@atmos/relay-client";
import { proxyRelayRequest } from "@/features/connection/lib/atmos-computer-local";
import {
  resolveRelayUrl,
  useAtmosComputerStore,
} from "@/features/connection/lib/atmos-computer-store";
import { isDesktopRuntime } from "@/shared/lib/desktop-runtime";

export type CreateWebRelayClientOptions = {
  relayUrl: string;
  relaySecretKey?: string;
  /**
   * When true (default), try loopback proxy first; desktop requires proxy success.
   * Hosted browser falls back to direct fetch if proxy unavailable.
   */
  preferLoopbackProxy?: boolean;
};

function createWebRelayTransport(opts: {
  relaySecretKey: string;
  preferLoopbackProxy: boolean;
}): RelayTransport {
  return async (req) => {
    if (opts.preferLoopbackProxy) {
      const proxied = await proxyRelayRequest(
        req.baseUrl,
        req.method,
        req.path,
        {
          deviceCredential: bearerFromHeaders(req.headers),
          body: req.body,
          relaySecretKey: opts.relaySecretKey || undefined,
        },
      );
      if (proxied) {
        let json: unknown = {};
        try {
          json = JSON.parse(proxied.body) as unknown;
        } catch {
          json = {};
        }
        return { status: proxied.status, json };
      }
      if (isDesktopRuntime()) {
        throw new Error(
          "Could not reach local Atmos Server to proxy Relay requests.",
        );
      }
    }

    const response = await fetch(`${req.baseUrl}${req.path}`, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
    const json = (await response.json().catch(() => ({}))) as unknown;
    return { status: response.status, json };
  };
}

function bearerFromHeaders(headers: Record<string, string>): string | undefined {
  const auth = headers.Authorization ?? headers.authorization;
  if (!auth) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m?.[1]?.trim() || undefined;
}

/** Shared factory for web Atmos Computer / hosted connection flows. */
export function createWebRelayClient(
  options: CreateWebRelayClientOptions,
): RelayClient {
  const relaySecretKey = (options.relaySecretKey ?? "").trim();
  return createRelayClient({
    baseUrl: normalizeRelayUrl(options.relayUrl),
    relaySecretKey,
    transport: createWebRelayTransport({
      relaySecretKey,
      preferLoopbackProxy: options.preferLoopbackProxy ?? true,
    }),
  });
}

type CacheEntry = {
  key: string;
  client: RelayClient;
};

let clientCache: CacheEntry | null = null;

function cacheKey(relayUrl: string, relaySecretKey: string): string {
  return `${normalizeRelayUrl(relayUrl)}\0${relaySecretKey.trim()}`;
}

/**
 * Cached Relay client from store defaults (or explicit overrides).
 * Invalidates automatically when URL / secret identity changes.
 */
export function getWebRelayClient(opts?: {
  relayUrl?: string;
  relaySecretKey?: string;
  preferLoopbackProxy?: boolean;
}): RelayClient {
  const state = useAtmosComputerStore.getState();
  const relayUrl = opts?.relayUrl ?? resolveRelayUrl(state.relayUrl);
  const relaySecretKey = opts?.relaySecretKey ?? state.relaySecretKey;
  const key = cacheKey(relayUrl, relaySecretKey);

  if (clientCache?.key === key && opts?.preferLoopbackProxy === undefined) {
    return clientCache.client;
  }

  const client = createWebRelayClient({
    relayUrl,
    relaySecretKey,
    preferLoopbackProxy: opts?.preferLoopbackProxy,
  });

  // Only cache default-proxy clients to avoid surprising desktop/hosted mixes.
  if (opts?.preferLoopbackProxy === undefined) {
    clientCache = { key, client };
  }
  return client;
}

/** Store-backed client with the current device credential bound. */
export function getAuthenticatedWebRelayClient(
  deviceCredential?: string,
): AuthenticatedRelayClient {
  const token =
    (deviceCredential ?? useAtmosComputerStore.getState().accessToken).trim();
  return getWebRelayClient().withDeviceCredential(token);
}

/** Test / logout helper. */
export function clearWebRelayClientCache(): void {
  clientCache = null;
}
