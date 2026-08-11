import { useMemo, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComputerRow } from "@/api/types";
import { activeSettingsComputers } from "@/features/settings/computer-settings";
import { getRelayUrlSaveState } from "@/features/settings/relay-url-settings";
import { useRelayClient } from "@/hooks/use-relay-client";
import {
  requireDeviceCredential,
  signOutThisPhone,
} from "@/lib/device-credential";
import {
  clearRelaySecretKey,
  storeRelaySecretKey,
} from "@/lib/relay-secret-key";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";

export function useMobileSettingsController() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const client = useRelayClient();
  const relayUrl = useSessionStore((state) => state.relayUrl);
  const relayAuthRevision = useSessionStore((state) => state.relayAuthRevision);
  const hasDeviceCredential = useSessionStore(
    (state) => state.hasDeviceCredential,
  );
  const relaySecretKey = useSessionStore((state) => state.relaySecretKey);
  const setRelayUrl = useSessionStore((state) => state.setRelayUrl);
  const setRelaySecretKey = useSessionStore((state) => state.setRelaySecretKey);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const selectServer = useSessionStore((state) => state.selectServer);
  const setClientSession = useSessionStore((state) => state.setClientSession);
  const clearClientSession = useSessionStore((state) => state.clearClientSession);
  const clearSession = useSessionStore((state) => state.clearSession);
  const setComputers = useComputerStore((state) => state.setComputers);
  const [relayDraft, setRelayDraft] = useState(relayUrl);
  const [renameValue, setRenameValue] = useState("");
  const [registerCommand, setRegisterCommand] = useState<string | null>(null);
  const [relaySecretDraft, setRelaySecretDraft] = useState(relaySecretKey);
  const [error, setError] = useState<string | null>(null);

  const computersQuery = useQuery({
    queryKey: ["computers", relayUrl, relayAuthRevision],
    enabled: hasDeviceCredential,
    queryFn: async () => {
      const token = requireDeviceCredential();
      return client.withDeviceCredential(token).listComputers();
    },
  });
  const activeComputers = activeSettingsComputers(computersQuery.data ?? []);
  const selectedComputer = useMemo(
    () =>
      activeComputers.find((computer) => computer.server_id === selectedServerId) ??
      null,
    [activeComputers, selectedServerId],
  );
  const relayUrlSaveState = getRelayUrlSaveState({
    currentUrl: relayUrl,
    draftUrl: relayDraft,
  });
  const normalizedRelaySecretDraft = relaySecretDraft.trim();
  const canSaveRelaySettings =
    relayUrlSaveState.canSave || normalizedRelaySecretDraft !== relaySecretKey;

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
      Alert.alert(
        "Relay saved",
        "Select a Computer to create a fresh mobile session.",
      );
    },
    onError: (nextError) =>
      setError(
        nextError instanceof Error ? nextError.message : "Could not save Relay.",
      ),
  });

  const switchComputer = useMutation({
    mutationFn: async (serverId: string) => {
      const token = requireDeviceCredential();
      return client
        .withDeviceCredential(token)
        .createClientSession(serverId, { clientKind: "mobile" });
    },
    onSuccess: (session, serverId) => {
      selectServer(serverId);
      setClientSession(session);
      setError(null);
    },
    onError: (nextError) =>
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Computer switch failed.",
      ),
  });

  const createRegisterCommand = useMutation({
    mutationFn: async () => {
      const token = requireDeviceCredential();
      return client.withDeviceCredential(token).createRegisterToken();
    },
    onSuccess: (registerToken) => {
      setRegisterCommand(registerToken.register_command);
      setError(null);
    },
    onError: (nextError) =>
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Could not create register command.",
      ),
  });

  const rename = useMutation({
    mutationFn: async () => {
      const token = requireDeviceCredential();
      if (!selectedServerId) throw new Error("Select a Computer first.");
      return client
        .withDeviceCredential(token)
        .renameComputer(selectedServerId, renameValue.trim());
    },
    onSuccess: () => {
      setRenameValue("");
      void queryClient.invalidateQueries({ queryKey: ["computers"] });
    },
    onError: (nextError) =>
      setError(nextError instanceof Error ? nextError.message : "Rename failed."),
  });

  const revoke = useMutation({
    mutationFn: async (serverId: string) => {
      const token = requireDeviceCredential();
      return client.withDeviceCredential(token).revokeComputer(serverId);
    },
    onSuccess: (_, serverId) => {
      if (selectedServerId === serverId) selectServer(null);
      void queryClient.invalidateQueries({ queryKey: ["computers"] });
    },
    onError: (nextError) =>
      setError(nextError instanceof Error ? nextError.message : "Revoke failed."),
  });

  const signOutPhone = useMutation({
    mutationFn: async () => {
      await signOutThisPhone();
      await clearRelaySecretKey();
    },
    onSuccess: async () => {
      clearSession();
      setRelaySecretKey("");
      setComputers([]);
      setError(null);
      await queryClient.invalidateQueries();
      router.replace("/onboarding");
    },
    onError: (nextError) =>
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Could not sign out this phone.",
      ),
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
    Alert.alert(
      "Revoke Computer",
      "This Computer will be removed from your Hub account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: () => revoke.mutate(selectedServerId),
        },
      ],
    );
  };

  const confirmSignOutPhone = () => {
    Alert.alert(
      "Sign out this phone",
      "Revokes this phone’s Hub device and clears local credentials.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => signOutPhone.mutate(),
        },
      ],
    );
  };

  return {
    activeComputers,
    canSaveRelaySettings,
    computersQuery,
    confirmRevokeSelectedComputer,
    confirmSignOutPhone,
    createRegisterCommand,
    error,
    hasDeviceCredential,
    registerCommand,
    relayDraft,
    relaySecretDraft,
    relayUrl,
    relayUrlSaveState,
    rename,
    renameValue,
    revoke,
    saveRelaySettings,
    selectComputer,
    selectedComputer,
    selectedServerId,
    setError,
    setRelayDraft,
    setRelaySecretDraft,
    setRenameValue,
    signOutPhone,
    switchComputer,
  };
}
