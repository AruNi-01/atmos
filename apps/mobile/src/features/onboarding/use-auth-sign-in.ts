import { useCallback, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { autoConnectAfterAuth } from "@/lib/auto-connect";
import { requireDeviceCredential } from "@/lib/device-credential";
import {
  signInWithHubProvider,
  type HubSocialProvider,
} from "@/lib/hub-auth-native";
import { claimPairFromScan } from "@/lib/mobile-pair-claim";
import { useRelayClient } from "@/hooks/use-relay-client";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";

type UseAuthSignInOptions = {
  onAuthenticated?: () => void;
};

export function useAuthSignIn({ onAuthenticated }: UseAuthSignInOptions = {}) {
  const router = useRouter();
  const client = useRelayClient();
  const setDeviceCredentialLoaded = useSessionStore(
    (state) => state.setDeviceCredentialLoaded,
  );
  const hasDeviceCredential = useSessionStore(
    (state) => state.hasDeviceCredential,
  );
  const relayUrl = useSessionStore((state) => state.relayUrl);
  const relayAuthRevision = useSessionStore((state) => state.relayAuthRevision);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const selectServer = useSessionStore((state) => state.selectServer);
  const setClientSession = useSessionStore((state) => state.setClientSession);
  const setComputers = useComputerStore((state) => state.setComputers);
  const [localError, setLocalError] = useState<string | null>(null);

  const finishAuth = useCallback(async () => {
    setDeviceCredentialLoaded(true);
    const result = await autoConnectAfterAuth(client);
    setComputers(result.computers);
    setLocalError(null);
    if (onAuthenticated) {
      onAuthenticated();
      return;
    }
    if (result.connectedServerId) {
      router.replace("/");
    }
  }, [client, onAuthenticated, router, setComputers, setDeviceCredentialLoaded]);

  const signIn = useMutation({
    mutationFn: async (provider: HubSocialProvider) => {
      await signInWithHubProvider(provider);
      await finishAuth();
    },
    onError: (error) => {
      setLocalError(error instanceof Error ? error.message : "Sign-in failed.");
    },
  });

  const claimPair = useMutation({
    mutationFn: async (raw: string) => {
      await claimPairFromScan(raw);
      await finishAuth();
    },
    onError: (error) => {
      setLocalError(
        error instanceof Error ? error.message : "Could not claim pair code.",
      );
    },
  });

  const computersQuery = useQuery({
    queryKey: [
      "auth-sign-in-computers",
      relayUrl,
      relayAuthRevision,
      hasDeviceCredential,
    ],
    enabled: hasDeviceCredential,
    refetchInterval: 5000,
    queryFn: async () => {
      const token = requireDeviceCredential();
      const computers = await client.withDeviceCredential(token).listComputers();
      setComputers(computers);
      return computers;
    },
  });

  const createSession = useMutation({
    mutationFn: async (serverId: string) => {
      const token = requireDeviceCredential();
      return client
        .withDeviceCredential(token)
        .createClientSession(serverId, { clientKind: "mobile" });
    },
    onSuccess: (session, serverId) => {
      selectServer(serverId);
      setClientSession(session);
      setLocalError(null);
      if (onAuthenticated) {
        onAuthenticated();
        return;
      }
      router.replace("/");
    },
    onError: (error) => {
      setLocalError(
        error instanceof Error ? error.message : "Could not connect to Computer.",
      );
    },
  });

  const busy =
    signIn.isPending || claimPair.isPending || createSession.isPending;

  return {
    busy,
    claimPair,
    computersQuery,
    createSession,
    hasDeviceCredential,
    localError,
    selectedServerId,
    setLocalError,
    signIn,
  };
}
