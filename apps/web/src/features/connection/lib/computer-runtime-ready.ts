"use client";

import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import { useHostedConnectionStore } from "@/features/connection/store/hosted-connection-store";
import { isHostedAtmosOrigin } from "@/shared/lib/desktop-runtime";

/**
 * True when Computer HTTP (REST) can resolve a target:
 * - local: loopback URL is always defined
 * - relay: gateway base + client token must both be present
 * - hosted origin: wait until hosted bootstrap is connected
 */
export function selectComputerRuntimeReady(): boolean {
  if (isHostedAtmosOrigin()) {
    const hosted = useHostedConnectionStore.getState().bootstrapState;
    if (hosted !== "connected") return false;
  }

  const { connectionMode, relayGatewayHttpBase, relayClientToken } =
    useAtmosComputerStore.getState();

  if (connectionMode === "relay") {
    return Boolean(relayGatewayHttpBase?.trim() && relayClientToken?.trim());
  }

  return true;
}

export function useComputerRuntimeReady(): boolean {
  const connectionMode = useAtmosComputerStore((s) => s.connectionMode);
  const relayGatewayHttpBase = useAtmosComputerStore((s) => s.relayGatewayHttpBase);
  const relayClientToken = useAtmosComputerStore((s) => s.relayClientToken);
  const hostedBootstrapState = useHostedConnectionStore((s) => s.bootstrapState);

  if (isHostedAtmosOrigin() && hostedBootstrapState !== "connected") {
    return false;
  }

  if (connectionMode === "relay") {
    return Boolean(relayGatewayHttpBase?.trim() && relayClientToken?.trim());
  }

  return true;
}
