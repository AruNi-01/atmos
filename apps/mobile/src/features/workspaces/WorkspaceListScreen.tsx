import { useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ProjectWorkspaceBootstrapResponse } from "@/api/types";
import { wsActions } from "@/api/ws-actions";
import { getAutoConnectComputerId } from "@/features/computers/computer-selection";
import { useRelayClient } from "@/hooks/use-relay-client";
import { getStoredAccessToken } from "@/lib/access-token";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useComputerStore } from "@/stores/computer-store";
import { hydrateRecentWorkspaces, useRecentWorkspacesStore } from "@/stores/recent-workspaces-store";
import { useSessionStore } from "@/stores/session-store";
import { AppScreen, InlineError, Section } from "@/ui/layout/app-screen";
import { ChevronRightIcon, LaptopIcon, TerminalIcon } from "@/ui/icons/lucide-native";
import { colors, radii } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";

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
  const theme = useMobileTheme();
  const relayClient = useRelayClient();
  const { client: wsClient, state: wsState } = useMobileWs();
  const accessTokenLoaded = useSessionStore((state) => state.accessTokenLoaded);
  const hasAccessToken = useSessionStore((state) => state.hasAccessToken);
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
    enabled: accessTokenLoaded && hasAccessToken,
    queryFn: async () => {
      const token = await getStoredAccessToken();
      if (!token) return [];
      const computers = await relayClient.listComputers(token);
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
      const token = await getStoredAccessToken();
      if (!token) throw new Error("Device credential is not available.");
      return relayClient.createClientSession(token, serverId);
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
  const welcomeHeadline = useMemo(randomWelcomeHeadline, []);
  const recentWorkspaces = useMemo(() => {
    const recordsForComputer = selectedServerId
      ? recentWorkspaceRecords.filter((record) => !record.serverId || record.serverId === selectedServerId)
      : recentWorkspaceRecords;
    return hydrateRecentWorkspaces(recordsForComputer, bootstrap);
  }, [bootstrap, recentWorkspaceRecords, selectedServerId]);

  return (
    <AppScreen>
      <View style={styles.dashboard}>
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { color: theme.colors.label }]}>{welcomeHeadline}</Text>
          <Text style={[styles.heroSubtitle, { color: theme.colors.secondaryLabel }]} numberOfLines={2}>
            {homeSubtitle({
              canOpenWorkspaceData,
              selectedComputerName: selectedComputer?.display_name ?? selectedServerId,
              workspaceCount,
            })}
          </Text>
          <StatusPill label={workspaceListConnectionLabel(wsState)} active={wsState === "open"} />
        </View>

        <View style={styles.suggestions}>
          <SuggestionCard
            Icon={LaptopIcon}
            title="Connect Computer"
            subtitle={computerCardMeta(hasAccessToken, computers.length, wsState)}
            onPress={() => router.push("/computer-connect")}
          />
          <SuggestionCard
            Icon={TerminalIcon}
            title="Open Workspace"
            subtitle={canOpenWorkspaceData ? `${workspaceCount} workspaces · ${projectCount} projects` : workspaceCardStatus(hasAccessToken, wsState, workspaceCount)}
            onPress={() => router.push("/workspaces")}
          />
        </View>

        <Section label="Recently">
          {recentWorkspaces.length > 0 ? (
            recentWorkspaces.map((workspace, index) => (
              <View key={`${workspace.serverId ?? "unknown"}:${workspace.workspaceId}`}>
                <DashboardRow
                  title={workspace.workspaceName}
                  subtitle={workspace.projectName ?? "Workspace"}
                  meta={formatRecentAccessedAt(workspace.lastAccessedAt)}
                  onPress={() => router.push(`/workspace/${workspace.workspaceId}`)}
                />
                {index < recentWorkspaces.length - 1 ? (
                  <View style={[styles.separator, { backgroundColor: theme.colors.separator }]} />
                ) : null}
              </View>
            ))
          ) : (
            <RecentlyEmptyState />
          )}
        </Section>

        <InlineError message={sessionError ?? computersError ?? workspaceError} />
      </View>
    </AppScreen>
  );
}

function SuggestionCard({
  Icon,
  onPress,
  subtitle,
  title,
}: {
  Icon: typeof LaptopIcon;
  onPress: () => void;
  subtitle: string;
  title: string;
}) {
  const theme = useMobileTheme();

  return (
    <View
      style={[
        styles.suggestionCard,
        {
          backgroundColor: theme.colors.cardElevated,
          borderColor: theme.colors.glassBorder,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.suggestionCardContent, pressed ? styles.pressed : null]}
      >
        <Icon color={theme.colors.label} size={20} strokeWidth={2.3} />
        <Text style={[styles.suggestionTitle, { color: theme.colors.label }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.suggestionSubtitle, { color: theme.colors.secondaryLabel }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </Pressable>
    </View>
  );
}

function DashboardRow({
  meta,
  onPress,
  subtitle,
  title,
}: {
  meta: string;
  onPress: () => void;
  subtitle: string;
  title: string;
}) {
  const theme = useMobileTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.dashboardRow, pressed ? { backgroundColor: theme.colors.mutedPressed } : null]}
    >
      <View style={styles.dashboardRowText}>
        <Text style={[styles.dashboardRowTitle, { color: theme.colors.label }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.dashboardRowSubtitle, { color: theme.colors.secondaryLabel }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Text style={[styles.dashboardRowMeta, { color: theme.colors.secondaryLabel }]} numberOfLines={1}>
        {meta}
      </Text>
      <ChevronRightIcon color={theme.colors.tertiaryLabel} size={18} strokeWidth={2.5} />
    </Pressable>
  );
}

function RecentlyEmptyState() {
  const theme = useMobileTheme();

  return (
    <View style={styles.recentEmpty}>
      <Text selectable style={[styles.recentEmptyTitle, { color: theme.colors.label }]}>
        No recent Workspaces
      </Text>
      <Text selectable style={[styles.recentEmptyMessage, { color: theme.colors.secondaryLabel }]}>
        Open a Workspace and it will appear here.
      </Text>
    </View>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  const theme = useMobileTheme();

  return (
    <View style={[styles.statusPill, { backgroundColor: active ? theme.colors.label : theme.colors.cardElevated }]}>
      <View
        style={[
          styles.statusDot,
          { backgroundColor: active ? theme.colors.labelInverse : theme.colors.tertiaryLabel },
        ]}
      />
      <Text style={[styles.statusPillText, { color: active ? theme.colors.labelInverse : theme.colors.secondaryLabel }]}>
        {label}
      </Text>
    </View>
  );
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

function computerCardMeta(hasAccessToken: boolean, computerCount: number, wsState: string) {
  if (!hasAccessToken) return "Device credential required";
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
  if (selectedComputerName) return `${selectedComputerName} is selected. Finish connecting to load workspaces.`;
  return "Connect a Computer, then open a workspace or start a new one.";
}

const styles = StyleSheet.create({
  dashboard: {
    gap: 24,
  },
  dashboardRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 66,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dashboardRowMeta: {
    color: colors.secondaryLabel,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600",
    maxWidth: 92,
    textAlign: "right",
  },
  dashboardRowSubtitle: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
  },
  dashboardRowText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  dashboardRowTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
  },
  hero: {
    alignItems: "center",
    gap: 12,
    paddingBottom: 16,
    paddingHorizontal: 18,
    paddingTop: 56,
  },
  heroSubtitle: {
    color: colors.secondaryLabel,
    fontSize: 16,
    lineHeight: 22,
    maxWidth: 300,
    textAlign: "center",
  },
  heroTitle: {
    color: colors.label,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.72,
  },
  recentEmpty: {
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  recentEmptyMessage: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
  },
  recentEmptyTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
  },
  separator: {
    backgroundColor: colors.separator,
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  statusDot: {
    backgroundColor: colors.tertiaryLabel,
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  statusPill: {
    alignItems: "center",
    backgroundColor: colors.label,
    borderRadius: 999,
    flexDirection: "row",
    gap: 7,
    minHeight: 30,
    paddingHorizontal: 12,
  },
  statusPillText: {
    color: colors.labelInverse,
    fontSize: 12,
    fontWeight: "700",
  },
  suggestionCard: {
    backgroundColor: colors.cardElevated,
    borderColor: colors.glassBorder,
    borderCurve: "continuous",
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 128,
    overflow: "hidden",
  },
  suggestionCardContent: {
    gap: 8,
    minHeight: 128,
    padding: 16,
  },
  suggestionSubtitle: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
  },
  suggestions: {
    flexDirection: "row",
    gap: 12,
  },
  suggestionTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
  },
});
