import { useEffect, useMemo, useRef } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ProjectWorkspaceBootstrapResponse } from "@/api/types";
import { wsActions } from "@/api/ws-actions";
import { getAutoConnectComputerId } from "@/features/computers/computer-selection";
import { useRelayClient } from "@/hooks/use-relay-client";
import { requireDeviceCredential } from "@/lib/device-credential";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useComputerStore } from "@/stores/computer-store";
import { hydrateRecentWorkspaces, useRecentWorkspacesStore } from "@/stores/recent-workspaces-store";
import { useSessionStore } from "@/stores/session-store";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { Row, Separator } from "@/ui/layout/row";
import { NativeButton } from "@/ui/primitives/native-controls";

const EMPTY_BOOTSTRAP: ProjectWorkspaceBootstrapResponse = {
  projects: [],
  workspace_labels: [],
  workspaces_by_project: {},
  groups: [],
};

const WELCOME_HEADLINES = [
  "What should come alive in Atmos?",
  "What do you want Atmos to spin up next?",
  "What should Atmos start building with you?",
  "What idea deserves an Atmos workspace?",
] as const;

function randomWelcomeHeadline() {
  return WELCOME_HEADLINES[Math.floor(Math.random() * WELCOME_HEADLINES.length)] ?? WELCOME_HEADLINES[0];
}

export function WorkspaceListScreen() {
  const router = useRouter();
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
  const recentWorkspaceRecords = useRecentWorkspacesStore((state) => state.recentWorkspaces);
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
  const selectedComputer = computers.find((computer) => computer.server_id === selectedServerId) ?? null;
  const clientSessionUnavailable = wsState === "closed";
  const computersError = computersQuery.error instanceof Error ? computersQuery.error.message : null;

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
  const workspaceCount = useMemo(
    () => Object.values(bootstrap.workspaces_by_project).reduce((total, workspaces) => total + workspaces.length, 0),
    [bootstrap.workspaces_by_project],
  );
  const projectCount = bootstrap.projects.length;
  const canOpenWorkspaceData =
    hasDeviceCredential && wsState === "open" && !bootstrapQuery.error;
  const workspaceError = bootstrapQuery.error instanceof Error ? bootstrapQuery.error.message : null;
  const sessionError = createSession.error instanceof Error ? createSession.error.message : null;
  const welcomeHeadline = useMemo(randomWelcomeHeadline, []);
  const recentWorkspaces = useMemo(() => {
    const recordsForComputer = selectedServerId
      ? recentWorkspaceRecords.filter((record) => !record.serverId || record.serverId === selectedServerId)
      : recentWorkspaceRecords;
    return hydrateRecentWorkspaces(recordsForComputer, bootstrap);
  }, [bootstrap, recentWorkspaceRecords, selectedServerId]);

  const primaryAction = resolveHomePrimaryAction({
    canOpenWorkspaceData,
    hasDeviceCredential,
    wsState,
  });

  return (
    <AppScreen
      footer={
        <NativeButton
          label={primaryAction.label}
          onPress={() => router.push(primaryAction.route)}
        />
      }
    >
      <View className="items-center gap-3 px-2 pb-4 pt-8">
        <Text className="max-w-[320px] text-center font-bold text-label text-hero-title leading-hero-title tracking-hero-title">
          {welcomeHeadline}
        </Text>
        <Text
          className="max-w-[300px] text-center text-secondary-label text-hero-subtitle leading-hero-subtitle"
          numberOfLines={3}
        >
          {homeSubtitle({
            canOpenWorkspaceData,
            selectedComputerName: selectedComputer?.display_name ?? selectedServerId,
            workspaceCount,
          })}
        </Text>
        <Text className="text-secondary-label text-body-small leading-body-small">
          {workspaceListConnectionLabel(wsState)}
        </Text>
      </View>

      <Section label="Quick actions">
        <Row
          title="Connect Computer"
          subtitle={computerRowSubtitle(hasDeviceCredential, computers.length, wsState)}
          onPress={() => router.push("/computer-connect")}
        />
        <Separator />
        <Row
          title="Browse workspaces"
          subtitle={
            canOpenWorkspaceData
              ? `${workspaceCount} workspaces · ${projectCount} projects`
              : workspaceRowSubtitle(hasDeviceCredential, wsState, workspaceCount)
          }
          onPress={() => router.push("/workspaces")}
        />
      </Section>

      <Section label="Recently">
        {recentWorkspaces.length > 0 ? (
          recentWorkspaces.map((workspace, index) => (
            <View key={`${workspace.serverId ?? "unknown"}:${workspace.workspaceId}`}>
              <Row
                title={workspace.workspaceName}
                subtitle={workspace.projectName ?? "Workspace"}
                meta={formatRecentAccessedAt(workspace.lastAccessedAt)}
                onPress={() => router.push(`/workspace/${workspace.workspaceId}`)}
              />
              {index < recentWorkspaces.length - 1 ? <Separator /> : null}
            </View>
          ))
        ) : (
          <EmptyState
            layout="section"
            title="No recent workspaces"
            message="Open a workspace and it will appear here."
          />
        )}
      </Section>

      <InlineError message={sessionError ?? computersError ?? workspaceError} />
    </AppScreen>
  );
}

function resolveHomePrimaryAction({
  canOpenWorkspaceData,
  hasDeviceCredential,
  wsState,
}: {
  canOpenWorkspaceData: boolean;
  hasDeviceCredential: boolean;
  wsState: string;
}) {
  if (!hasDeviceCredential) {
    return { label: "Sign in", route: "/onboarding" as const };
  }
  if (canOpenWorkspaceData) {
    return { label: "Browse workspaces", route: "/workspaces" as const };
  }
  if (wsState === "open") {
    return { label: "Browse workspaces", route: "/workspaces" as const };
  }
  return { label: "Connect Computer", route: "/computer-connect" as const };
}

function formatRecentAccessedAt(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Recent";

  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) return "Now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d`;

  return "Recent";
}

function computerRowSubtitle(
  hasDeviceCredential: boolean,
  computerCount: number,
  wsState: string,
) {
  if (!hasDeviceCredential) return "Sign in required";
  if (computerCount === 0) return "No Computers";
  if (wsState === "open") return "Relay session active";
  if (wsState === "reconnecting") return "Reconnecting";
  return "Select a Computer";
}

function workspaceRowSubtitle(
  hasDeviceCredential: boolean,
  wsState: string,
  workspaceCount: number,
) {
  if (!hasDeviceCredential) return "Sign in to continue";
  if (wsState !== "open") return "Finish connecting to your Computer";
  if (workspaceCount === 0) return "No workspaces yet";
  return "Open a workspace";
}

function workspaceListConnectionLabel(wsState: string) {
  if (wsState === "open") return "Online";
  if (wsState === "connecting") return "Connecting";
  if (wsState === "reconnecting") return "Reconnecting";
  return "Offline";
}

function homeSubtitle({
  canOpenWorkspaceData,
  selectedComputerName,
  workspaceCount,
}: {
  canOpenWorkspaceData: boolean;
  selectedComputerName: string | null | undefined;
  workspaceCount: number;
}) {
  if (canOpenWorkspaceData) {
    return `${workspaceCount} workspaces are ready on ${selectedComputerName ?? "this Computer"}.`;
  }
  if (selectedComputerName) {
    return `${selectedComputerName} is selected. Finish connecting to load workspaces.`;
  }
  return "Connect a Computer, then open a workspace or start a new one.";
}
