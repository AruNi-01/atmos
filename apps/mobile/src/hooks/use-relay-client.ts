import { useMemo } from "react";
import { RelayClient } from "@/api/relay-client";
import { useSessionStore } from "@/stores/session-store";

export function useRelayClient() {
  const relayUrl = useSessionStore((state) => state.relayUrl);
  const relaySecretKey = useSessionStore((state) => state.relaySecretKey);
  return useMemo(() => new RelayClient(relayUrl, relaySecretKey), [relayUrl, relaySecretKey]);
}
