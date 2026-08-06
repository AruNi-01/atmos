"use client";

import { useMemo } from "react";
import type { ConnectionInstanceId } from "@/features/connection/lib/connection-instance";
import { useConnectionStore } from "@/features/connection/store/connection-store";
import {
  resolveRelayUrl,
  useAtmosComputerStore,
} from "@/features/connection/lib/atmos-computer-store";

export interface ComputerQueryScope {
  activeInstanceId: ConnectionInstanceId;
  connectionEpoch: number;
  relaySessionRevision: number;
}

export interface RelayQueryScope {
  relayUrl: string;
  authRevision: number;
}

export function getComputerQueryScope(): ComputerQueryScope {
  const connection = useConnectionStore.getState();
  const computer = useAtmosComputerStore.getState();
  return {
    activeInstanceId: connection.activeInstanceId,
    connectionEpoch: connection.connectionEpoch,
    relaySessionRevision: computer.relaySessionRevision,
  };
}

export function getRelayQueryScope(): RelayQueryScope {
  const computer = useAtmosComputerStore.getState();
  return {
    relayUrl: resolveRelayUrl(computer.relayUrl),
    authRevision: computer.relayAuthRevision,
  };
}

/**
 * Stable object identity while the three primitives are unchanged.
 * Callers that put the return value in effect/query deps must not see a new
 * object every render (that causes fetch → setState → re-render loops).
 */
export function useComputerQueryScope(): ComputerQueryScope {
  const activeInstanceId = useConnectionStore((s) => s.activeInstanceId);
  const connectionEpoch = useConnectionStore((s) => s.connectionEpoch);
  const relaySessionRevision = useAtmosComputerStore((s) => s.relaySessionRevision);
  return useMemo(
    () => ({ activeInstanceId, connectionEpoch, relaySessionRevision }),
    [activeInstanceId, connectionEpoch, relaySessionRevision],
  );
}

export function useRelayQueryScope(): RelayQueryScope {
  const relayUrl = useAtmosComputerStore((s) => resolveRelayUrl(s.relayUrl));
  const authRevision = useAtmosComputerStore((s) => s.relayAuthRevision);
  return useMemo(
    () => ({ relayUrl, authRevision }),
    [relayUrl, authRevision],
  );
}
