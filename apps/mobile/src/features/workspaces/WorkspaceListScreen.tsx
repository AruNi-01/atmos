import { useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ProjectWorkspaceBootstrapResponse } from "@/api/types";
import { wsActions } from "@/api/ws-actions";
import { getAutoConnectComputerId, selectableOnlineComputers } from "@/features/computers/computer-selection";
import { useControlPlaneClient } from "@/hooks/use-control-plane-client";
import { getStoredAccessToken } from "@/lib/access-token";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";
import { AppScreen, InlineError } from "@/ui/layout/app-screen";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { colors } from "@/theme/colors";

const EMPTY_BOOTSTRAP: ProjectWorkspaceBootstrapResponse = {
  projects: [],
  workspace_labels: [],
  workspaces_by_project: {},
};

export function WorkspaceListScreen() {
  const router = useRouter();
  const controlPlaneClient = useControlPlaneClient();
  const { client: wsClient, state: wsState } = useMobileWs();
  const accessTokenLoaded = useSessionStore((state) => state.accessTokenLoaded);
  const hasAccessToken = useSessionStore((state) => state.hasAccessToken);
  const controlPlaneUrl = useSessionStore((state) => state.controlPlaneUrl);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const activeClientSession = useSessionStore((state) => state.activeClientSession);
  const selectServer = useSessionStore((state) => state.selectServer);
  const setClientSession = useSessionStore((state) => state.setClientSession);
  const setComputers = useComputerStore((state) => state.setComputers);
  const lastAutoSessionAttemptRef = useRef<string | null>(null);

  const computersQuery = useQuery({
    queryKey: ["computers", controlPlaneUrl],
    enabled: accessTokenLoaded && hasAccessToken,
    queryFn: async () => {
      const token = await getStoredAccessToken();
      if (!token) return [];
      const computers = await controlPlaneClient.listComputers(token);
      setComputers(computers);
      return computers;
    },
  });

  const computers = computersQuery.data ?? [];
  const selectedComputer = computers.find((computer) => computer.server_id === selectedServerId) ?? null;
  const onlineComputers = selectableOnlineComputers(computers);
  const clientSessionUnavailable = wsState === "closed";
  const computersError = computersQuery.error instanceof Error ? computersQuery.error.message : null;

  const createSession = useMutation({
    mutationFn: async (serverId: string) => {
      const token = await getStoredAccessToken();
      if (!token) throw new Error("Access Token is not available.");
      return controlPlaneClient.createClientSession(token, serverId);
    },
    onSuccess: (session, serverId) => {
      selectServer(serverId);
      setClientSession(session);
    },
  });

  useEffect(() => {
    if (!hasAccessToken || !computersQuery.isSuccess) return;
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
  }, [activeClientSession, clientSessionUnavailable, computers, computersQuery.isSuccess, createSession, hasAccessToken, selectedServerId]);

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
  const canOpenWorkspaceData = hasAccessToken && wsState === "open" && !bootstrapQuery.error;
  const workspaceError = bootstrapQuery.error instanceof Error ? bootstrapQuery.error.message : null;
  const sessionError = createSession.error instanceof Error ? createSession.error.message : null;

  return (
    <AppScreen>
      <View style={styles.dashboard}>
        <View style={styles.statusRail}>
          <StatusPill label={workspaceListConnectionLabel(wsState)} active={wsState === "open"} />
          <Text style={styles.statusText} numberOfLines={1}>
            {selectedComputer?.display_name ?? selectedServerId ?? "No Computer"}
          </Text>
        </View>

        <View style={styles.cards}>
          <DashboardCard
            actionLabel="Connect"
            title="Computer Connect"
            value={selectedComputer?.display_name ?? (hasAccessToken ? `${onlineComputers.length} online` : "Token")}
            meta={computerCardMeta(hasAccessToken, computers.length, wsState)}
            status={hasAccessToken && onlineComputers.length > 0 ? "Ready" : "Setup"}
            onPress={() => router.push("/computer-connect")}
          />
          <DashboardCard
            actionLabel="Open"
            title="Workspace"
            value={canOpenWorkspaceData ? String(workspaceCount) : "Locked"}
            meta={canOpenWorkspaceData ? `${projectCount} projects` : "Connect first"}
            status={workspaceCardStatus(hasAccessToken, wsState, workspaceCount)}
            onPress={() => router.push("/workspaces")}
          />
        </View>

        <InlineError message={sessionError ?? computersError ?? workspaceError} />
      </View>
    </AppScreen>
  );
}

function DashboardCard({
  actionLabel,
  meta,
  onPress,
  status,
  title,
  value,
}: {
  actionLabel: string;
  meta: string;
  onPress: () => void;
  status: string;
  title: string;
  value: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.cardPressed]}>
      <GlassPanel
        fallbackStyle={styles.cardFallback}
        glassEffectStyle={{ style: "regular", animate: true }}
        interactive
        style={styles.card}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardStatus}>{status}</Text>
        </View>
        <Text style={styles.cardValue} numberOfLines={1}>
          {value}
        </Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {meta}
          </Text>
          <View style={styles.cardAction}>
            <Text style={styles.cardActionText}>{actionLabel}</Text>
          </View>
        </View>
      </GlassPanel>
    </Pressable>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <View style={styles.statusPill}>
      <View style={[styles.statusDot, active && styles.statusDotActive]} />
      <Text style={styles.statusPillText}>{label}</Text>
    </View>
  );
}

function computerCardMeta(hasAccessToken: boolean, computerCount: number, wsState: string) {
  if (!hasAccessToken) return "Access Token required";
  if (computerCount === 0) return "No Computers";
  if (wsState === "open") return "Relay session active";
  if (wsState === "reconnecting") return "Reconnecting";
  return "Select a Computer";
}

function workspaceCardStatus(hasAccessToken: boolean, wsState: string, workspaceCount: number) {
  if (!hasAccessToken) return "Setup";
  if (wsState !== "open") return "Offline";
  if (workspaceCount === 0) return "Empty";
  return "Open";
}

function workspaceListConnectionLabel(wsState: string) {
  if (wsState === "open") return "Online";
  if (wsState === "connecting") return "Connecting";
  if (wsState === "reconnecting") return "Reconnecting";
  return "Offline";
}

const styles = StyleSheet.create({
  dashboard: {
    gap: 16,
  },
  statusRail: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  statusPill: {
    alignItems: "center",
    backgroundColor: colors.label,
    borderRadius: 999,
    flexDirection: "row",
    gap: 7,
    minHeight: 32,
    paddingHorizontal: 12,
  },
  statusDot: {
    backgroundColor: colors.tertiaryLabel,
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  statusDotActive: {
    backgroundColor: colors.labelInverse,
  },
  statusPillText: {
    color: colors.labelInverse,
    fontSize: 12,
    fontWeight: "800",
  },
  statusText: {
    color: colors.secondaryLabel,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  cards: {
    gap: 12,
  },
  card: {
    gap: 18,
    minHeight: 156,
    padding: 18,
  },
  cardAction: {
    alignItems: "center",
    backgroundColor: colors.label,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 92,
    paddingHorizontal: 16,
  },
  cardActionText: {
    color: colors.labelInverse,
    fontSize: 16,
    fontWeight: "700",
  },
  cardFallback: {
    backgroundColor: colors.glassFallbackStrong,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardMeta: {
    color: colors.secondaryLabel,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  cardStatus: {
    borderColor: colors.separatorStrong,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.label,
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4,
    textTransform: "uppercase",
  },
  cardTitle: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0,
  },
  cardValue: {
    color: colors.label,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 34,
  },
  cardFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  cardPressed: {
    opacity: 0.72,
  },
});
