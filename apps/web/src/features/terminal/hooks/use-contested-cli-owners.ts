"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { ContestedOwnersMap } from "@atmos/shared/terminal";
import { agentHooksApi, type ContestedCliOwner } from "@/api/rest-api";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";

const CACHE_TTL_MS = 60_000;

type CacheEntry = {
  owner: ContestedCliOwner;
  cachedAt: number;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ContestedCliOwner>>();
const listeners = new Set<() => void>();
let currentKey = "";
let currentOwner: ContestedCliOwner | undefined;
let stopComputerSubscription: (() => void) | null = null;
let intervalId: number | null = null;

function targetKey(): string {
  const computer = useAtmosComputerStore.getState();
  if (computer.connectionMode === "relay") {
    return [
      "relay",
      computer.selectedServerId ?? "none",
      computer.relayGatewayHttpBase ?? "pending",
      computer.relaySessionRevision,
    ].join(":");
  }
  return `local:${computer.localServerId ?? "default"}`;
}

function targetReady(): boolean {
  const computer = useAtmosComputerStore.getState();
  return computer.connectionMode === "local" || Boolean(computer.relayGatewayHttpBase);
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function syncCurrentTarget(shouldEmit = true): string {
  const key = targetKey();
  if (key === currentKey) return key;
  currentKey = key;
  currentOwner = cache.get(key)?.owner;
  if (shouldEmit) emit();
  return key;
}

async function fetchAgentOwner(force = false): Promise<ContestedCliOwner> {
  const key = syncCurrentTarget();
  if (!targetReady()) {
    currentOwner = undefined;
    emit();
    return "unknown";
  }
  const now = Date.now();
  const cached = cache.get(key);
  if (!force && cached && now - cached.cachedAt < CACHE_TTL_MS) {
    currentOwner = cached.owner;
    emit();
    return cached.owner;
  }
  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }

  const request = agentHooksApi
    .getCliIdentity("agent")
    .then((response) => {
      const owner = response.owner ?? "unknown";
      cache.set(key, { owner, cachedAt: Date.now() });
      if (targetKey() === key) {
        currentKey = key;
        currentOwner = owner;
        emit();
      }
      return owner;
    })
    .catch(() => {
      // Fail open: unknown → no brand match for bare `agent`.
      cache.set(key, { owner: "unknown", cachedAt: Date.now() });
      if (targetKey() === key) {
        currentKey = key;
        currentOwner = "unknown";
        emit();
      }
      return "unknown" as ContestedCliOwner;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

function startOwnerManager(): () => void {
  if (!stopComputerSubscription) {
    stopComputerSubscription = useAtmosComputerStore.subscribe(() => {
      const previousKey = currentKey;
      const key = syncCurrentTarget();
      if (key !== previousKey) {
        void fetchAgentOwner(false);
      }
    });
    if (typeof window !== "undefined") {
      const onFocus = () => void fetchAgentOwner(true);
      window.addEventListener("focus", onFocus);
      intervalId = window.setInterval(() => void fetchAgentOwner(false), CACHE_TTL_MS);
      void fetchAgentOwner(false);
      return () => {
        window.removeEventListener("focus", onFocus);
      };
    }
  }
  return () => {};
}

let removeFocusListener: (() => void) | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    removeFocusListener = startOwnerManager();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    removeFocusListener?.();
    removeFocusListener = null;
    stopComputerSubscription?.();
    stopComputerSubscription = null;
    if (intervalId !== null && typeof window !== "undefined") {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };
}

/**
 * Contested freehand CLI owners for terminal title resolution.
 * One connection-scoped manager owns refresh/focus listeners regardless of pane count.
 */
export function useContestedCliOwners(): ContestedOwnersMap {
  if (listeners.size === 0) {
    syncCurrentTarget(false);
  }
  const owner = useSyncExternalStore(
    subscribe,
    () => currentOwner,
    () => undefined,
  );

  return useMemo<ContestedOwnersMap>(() => {
    if (!owner) return {};
    return { agent: owner };
  }, [owner]);
}
