import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";
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
import { AppScreen, InlineError } from "@/ui/layout/app-screen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

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
  const selectServer = useSessionStore((state) => state.selectServer);
  const setClientSession = useSessionStore((state) => state.setClientSession);
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
      selectServer(serverId);
      setClientSession(session);
    },
  });

  useEffect(() => {
    if (!hasDeviceCredential || !computersQuery.isSuccess) return;
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
  }, [activeClientSession, clientSessionUnavailable, computers, computersQuery.isSuccess, createSession, hasDeviceCredential, selectedServerId]);

  const bootstrapQuery = useQuery({
    queryKey: ["workspace-bootstrap", selectedServerId, wsState],
    enabled: Boolean(wsClient && wsState === "open"),
    queryFn: () => wsActions.projectWorkspaceBootstrap(wsClient!),
  });

  const bootstrap = bootstrapQuery.data ?? EMPTY_BOOTSTRAP;
  const workspaceError = bootstrapQuery.error instanceof Error ? bootstrapQuery.error.message : null;
  const sessionError = createSession.error instanceof Error ? createSession.error.message : null;

  const header = (
    <Stack.Screen
      options={{
        ...nativeLargeTitleOptions("Workspace", theme.colors),
        // Drop the custom header so these use the same navigation-bar buttons as Back.
        header: undefined,
        headerShadowVisible: false,
        headerTintColor: theme.colors.label,
        ...(process.env.EXPO_OS === "ios"
          ? {
              unstable_headerLeftItems: () => [
                {
                  type: "button" as const,
                  label: "",
                  accessibilityLabel: "Settings",
                  icon: { type: "sfSymbol" as const, name: "gearshape" as SFSymbol },
                  onPress: () => router.push("/settings"),
                  sharesBackground: false,
                  tintColor: theme.colors.label,
                },
              ],
              unstable_headerRightItems: () =>
                isHomeConnected
                  ? [
                      {
                        type: "button" as const,
                        label: "",
                        accessibilityLabel: "Filter",
                        icon: {
                          type: "sfSymbol" as const,
                          name: "line.3.horizontal.decrease" as SFSymbol,
                        },
                        onPress: () => router.push("/workspace-filters"),
                        sharesBackground: false,
                        tintColor: theme.colors.label,
                      },
                    ]
                  : [],
            }
          : {}),
      }}
    />
  );

  if (!isHomeConnected) {
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
      <AppScreen>
        <WorkspaceHomeList
          groups={bootstrap.groups ?? []}
          isLoading={bootstrapQuery.isPending}
          projects={bootstrap.projects}
          workspacesByProject={bootstrap.workspaces_by_project}
        />
        <InlineError message={sessionError ?? computersError ?? workspaceError} />
      </AppScreen>
    </>
  );
}
