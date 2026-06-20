import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { NativeButton, NativeList, NativeListItem, NativeTextInput } from "@/ui/primitives/native-controls";
import { getAccessTokenSwitchReadiness } from "@/features/settings/access-token-settings";
import { activeSettingsComputers } from "@/features/settings/computer-settings";
import { getRelayUrlSaveState } from "@/features/settings/relay-url-settings";
import { useControlPlaneClient } from "@/hooks/use-control-plane-client";
import { clearAccessToken, generateAccessToken, getStoredAccessToken, storeAccessToken } from "@/lib/access-token";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";
import { colors } from "@/theme/colors";

export function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const client = useControlPlaneClient();
  const controlPlaneUrl = useSessionStore((state) => state.controlPlaneUrl);
  const setControlPlaneUrl = useSessionStore((state) => state.setControlPlaneUrl);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const selectServer = useSessionStore((state) => state.selectServer);
  const setClientSession = useSessionStore((state) => state.setClientSession);
  const setAccessTokenLoaded = useSessionStore((state) => state.setAccessTokenLoaded);
  const clearClientSession = useSessionStore((state) => state.clearClientSession);
  const clearSession = useSessionStore((state) => state.clearSession);
  const setComputers = useComputerStore((state) => state.setComputers);
  const [controlPlaneDraft, setControlPlaneDraft] = useState(controlPlaneUrl);
  const [renameValue, setRenameValue] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const computersQuery = useQuery({
    queryKey: ["computers", controlPlaneUrl],
    queryFn: async () => {
      const token = await getStoredAccessToken();
      if (!token) return [];
      return client.listComputers(token);
    },
  });
  const activeComputers = activeSettingsComputers(computersQuery.data ?? []);
  const relayUrlSaveState = getRelayUrlSaveState({
    currentUrl: controlPlaneUrl,
    draftUrl: controlPlaneDraft,
  });

  const saveRelayUrl = useMutation({
    mutationFn: async () => {
      if (!relayUrlSaveState.canSave) {
        throw new Error(relayUrlSaveState.reason ?? "Enter a Relay URL.");
      }
      return relayUrlSaveState.normalizedUrl;
    },
    onSuccess: (nextUrl) => {
      setControlPlaneUrl(nextUrl);
      setControlPlaneDraft(nextUrl);
      clearClientSession();
      setComputers([]);
      queryClient.removeQueries({ queryKey: ["computers"] });
      setError(null);
      Alert.alert("Relay URL saved", "Select a Computer to create a fresh mobile session.");
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Could not save Relay URL."),
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
    },
    onSuccess: async () => {
      clearSession();
      setTokenDraft("");
      setComputers([]);
      setError(null);
      await queryClient.invalidateQueries();
      router.replace("/onboarding");
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Could not reset this phone."),
  });
  const tokenSwitchReadiness = getAccessTokenSwitchReadiness({
    isSaving: switchAccessToken.isPending,
    token: tokenDraft,
  });

  return (
    <AppScreen>
      <Section label="Connection">
        <View style={styles.block}>
          <NativeTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => {
              setControlPlaneDraft(value);
              setError(null);
            }}
            placeholder="Relay control plane URL"
            value={controlPlaneDraft}
          />
          <NativeButton
            label={saveRelayUrl.isPending ? "Saving..." : "Save Relay URL"}
            onPress={() => saveRelayUrl.mutate()}
            disabled={!relayUrlSaveState.canSave || saveRelayUrl.isPending}
          />
          {controlPlaneDraft.trim() && relayUrlSaveState.reason ? (
            <Text selectable style={styles.hint}>
              {relayUrlSaveState.reason}
            </Text>
          ) : null}
        </View>
      </Section>

      <Section label="Computers">
        {activeComputers.length === 0 ? (
          <View>
            <EmptyState
              title="No Computers"
              message="Register an Atmos Server or refresh after an existing Computer reconnects."
            />
            <View style={styles.blockTopless}>
              <NativeButton
                label={computersQuery.isFetching ? "Refreshing..." : "Refresh Computers"}
                onPress={() => void computersQuery.refetch()}
                disabled={computersQuery.isFetching}
              />
            </View>
          </View>
        ) : (
          <NativeList>
            {activeComputers.map((computer) => (
              <NativeListItem
                key={computer.server_id}
                title={computer.display_name ?? computer.server_id}
                supportingText={computer.server_id}
                trailing={computer.server_id === selectedServerId ? "Selected" : computer.online ? "Online" : "Offline"}
                onPress={() => {
                  if (computer.online) {
                    switchComputer.mutate(computer.server_id);
                    return;
                  }
                  selectServer(computer.server_id);
                }}
              />
            ))}
          </NativeList>
        )}
      </Section>

      <Section label="Selected Computer">
        <View style={styles.block}>
          <NativeTextInput
            onChangeText={setRenameValue}
            placeholder="New Computer name"
            value={renameValue}
          />
          <NativeButton
            label={rename.isPending ? "Renaming..." : "Rename"}
            onPress={() => rename.mutate()}
            disabled={!selectedServerId || rename.isPending || !renameValue.trim()}
          />
          <NativeButton
            label={revoke.isPending ? "Revoking..." : "Revoke Selected Computer"}
            onPress={() => selectedServerId && revoke.mutate(selectedServerId)}
            disabled={!selectedServerId || revoke.isPending}
          />
        </View>
      </Section>

      <Section label="Access Token">
        <View style={styles.block}>
          <NativeTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => {
              setTokenDraft(value);
              setError(null);
            }}
            placeholder="Paste another Access Token"
            secureTextEntry
            value={tokenDraft}
          />
          <NativeButton
            label={switchAccessToken.isPending ? "Switching..." : "Switch Access Token"}
            onPress={() => switchAccessToken.mutate()}
            disabled={!tokenSwitchReadiness.canSwitch}
          />
          {tokenDraft.trim() && tokenSwitchReadiness.reason ? (
            <Text selectable style={styles.hint}>
              {tokenSwitchReadiness.reason}
            </Text>
          ) : null}
          <NativeButton
            label={rotateToken.isPending ? "Rotating..." : "Rotate Access Token"}
            onPress={() => rotateToken.mutate()}
            disabled={rotateToken.isPending}
          />
          <NativeButton
            label={resetToken.isPending ? "Resetting..." : "Reset This Phone"}
            onPress={() => resetToken.mutate()}
            disabled={resetToken.isPending}
          />
        </View>
      </Section>

      <InlineError message={error} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 12,
    padding: 16,
  },
  blockTopless: {
    gap: 12,
    padding: 16,
    paddingTop: 0,
  },
  hint: {
    color: colors.secondaryLabel,
    fontSize: 12,
    lineHeight: 16,
  },
});
