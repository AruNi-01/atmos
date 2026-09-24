import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Button, Host } from "@expo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import type { ProjectWorkspaceBootstrapResponse } from "@/api/types";
import { wsActions } from "@/api/ws-actions";
import { getAutoConnectComputerId } from "@/features/computers/computer-selection";
import { AuthConnectContent } from "@/features/onboarding/AuthConnectContent";
import { WorkspaceHomeList } from "@/features/workspaces/WorkspaceHomeList";

import { useRelayClient } from "@/hooks/use-relay-client";
import { requireDeviceCredential } from "@/lib/device-credential";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";
import { useMobileTheme } from "@/theme/theme-store";
import { ListFilterIcon, SettingsIcon } from "@/ui/icons/lucide-native";
import { AppScreen, EmptyState, InlineError } from "@/ui/layout/app-screen";
import { settingsHeaderItem, workspaceFilterHeaderItem } from "@/ui/navigation/home-header-items";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { expoUiButtonStretchModifiers } from "@/ui/primitives/expo-ui-button-modifiers";
import { expoUiButtonHostStyle, expoUiPrimaryStyle } from "@/ui/primitives/expo-ui-button-styles";

function workspaceHeaderRightItems({
  onFilter,
  onSettings,
  showFilter,
  tintColor,
}: {
  onFilter: () => void;
  onSettings: () => void;
  showFilter: boolean;
  tintColor: string;
}) {
  const settings = settingsHeaderItem(onSettings, tintColor);
  if (!showFilter) return [settings];
  // First item is the trailing edge on iOS. Filter sits on that edge.
  return [workspaceFilterHeaderItem(onFilter, tintColor), settings];
}

const EMPTY_BOOTSTRAP: ProjectWorkspaceBootstrapResponse = {
  projects: [],
  workspace_labels: [],
  workspaces_by_project: {},
  groups: [],
};

export function WorkspaceListScreen() {
  const router = useRouter();
  const theme = useMobileTheme();
  const relayClient = useRelayClient();
  const { client: wsClient, state: wsState } = useMobileWs();
  const deviceCredentialLoaded = useSessionStore(
    (state) => state.deviceCredentialLoaded,
  );
  const hasDeviceCredential = useSessionStore(
    (state) => state.hasDeviceCredential,
  );
  const relayUrl = useSessionStore((state) => state.relayUrl);
  const relayAuthRevision = useSessionStore((state) => state.relayAuthRevision);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const activeClientSession = useSessionStore((state) => state.activeClientSession);
  const sessionHydrated = useSessionStore((state) => state.sessionHydrated);
  const adoptComputerSession = useSessionStore((state) => state.adoptComputerSession);
  const setComputers = useComputerStore((state) => state.setComputers);
  const lastAutoSessionAttemptRef = useRef<string | null>(null);

  const computersQuery = useQuery({
    queryKey: ["computers", relayUrl, relayAuthRevision],
    enabled: deviceCredentialLoaded && hasDeviceCredential,
    queryFn: async () => {
      const token = requireDeviceCredential();
      const computers = await relayClient.withDeviceCredential(token).listComputers();
      setComputers(computers);
      return computers;
    },
  });

  const computers = computersQuery.data ?? [];
  const clientSessionUnavailable = wsState === "closed";
  const computersError = computersQuery.error instanceof Error ? computersQuery.error.message : null;
  const isHomeConnected = hasDeviceCredential && wsState === "open";

  const createSession = useMutation({
    mutationFn: async (serverId: string) => {
      const token = requireDeviceCredential();
      return relayClient
        .withDeviceCredential(token)
        .createClientSession(serverId, { clientKind: "mobile" });
    },
    onSuccess: (session, serverId) => {
      adoptComputerSession(serverId, session);
    },
  });

  useEffect(() => {
    if (!sessionHydrated || !hasDeviceCredential || !computersQuery.isSuccess) return;
    const shouldReconnect = Boolean(activeClientSession && clientSessionUnavailable);
    const nextAutoConnectServerId = getAutoConnectComputerId({
      activeClientSession: shouldReconnect ? null : activeClientSession,
      computers,
      selectedServerId,
    });
    const attemptKey = nextAutoConnectServerId ? `${nextAutoConnectServerId}:${shouldReconnect ? "reconnect" : "initial"}` : null;
    if (nextAutoConnectServerId && lastAutoSessionAttemptRef.current !== attemptKey) {
      lastAutoSessionAttemptRef.current = attemptKey;
      createSession.mutate(nextAutoConnectServerId);
    }
  }, [activeClientSession, clientSessionUnavailable, computers, computersQuery.isSuccess, createSession, hasDeviceCredential, selectedServerId, sessionHydrated]);

  const bootstrapQuery = useQuery({
    queryKey: ["workspace-bootstrap", selectedServerId, wsState],
    enabled: Boolean(wsClient && wsState === "open"),
    queryFn: () => wsActions.projectWorkspaceBootstrap(wsClient!),
  });

  const bootstrap = bootstrapQuery.data ?? EMPTY_BOOTSTRAP;
  const workspaceError = bootstrapQuery.error instanceof Error ? bootstrapQuery.error.message : null;
  const sessionError = createSession.error instanceof Error ? createSession.error.message : null;
  const [refreshing, setRefreshing] = useState(false);
  const refreshWorkspaces = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([computersQuery.refetch(), bootstrapQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [bootstrapQuery, computersQuery]);

  const header = (
    <Stack.Screen
      options={{
        ...nativeLargeTitleOptions("Workspace", theme.colors),
        headerShadowVisible: false,
        headerTintColor: theme.colors.label,
        ...(process.env.EXPO_OS === "ios"
          ? {
              unstable_headerRightItems: () =>
                workspaceHeaderRightItems({
                  onFilter: () => router.push("/workspace-filters"),
                  onSettings: () => router.push("/settings"),
                  showFilter: isHomeConnected,
                  tintColor: theme.colors.label,
                }),
            }
          : {
              headerLeft: () => (
                <Pressable
                  accessibilityLabel="Settings"
                  accessibilityRole="button"
                  hitSlop={12}
                  onPress={() => router.push("/settings")}
                >
                  <SettingsIcon color={theme.colors.label} size={22} strokeWidth={2.2} />
                </Pressable>
              ),
              headerRight: () =>
                isHomeConnected ? (
                  <Pressable
                    accessibilityLabel="Filter"
                    accessibilityRole="button"
                    hitSlop={12}
                    onPress={() => router.push("/workspace-filters")}
                  >
                    <ListFilterIcon color={theme.colors.label} size={22} strokeWidth={2.2} />
                  </Pressable>
                ) : null,
            }),
      }}
    />
  );

  const cachedComputerId =
    sessionHydrated && computersQuery.isSuccess
      ? getAutoConnectComputerId({
          activeClientSession: null,
          computers,
          selectedServerId,
        })
      : null;
  const isConnectingCachedComputer =
    hasDeviceCredential &&
    !createSession.isError &&
    (createSession.isPending ||
      (Boolean(cachedComputerId || activeClientSession) && wsState !== "open"));
  const isLoadingHome =
    !deviceCredentialLoaded ||
    !sessionHydrated ||
    (hasDeviceCredential && computersQuery.isPending) ||
    isConnectingCachedComputer ||
    (isHomeConnected && bootstrapQuery.isPending);
  const needsComputerChoice =
    hasDeviceCredential &&
    sessionHydrated &&
    computersQuery.isFetched &&
    !isConnectingCachedComputer &&
    wsState !== "open";

  if (!hasDeviceCredential && deviceCredentialLoaded && sessionHydrated) {
    // Same pair / OAuth surface as the sign-in sheet, embedded full-page under
    // the Workspace header — no intermediate empty “Pair via QR” home.
    return (
      <>
        {header}
        <AuthConnectContent presentation="screen" />
      </>
    );
  }

  return (
    <>
      {header}
      {isLoadingHome ? (
        <HomeLoading />
      ) : needsComputerChoice ? (
        <ChooseComputerPrompt
          message={sessionError ?? computersError}
          onPress={() => router.push("/settings/computers")}
        />
      ) : (
        <AppScreen onRefresh={refreshWorkspaces} refreshing={refreshing}>
          <WorkspaceHomeList
            groups={bootstrap.groups ?? []}
            isLoading={bootstrapQuery.isPending}
            projects={bootstrap.projects}
            workspacesByProject={bootstrap.workspaces_by_project}
          />
          <InlineError message={sessionError ?? computersError ?? workspaceError} />
        </AppScreen>
      )}
    </>
  );
}

function HomeLoading() {
  const theme = useMobileTheme();

  return (
    <AppScreen contentFlex>
      <View style={{ alignItems: "center", gap: 12 }}>
        <ActivityIndicator color={theme.colors.secondaryLabel} />
        <Text style={{ color: theme.colors.secondaryLabel, fontSize: 15, lineHeight: 20 }}>Loading</Text>
      </View>
    </AppScreen>
  );
}

function ChooseComputerPrompt({
  message,
  onPress,
}: {
  message?: string | null;
  onPress: () => void;
}) {
  const theme = useMobileTheme();
  const button = expoUiPrimaryStyle(theme.colors);

  return (
    <AppScreen contentFlex>
      <View style={{ alignSelf: "stretch", gap: 20, paddingHorizontal: 8 }}>
        <EmptyState
          message="Choose a Computer to see workspaces."
          title="No Computer selected"
        />
        <Host
          colorScheme={theme.colorScheme}
          matchContents={{ vertical: true }}
          seedColor={button.seedColor}
          style={expoUiButtonHostStyle}
        >
          <Button
            label="Choose a Computer"
            modifiers={expoUiButtonStretchModifiers}
            onPress={onPress}
            style={button.style}
            variant={button.variant}
          />
        </Host>
        <InlineError message={message} />
      </View>
    </AppScreen>
  );
}
