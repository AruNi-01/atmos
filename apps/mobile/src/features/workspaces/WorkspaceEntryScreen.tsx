import { Stack, useRouter, type NativeStackHeaderItem } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Pressable, Text, View, type ImageSourcePropType } from "react-native";
import { wsActions } from "@/api/ws-actions";
import { historyPlaceLabel, historyTimeLabel } from "@/features/agent-chat/list-rows";
import { useAgentChatList } from "@/features/agent-chat/use-agent-chat-list";
import { MobileAgentIcon, mobileAgentMenuIcon } from "@/features/terminal/MobileAgentIcon";
import { createMobileTerminalSessionId } from "@/features/terminal/terminal-selection";
import type { MobileLaunchAgent } from "@/features/terminal/terminal-launch-agents";
import { useTerminalLaunchAgents } from "@/features/terminal/use-terminal-launch-agents";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronLeftIcon, PlusIcon } from "@/ui/icons/lucide-native";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { Row, Separator } from "@/ui/layout/row";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { ListSkeleton } from "@/ui/primitives/list-skeleton";
import { SessionSwipeRow } from "@/ui/primitives/session-swipe-row";
import { SessionDeletePicker } from "@/features/sessions/session-delete-picker";
import { useSessionRowActions } from "@/features/sessions/use-session-row-actions";
import type { SessionDeleteChoice } from "@/features/sessions/session-row-actions";
import { terminalActivityTitle, terminalAgentId, workspaceActivityRows, type WorkspaceActivityRow } from "./workspace-activity";

export function WorkspaceEntryScreen({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const theme = useMobileTheme();
  const { client, state: wsState } = useMobileWs();
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const chats = useAgentChatList(workspaceId);
  const terminals = useQuery({
    queryKey: ["workspace-terminal-candidates", selectedServerId, workspaceId, wsState],
    enabled: Boolean(client && wsState === "open" && workspaceId),
    queryFn: () => {
      if (!client) return Promise.reject(new Error("Atmos mobile WebSocket is not connected"));
      return wsActions.terminalWorkspaceCandidates(client, { workspace_id: workspaceId });
    },
  });
  const sessions = useQuery({
    queryKey: ["workspace-activity-sessions", selectedServerId, workspaceId],
    enabled: Boolean(client && wsState === "open"),
    queryFn: () => {
      if (!client) return Promise.reject(new Error("Atmos mobile WebSocket is not connected"));
      return wsActions.agentSessionStatusList(client);
    },
  });
  const rowActions = useSessionRowActions();
  const [deleteRow, setDeleteRow] = useState<WorkspaceActivityRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const sessionSnapshots = sessions.data?.sessions ?? [];
  const archivedIds = new Set(rowActions.archivedIds);
  const rows = workspaceActivityRows({
    chats: chats.rows,
    terminals: (terminals.data?.candidates ?? []).map((candidate) => ({
      id: candidate.id,
      title: terminalActivityTitle(candidate),
      subtitle: historyPlaceLabel(candidate.cwd) === "Thread" ? "Terminal" : historyPlaceLabel(candidate.cwd),
      agentId: terminalAgentId(workspaceId, candidate, sessions.data?.sessions ?? []),
    })),
  }).filter((row) => !archivedIds.has(row.id) && !archivedIds.has(activityPinId(row, sessionSnapshots)));
  const orderedRows = [
    ...rows.filter((row) => rowActions.pinnedIds.includes(activityPinId(row, sessionSnapshots))),
    ...rows.filter((row) => !rowActions.pinnedIds.includes(activityPinId(row, sessionSnapshots))),
  ];
  const loading = chats.loading || terminals.isLoading;
  const addTerminal = useTerminalStore((state) => state.addEntry);
  const launchAgents = useTerminalLaunchAgents(Boolean(workspaceId));
  const openNewChat = () => {
    router.push({
      pathname: "/workspace/[workspaceId]/chat/new",
      params: { workspaceId },
    });
  };
  const openNewTerminal = (agent: MobileLaunchAgent | null) => {
    const id = `${workspaceId}:mobile-${Date.now()}`;
    addTerminal({
      id,
      workspaceId,
      label: agent?.label ?? "Terminal",
      agentLabel: agent?.label,
      sessionId: createMobileTerminalSessionId(workspaceId),
      isNew: true,
      pendingLaunchCommand: agent?.command,
    });
    router.push({
      pathname: "/workspace/[workspaceId]/terminal",
      params: { workspaceId, terminal: id },
    });
  };
  const openTerminalMenu = () => {
    Alert.alert("New terminal", undefined, [
      { text: "Terminal", onPress: () => openNewTerminal(null) },
      ...launchAgents.map((agent) => ({
        text: agent.label,
        onPress: () => openNewTerminal(agent),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };
  const openCreateMenu = () => {
    Alert.alert("New", undefined, [
      { text: "New chat", onPress: openNewChat },
      { text: "New terminal", onPress: openTerminalMenu },
      { text: "Cancel", style: "cancel" as const },
    ]);
  };
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const openRow = (row: (typeof rows)[number]) => {
    if (row.kind === "terminal") {
      router.push({
        pathname: "/workspace/[workspaceId]/terminal",
        params: { workspaceId, terminal: row.id },
      });
      return;
    }
    router.push({
      pathname: "/workspace/[workspaceId]/chat/[chatId]",
      params: { workspaceId, chatId: row.id },
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeLargeTitleOptions("Workspace", theme.colors),
          headerBackButtonDisplayMode: "minimal",
          ...(process.env.EXPO_OS === "ios"
            ? {
                unstable_headerLeftItems: () => [backHeaderItem(goBack, theme.colors.label)],
                unstable_headerRightItems: () => [newSessionHeaderItem(openNewChat, openNewTerminal, launchAgents, theme.colors.label)],
              }
            : {
                headerLeft: () => (
                  <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={12} onPress={goBack}>
                    <ChevronLeftIcon color={theme.colors.label} size={22} strokeWidth={2.2} />
                  </Pressable>
                ),
                headerRight: () => (
                  <Pressable accessibilityLabel="New" accessibilityRole="button" hitSlop={12} onPress={openCreateMenu}>
                    <PlusIcon color={theme.colors.label} size={22} strokeWidth={2.2} />
                  </Pressable>
                ),
              }),
        }}
      />
      <AppScreen>
        <Section>
          {loading && orderedRows.length === 0 ? (
            <ListSkeleton />
          ) : orderedRows.length === 0 ? (
            <EmptyState layout="section" message="Nothing here yet." title="No sessions" />
          ) : (
            orderedRows.map((row, index) => {
              const time = historyTimeLabel(row.updatedAt);
              const pinId = activityPinId(row, sessionSnapshots);
              const content = (
                <Row
                  leading={<MobileAgentIcon agentId={row.agentId ?? ""} size={18} />}
                  onPress={() => openRow(row)}
                  subtitle={row.subtitle}
                  title={row.title}
                >
                  {time ? (
                    <Text
                      style={[
                        typography.rowMeta,
                        { color: theme.colors.secondaryLabel, fontVariant: ["tabular-nums"] },
                      ]}
                    >
                      {time}
                    </Text>
                  ) : null}
                </Row>
              );
              return (
                <View key={`${row.kind}:${row.id}`}>
                  {index > 0 ? <Separator /> : null}
                  <SessionSwipeRow
                    backgroundColor={theme.colors.cardElevated}
                    onArchive={
                      row.kind === "chat"
                        ? () => {
                            setActionError(null);
                            void rowActions.archiveChat(pinId, row.id).catch((error: unknown) => {
                              setActionError(error instanceof Error ? error.message : "Could not archive this session.");
                            });
                          }
                        : undefined
                    }
                    onDelete={row.kind === "chat" ? () => setDeleteRow(row) : undefined}
                    onPin={() => rowActions.togglePin(pinId)}
                    pinLabel={rowActions.pinnedIds.includes(pinId) ? "Unpin" : "Pin"}
                  >
                    {content}
                  </SessionSwipeRow>
                </View>
              );
            })
          )}
        </Section>
        {actionError ? (
          <Text style={{ color: theme.colors.red, fontSize: 13 }}>{actionError}</Text>
        ) : null}
        <SessionDeletePicker
          busy={deleting}
          error={deleteRow ? actionError : null}
          isPresented={deleteRow != null}
          onDismiss={() => {
            if (!deleting) {
              setDeleteRow(null);
              setActionError(null);
            }
          }}
          onConfirm={(choice: SessionDeleteChoice) => {
            const row = deleteRow;
            if (!row) return;
            setDeleting(true);
            setActionError(null);
            void rowActions
              .deleteChat(activityPinId(row, sessionSnapshots), row.id, choice)
              .then(() => setDeleteRow(null))
              .catch((error: unknown) => {
                setActionError(error instanceof Error ? error.message : "Could not delete this session.");
              })
              .finally(() => setDeleting(false));
          }}
        />
        <InlineError message={chats.error} />
      </AppScreen>
    </>
  );
}

function activityPinId(
  row: WorkspaceActivityRow,
  sessions: ReadonlyArray<{ session_id: string; surface?: string; surface_id?: string | null }>,
): string {
  if (row.kind === "chat") {
    const match = sessions.find((session) => {
      if (session.surface && session.surface !== "chat") return false;
      return session.surface_id === row.id || session.session_id === row.id || session.session_id === `chat:${row.id}`;
    });
    return match?.session_id ?? `chat:${row.id}`;
  }
  const match = sessions.find(
    (session) => session.session_id === row.id || session.surface_id === row.id,
  );
  return match?.session_id ?? row.id;
}

function backHeaderItem(onPress: () => void, tintColor: string): NativeStackHeaderItem {
  return {
    accessibilityLabel: "Back",
    icon: { type: "sfSymbol", name: "chevron.backward" satisfies SFSymbol },
    identifier: "workspace-activity-back",
    label: "",
    onPress,
    sharesBackground: true,
    tintColor,
    type: "button",
    variant: "plain",
  };
}

function agentMenuIcon(agentId: string):
  | { source: ImageSourcePropType; tinted: boolean; type: "image" }
  | { name: SFSymbol; type: "sfSymbol" } {
  const image = mobileAgentMenuIcon(agentId);
  if (image) return image;
  return { name: "cpu", type: "sfSymbol" };
}

function newSessionHeaderItem(
  onNewChat: () => void,
  onNewTerminal: (agent: MobileLaunchAgent | null) => void,
  agents: MobileLaunchAgent[],
  tintColor: string,
): NativeStackHeaderItem {
  return {
    accessibilityLabel: "New",
    icon: { type: "sfSymbol", name: "plus" satisfies SFSymbol },
    identifier: "workspace-activity-new",
    label: "",
    menu: {
      items: [
        {
          type: "action",
          label: "New chat",
          icon: { type: "sfSymbol", name: "bubble.left" satisfies SFSymbol },
          onPress: onNewChat,
        },
        {
          type: "submenu",
          label: "New terminal",
          icon: { type: "sfSymbol", name: "terminal" satisfies SFSymbol },
          items: [
            {
              type: "action",
              label: "Terminal",
              icon: { type: "sfSymbol", name: "terminal" satisfies SFSymbol },
              onPress: () => onNewTerminal(null),
            },
            ...agents.map((agent) => ({
              type: "action" as const,
              label: agent.label,
              icon: agentMenuIcon(agent.id),
              onPress: () => onNewTerminal(agent),
            })),
          ],
        },
      ],
    },
    sharesBackground: true,
    tintColor,
    type: "menu",
    variant: "plain",
  };
}
