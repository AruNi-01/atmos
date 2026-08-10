import { useMemo } from "react";
import { createRelayClient } from "@atmos/relay-client";
import { useSessionStore } from "@/stores/session-store";

export function useRelayClient() {
  const relayUrl = useSessionStore((state) => state.relayUrl);
  const relaySecretKey = useSessionStore((state) => state.relaySecretKey);
  return useMemo(
    () =>
      createRelayClient({
        baseUrl: relayUrl,
        relaySecretKey,
      }),
    [relayUrl, relaySecretKey],
  );
}
