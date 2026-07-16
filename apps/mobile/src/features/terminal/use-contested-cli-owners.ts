import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContestedCommandOwner, ContestedOwnersMap } from "@atmos/shared/terminal";
import { useSessionStore } from "@/stores/session-store";

const CACHE_TTL_MS = 60_000;

type CacheEntry = {
  owner: ContestedCommandOwner;
  cachedAt: number;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ContestedCommandOwner>>();

function parseOwner(value: unknown): ContestedCommandOwner {
  if (value === "grok-build" || value === "cursor" || value === "unknown") {
    return value;
  }
  return "unknown";
}

async function fetchAgentOwner(
  cacheKey: string,
  gatewayUrl: string,
  clientToken: string,
  force = false,
): Promise<ContestedCommandOwner> {
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (!force && cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.owner;
  }
  const pending = inFlight.get(cacheKey);
  if (pending) {
    return pending;
  }

  const request = (async () => {
    try {
      const base = gatewayUrl.replace(/\/$/, "");
      const response = await fetch(
        `${base}/hooks/cli-identity?command=${encodeURIComponent("agent")}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${clientToken}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error(`cli-identity ${response.status}`);
      }
      const body = (await response.json()) as { owner?: unknown };
      const owner = parseOwner(body.owner);
      cache.set(cacheKey, { owner, cachedAt: Date.now() });
      return owner;
    } catch {
      // Fail open: unknown → no brand match for bare `agent`.
      cache.set(cacheKey, { owner: "unknown", cachedAt: Date.now() });
      return "unknown";
    } finally {
      inFlight.delete(cacheKey);
    }
  })();
  inFlight.set(cacheKey, request);
  return request;
}

/**
 * Contested freehand CLI owners for terminal title resolution on mobile.
 * Probes the active computer via HTTP gateway (`/hooks/cli-identity`).
 */
export function useContestedCliOwners(): ContestedOwnersMap {
  const session = useSessionStore((state) => state.activeClientSession);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const cacheKey =
    session?.gateway_url && session.client_token
      ? `${selectedServerId ?? "unknown"}|${session.gateway_url}`
      : null;
  const [resolved, setResolved] = useState<{
    key: string;
    owner: ContestedCommandOwner;
  } | null>(() => {
    if (!cacheKey) return null;
    const cached = cache.get(cacheKey);
    return cached ? { key: cacheKey, owner: cached.owner } : null;
  });
  const activeKeyRef = useRef(cacheKey);
  activeKeyRef.current = cacheKey;

  const refresh = useCallback(
    (force = false) => {
      if (!cacheKey || !session?.gateway_url || !session.client_token) {
        setResolved(null);
        return;
      }
      const requestKey = cacheKey;
      void fetchAgentOwner(
        requestKey,
        session.gateway_url,
        session.client_token,
        force,
      ).then((owner) => {
        if (activeKeyRef.current === requestKey) {
          setResolved({ key: requestKey, owner });
        }
      });
    },
    [cacheKey, session?.client_token, session?.gateway_url],
  );

  useEffect(() => {
    refresh(false);
    const interval = setInterval(() => refresh(false), CACHE_TTL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const owner =
    resolved?.key === cacheKey
      ? resolved.owner
      : cacheKey
        ? cache.get(cacheKey)?.owner
        : undefined;
  return useMemo<ContestedOwnersMap>(() => {
    if (!owner) return {};
    return { agent: owner };
  }, [owner]);
}
