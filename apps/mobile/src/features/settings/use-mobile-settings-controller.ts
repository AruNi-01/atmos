import { useMemo, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComputerRow } from "@/api/types";
import { getAccessTokenSwitchReadiness } from "@/features/settings/access-token-settings";
import { activeSettingsComputers } from "@/features/settings/computer-settings";
import { getRelayUrlSaveState } from "@/features/settings/relay-url-settings";
import { useRelayClient } from "@/hooks/use-relay-client";
import { clearAccessToken, generateAccessToken, getStoredAccessToken, storeAccessToken } from "@/lib/access-token";
import { clearRelaySecretKey, storeRelaySecretKey } from "@/lib/relay-secret-key";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";

export function useMobileSettingsController() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const client = useRelayClient();
  const relayUrl = useSessionStore((state) => state.relayUrl);
  const relayAuthRevision = useSessionStore((state) => state.relayAuthRevision);
  const hasAccessToken = useSessionStore((state) => state.hasAccessToken);
  const relaySecretKey = useSessionStore((state) => state.relaySecretKey);
  const setRelayUrl = useSessionStore((state) => state.setRelayUrl);
  const setRelaySecretKey = useSessionStore((state) => state.setRelaySecretKey);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const selectServer = useSessionStore((state) => state.selectServer);
  const setClientSession = useSessionStore((state) => state.setClientSession);
  const setAccessTokenLoaded = useSessionStore((state) => state.setAccessTokenLoaded);
  const clearClientSession = useSessionStore((state) => state.clearClientSession);
  const clearSession = useSessionStore((state) => state.clearSession);
  const setComputers = useComputerStore((state) => state.setComputers);
  const [relayDraft, setRelayDraft] = useState(relayUrl);
  const [renameValue, setRenameValue] = useState("");
  const [registerCommand, setRegisterCommand] = useState<string | null>(null);
  const [relaySecretDraft, setRelaySecretDraft] = useState(relaySecretKey);
  const [tokenDraft, setTokenDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const computersQuery = useQuery({
    queryKey: ["computers", relayUrl, relayAuthRevision],
    queryFn: async () => {
      const token = await getStoredAccessToken();
      if (!token) return [];
      return client.listComputers(token);
    },
  });
  const activeComputers = activeSettingsComputers(computersQuery.data ?? []);
  const selectedComputer = useMemo(
    () => activeComputers.find((computer) => computer.server_id === selectedServerId) ?? null,
    [activeComputers, selectedServerId],
  );
  const relayUrlSaveState = getRelayUrlSaveState({
    currentUrl: relayUrl,
    draftUrl: relayDraft,
  });
  const normalizedRelaySecretDraft = relaySecretDraft.trim();
  const canSaveRelaySettings = relayUrlSaveState.canSave || normalizedRelaySecretDraft !== relaySecretKey;

  const saveRelaySettings = useMutation({
    mutationFn: async () => {
      if (!canSaveRelaySettings) {
        throw new Error("Relay settings are already saved.");
      }
      await storeRelaySecretKey(normalizedRelaySecretDraft);
      return {
        secretKey: normalizedRelaySecretDraft,
        url: relayUrlSaveState.normalizedUrl,
      };
    },
    onSuccess: ({ secretKey, url }) => {
      setRelayUrl(url);
      setRelaySecretKey(secretKey);
      setRelayDraft(url);
      setRelaySecretDraft(secretKey);
      clearClientSession();
      setComputers([]);
      queryClient.removeQueries({ queryKey: ["computers"] });
      setError(null);
      Alert.alert("Relay saved", "Select a Computer to create a fresh mobile session.");
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Could not save Relay."),
  });

  const switchComputer = useMutation({
    mutationFn: async (serverId: string) => {
      const token = await getStoredAccessToken();
      if (!token) throw new Error("Access Token is not available.");
      return client.createClientSession(token, serverId);
    },
    onSuccess: (session, serverId) => {
      selectServer(serverId);
      setClientSession(session);
      setError(null);
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Computer switch failed."),
  });

  const createRegisterCommand = useMutation({
    mutationFn: async () => {
      const token = await getStoredAccessToken();
      if (!token) throw new Error("Access Token is not available.");
      return client.createRegisterToken(token);
    },
    onSuccess: (registerToken) => {
      setRegisterCommand(registerToken.register_command);
      setError(null);
    },
    onError: (nextError) =>
      setError(nextError instanceof Error ? nextError.message : "Could not create register command."),
  });

  const rename = useMutation({
    mutationFn: async () => {
      const token = await getStoredAccessToken();
      if (!token || !selectedServerId) throw new Error("Select a Computer first.");
      return client.renameComputer(token, selectedServerId, renameValue.trim());
    },
    onSuccess: () => {
      setRenameValue("");
      void queryClient.invalidateQueries({ queryKey: ["computers"] });
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Rename failed."),
  });

  const revoke = useMutation({
    mutationFn: async (serverId: string) => {
      const token = await getStoredAccessToken();
      if (!token) throw new Error("Access Token is not available.");
      return client.revokeComputer(token, serverId);
    },
    onSuccess: (_, serverId) => {
      if (selectedServerId === serverId) selectServer(null);
      void queryClient.invalidateQueries({ queryKey: ["computers"] });
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Revoke failed."),
  });

  const switchAccessToken = useMutation({
    mutationFn: async () => {
      const nextToken = tokenDraft.trim();
      const readiness = getAccessTokenSwitchReadiness({
        isSaving: false,
        token: nextToken,
      });
      if (!readiness.canSwitch) {
        throw new Error(readiness.reason ?? "Paste a valid Access Token first.");
      }
      await client.registerTenant(nextToken);
      await storeAccessToken(nextToken);
    },
    onSuccess: async () => {
      setTokenDraft("");
      setAccessTokenLoaded(true);
      clearClientSession();
      setComputers([]);
      setError(null);
      await queryClient.invalidateQueries();
      Alert.alert("Access Token switched", "Select a Computer to create a fresh mobile session.");
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Could not switch Access Token."),
  });

  const rotateToken = useMutation({
    mutationFn: async () => {
      const current = await getStoredAccessToken();
      if (!current) throw new Error("No Access Token is stored.");
      const next = await generateAccessToken();
      await client.rotateTenantToken(current, next);
      await storeAccessToken(next);
    },
    onSuccess: async () => {
      setAccessTokenLoaded(true);
      clearClientSession();
      setComputers([]);
      setError(null);
      await queryClient.invalidateQueries();
      Alert.alert("Access Token rotated", "Select a Computer again to create a fresh mobile session.");
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Could not rotate Access Token."),
  });

  const resetToken = useMutation({
    mutationFn: async () => {
      await clearAccessToken();
      await clearRelaySecretKey();
    },
    onSuccess: async () => {
      clearSession();
      setRelaySecretKey("");
      setTokenDraft("");
      setComputers([]);
      setError(null);
      await queryClient.invalidateQueries();
      router.replace("/onboarding");
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Could not reset this phone."),
  });

  const selectComputer = (computer: ComputerRow) => {
    if (computer.online) {
      switchComputer.mutate(computer.server_id);
      return;
    }
    selectServer(computer.server_id);
  };

  const confirmRevokeSelectedComputer = () => {
    if (!selectedServerId) return;
    Alert.alert("Revoke Computer", "This Computer will be removed from this Access Token.", [
      { text: "Cancel", style: "cancel" },
      { text: "Revoke", style: "destructive", onPress: () => revoke.mutate(selectedServerId) },
    ]);
  };

  const confirmResetPhone = () => {
    Alert.alert("Reset This Phone", "Remove the local Access Token and return to setup.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: () => resetToken.mutate() },
    ]);
  };

  return {
    activeComputers,
    canSaveRelaySettings,
    computersQuery,
    confirmResetPhone,
    confirmRevokeSelectedComputer,
    createRegisterCommand,
    error,
    hasAccessToken,
    registerCommand,
    relayDraft,
    relaySecretDraft,
    relayUrl,
    relayUrlSaveState,
    rename,
    renameValue,
    resetToken,
    revoke,
    rotateToken,
    saveRelaySettings,
    selectComputer,
    selectedComputer,
    selectedServerId,
    setError,
    setRelayDraft,
    setRelaySecretDraft,
    setRenameValue,
    setTokenDraft,
    switchAccessToken,
    switchComputer,
    tokenDraft,
  };
}
