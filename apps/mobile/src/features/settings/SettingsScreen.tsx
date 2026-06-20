import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComputerRow } from "@/api/types";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { NativeButton, NativeTextInput } from "@/ui/primitives/native-controls";
import { ChevronRightIcon, LaptopIcon } from "@/ui/icons/lucide-native";
import { getAccessTokenSwitchReadiness } from "@/features/settings/access-token-settings";
import { activeSettingsComputers } from "@/features/settings/computer-settings";
import { getRelayUrlSaveState } from "@/features/settings/relay-url-settings";
import { useRelayClient } from "@/hooks/use-relay-client";
import { clearAccessToken, generateAccessToken, getStoredAccessToken, storeAccessToken } from "@/lib/access-token";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";
import { colors } from "@/theme/colors";

type SettingsRoute = "/settings/computers";

type SettingsEntry = {
  description: string;
  icon: typeof LaptopIcon;
  id: string;
  route: SettingsRoute;
  summary: string;
  title: string;
};

export function SettingsScreen() {
  return <SettingsIndexScreen />;
}

export function SettingsIndexScreen() {
  const router = useRouter();
  const settings = useMobileSettingsController();
  const selectedComputer = settings.selectedComputer;
  const computerSummary = selectedComputer
    ? `${selectedComputer.display_name ?? selectedComputer.server_id} · ${selectedComputer.online ? "Online" : "Offline"}`
    : settings.activeComputers.length > 0
      ? `${settings.activeComputers.length} Computers`
      : "No Computers";

  const systemEntries: SettingsEntry[] = [
    {
      description: "Access Token, registration, and Computers linked to this phone.",
      icon: LaptopIcon,
      id: "atmos-computer",
      route: "/settings/computers",
      summary: computerSummary,
      title: "Atmos Computer",
    },
  ];

  return (
    <AppScreen>
      <Section label="System & Integration">
        <View style={styles.list}>
          {systemEntries.map((entry) => (
            <SettingsListItem
              entry={entry}
              key={entry.id}
              onPress={() => router.push(entry.route)}
            />
          ))}
        </View>
      </Section>

      <InlineError message={settings.error} />
    </AppScreen>
  );
}

export function SettingsComputersScreen() {
  const settings = useMobileSettingsController();
  const tokenSwitchReadiness = getAccessTokenSwitchReadiness({
    isSaving: settings.switchAccessToken.isPending,
    token: settings.tokenDraft,
  });

  return (
    <AppScreen>
      <Section label="Access Token">
        <View style={styles.block}>
          <NativeTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => {
              settings.setTokenDraft(value);
              settings.setError(null);
            }}
            placeholder="Paste another Access Token"
            secureTextEntry
            value={settings.tokenDraft}
          />
          <NativeButton
            label={settings.switchAccessToken.isPending ? "Switching..." : "Switch Access Token"}
            onPress={() => settings.switchAccessToken.mutate()}
            disabled={!tokenSwitchReadiness.canSwitch}
          />
          {settings.tokenDraft.trim() && tokenSwitchReadiness.reason ? (
            <SettingsHint message={tokenSwitchReadiness.reason} />
          ) : (
            <SettingsHint message="This token owns the Computers listed below." />
          )}
          <NativeButton
            label={settings.rotateToken.isPending ? "Rotating..." : "Rotate Access Token"}
            onPress={() => settings.rotateToken.mutate()}
            disabled={settings.rotateToken.isPending}
          />
          <NativeButton
            label={settings.resetToken.isPending ? "Resetting..." : "Reset This Phone"}
            onPress={settings.confirmResetPhone}
            disabled={settings.resetToken.isPending}
          />
          <SettingsHint message="Resetting this phone removes the local Access Token. Other devices keep working." />
        </View>
      </Section>

      <Section label="Relay">
        <View style={styles.block}>
          <NativeTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => {
              settings.setRelayDraft(value);
              settings.setError(null);
            }}
            placeholder="Relay URL"
            value={settings.relayDraft}
          />
          <NativeTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => {
              settings.setRelaySecretDraft(value);
              settings.setError(null);
            }}
            placeholder="Relay secret key (self-hosted only)"
            secureTextEntry
            value={settings.relaySecretDraft}
          />
          <NativeButton
            label={settings.saveRelaySettings.isPending ? "Saving..." : "Save Relay"}
            onPress={() => settings.saveRelaySettings.mutate()}
            disabled={!settings.canSaveRelaySettings || settings.saveRelaySettings.isPending}
          />
          <SettingsHint
            message={
              settings.canSaveRelaySettings
                ? "relay.atmos.land does not need a secret. Self-hosted relays use RELAY_SECRET_KEY."
                : "Relay settings are already saved."
            }
          />
        </View>
      </Section>

      <Section label="Register Computer">
        <View style={styles.block}>
          <NativeButton
            label={settings.createRegisterCommand.isPending ? "Creating..." : "Create Register Command"}
            onPress={() => settings.createRegisterCommand.mutate()}
            disabled={!settings.hasAccessToken || settings.createRegisterCommand.isPending}
          />
          {settings.registerCommand ? (
            <View style={styles.commandBlock}>
              <Text selectable style={styles.commandIntro}>
                Run this once on the machine that hosts Atmos Server.
              </Text>
              <Text selectable style={styles.commandText}>
                {settings.registerCommand}
              </Text>
            </View>
          ) : (
            <SettingsHint message="Create a one-time command to register another Mac or remote server." />
          )}
        </View>
      </Section>

      <Section label="My Computers">
        {settings.activeComputers.length === 0 ? (
          <View>
            <EmptyState
              title="No Computers"
              message="Register an Atmos Server or refresh after an existing Computer reconnects."
            />
            <View style={styles.blockTopless}>
              <NativeButton
                label={settings.computersQuery.isFetching ? "Refreshing..." : "Refresh Computers"}
                onPress={() => void settings.computersQuery.refetch()}
                disabled={settings.computersQuery.isFetching}
              />
            </View>
          </View>
        ) : (
          <View style={styles.list}>
            {settings.activeComputers.map((computer) => (
              <ComputerListItem
                key={computer.server_id}
                computer={computer}
                selectedServerId={settings.selectedServerId}
                onPress={() => settings.selectComputer(computer)}
              />
            ))}
          </View>
        )}
      </Section>

      <Section label="Selected Computer">
        <View style={styles.block}>
          <SelectedComputerSummary computer={settings.selectedComputer} />
          <NativeTextInput
            onChangeText={settings.setRenameValue}
            placeholder="New Computer name"
            value={settings.renameValue}
          />
          <NativeButton
            label={settings.rename.isPending ? "Renaming..." : "Rename"}
            onPress={() => settings.rename.mutate()}
            disabled={!settings.selectedServerId || settings.rename.isPending || !settings.renameValue.trim()}
          />
          <NativeButton
            label={settings.revoke.isPending ? "Revoking..." : "Revoke Selected Computer"}
            onPress={settings.confirmRevokeSelectedComputer}
            disabled={!settings.selectedServerId || settings.revoke.isPending}
          />
        </View>
      </Section>

      <InlineError message={settings.error} />
    </AppScreen>
  );
}

function useMobileSettingsController() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const client = useRelayClient();
  const relayUrl = useSessionStore((state) => state.relayUrl);
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
    queryKey: ["computers", relayUrl, relaySecretKey],
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
    relayDraft,
    relayUrl,
    createRegisterCommand,
    error,
    hasAccessToken,
    registerCommand,
    relaySecretDraft,
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
    setRelayDraft,
    setError,
    setRenameValue,
    setRelaySecretDraft,
    setTokenDraft,
    switchAccessToken,
    switchComputer,
    tokenDraft,
  };
}

function SettingsListItem({
  entry,
  onPress,
}: {
  entry: SettingsEntry;
  onPress: () => void;
}) {
  const Icon = entry.icon;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.settingsRow, pressed ? styles.pressedRow : null]}
    >
      <View style={styles.settingsRowLeading}>
        <View style={styles.iconWell}>
          <Icon color={colors.label} size={18} strokeWidth={2.4} />
        </View>
        <View style={styles.settingsRowText}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {entry.title}
          </Text>
          <Text numberOfLines={2} style={styles.rowDescription}>
            {entry.description}
          </Text>
        </View>
      </View>
      <View style={styles.trailing}>
        <Text numberOfLines={1} style={styles.trailingText}>
          {entry.summary}
        </Text>
        <ChevronRightIcon color={colors.tertiaryLabel} size={18} strokeWidth={2.6} />
      </View>
    </Pressable>
  );
}

function ComputerListItem({
  computer,
  onPress,
  selectedServerId,
}: {
  computer: ComputerRow;
  onPress: () => void;
  selectedServerId: string | null;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.settingsRow, pressed ? styles.pressedRow : null]}
    >
      <View style={styles.settingsRowText}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {computer.display_name ?? computer.server_id}
        </Text>
        <Text numberOfLines={1} style={styles.rowDescription}>
          {computer.server_id}
        </Text>
      </View>
      <ComputerStatus computer={computer} selectedServerId={selectedServerId} />
    </Pressable>
  );
}

function ComputerStatus({
  computer,
  selectedServerId,
}: {
  computer: ComputerRow;
  selectedServerId: string | null;
}) {
  return (
    <View style={styles.computerStatus}>
      {computer.server_id === selectedServerId ? <Text style={styles.selectedText}>Selected</Text> : null}
      <Text style={[styles.statusPill, computer.online ? styles.onlinePill : styles.offlinePill]}>
        {computer.online ? "Online" : "Offline"}
      </Text>
    </View>
  );
}

function SelectedComputerSummary({ computer }: { computer: ComputerRow | null }) {
  if (!computer) {
    return <SettingsHint message="Select a Computer before renaming or revoking it." />;
  }

  return (
    <View style={styles.summary}>
      <Text numberOfLines={1} style={styles.summaryTitle}>
        {computer.display_name ?? computer.server_id}
      </Text>
      <Text numberOfLines={1} style={styles.summaryText}>
        {computer.server_id}
      </Text>
    </View>
  );
}

function SettingsHint({ message }: { message: string }) {
  return (
    <Text selectable style={styles.hint}>
      {message}
    </Text>
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
  commandBlock: {
    backgroundColor: colors.terminalBg,
    borderCurve: "continuous",
    borderRadius: 10,
    gap: 10,
    overflow: "hidden",
    padding: 14,
  },
  commandIntro: {
    color: colors.terminalMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  commandText: {
    color: colors.terminalFg,
    fontFamily: "Menlo",
    fontSize: 12,
    lineHeight: 18,
  },
  computerStatus: {
    alignItems: "flex-end",
    gap: 6,
  },
  hint: {
    color: colors.secondaryLabel,
    fontSize: 12,
    lineHeight: 16,
  },
  iconWell: {
    alignItems: "center",
    backgroundColor: colors.cardSubtle,
    borderColor: colors.separator,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  offlinePill: {
    backgroundColor: "rgba(63, 63, 70, 0.08)",
    color: colors.secondaryLabel,
  },
  onlinePill: {
    backgroundColor: colors.greenSurface,
    color: colors.green,
  },
  list: {
    paddingVertical: 4,
  },
  pressedRow: {
    backgroundColor: colors.mutedPressed,
  },
  rowDescription: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  rowTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  selectedText: {
    color: colors.label,
    fontSize: 12,
    fontWeight: "700",
  },
  settingsRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 78,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  settingsRowLeading: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
    minWidth: 0,
  },
  settingsRowText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  statusPill: {
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  summary: {
    gap: 3,
  },
  summaryText: {
    color: colors.secondaryLabel,
    fontSize: 12,
    lineHeight: 16,
  },
  summaryTitle: {
    color: colors.label,
    fontSize: 17,
    fontWeight: "800",
  },
  trailing: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    maxWidth: 150,
  },
  trailingText: {
    color: colors.secondaryLabel,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
  },
});
