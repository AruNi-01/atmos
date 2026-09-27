import { Stack, useRouter, type NativeStackHeaderItem } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";
import { useQuery } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import { wsActions } from "@/api/ws-actions";
import { copy } from "@/features/agent-chat/copy";
import { historyPlaceLabel, historyTimeLabel } from "@/features/agent-chat/list-rows";
import { useAgentChatList } from "@/features/agent-chat/use-agent-chat-list";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { PlusIcon } from "@/ui/icons/lucide-native";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { Row, Separator } from "@/ui/layout/row";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { ListSkeleton } from "@/ui/primitives/list-skeleton";
import { terminalActivityTitle, workspaceActivityRows } from "./workspace-activity";

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
  const rows = workspaceActivityRows({
    chats: chats.rows,
    terminals: (terminals.data?.candidates ?? []).map((candidate) => ({
      id: candidate.id,
      title: terminalActivityTitle(candidate),
      subtitle: historyPlaceLabel(candidate.cwd) === "Thread" ? "Terminal" : historyPlaceLabel(candidate.cwd),
    })),
  });
  const loading = chats.loading || terminals.isLoading;
  const openNewChat = () => {
    router.push({
      pathname: "/workspace/[workspaceId]/chat/new",
      params: { workspaceId },
    });
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
            ? { unstable_headerRightItems: () => [newChatHeaderItem(openNewChat, theme.colors.label)] }
            : {
                headerRight: () => (
                  <Pressable accessibilityLabel={copy.newChat} accessibilityRole="button" hitSlop={12} onPress={openNewChat}>
                    <PlusIcon color={theme.colors.label} size={22} strokeWidth={2.2} />
                  </Pressable>
                ),
              }),
        }}
      />
      <AppScreen>
        <Section>
          {loading && rows.length === 0 ? (
            <ListSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState layout="section" message="Nothing here yet." title="No sessions" />
          ) : (
            rows.map((row, index) => {
              const time = historyTimeLabel(row.updatedAt);
              return (
                <View key={`${row.kind}:${row.id}`}>
                  {index > 0 ? <Separator /> : null}
                  <Row onPress={() => openRow(row)} subtitle={row.subtitle} title={row.title}>
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
                </View>
              );
            })
          )}
        </Section>
        <InlineError message={chats.error} />
      </AppScreen>
    </>
  );
}

function newChatHeaderItem(onPress: () => void, tintColor: string): NativeStackHeaderItem {
  return {
    accessibilityLabel: copy.newChat,
    icon: { type: "sfSymbol", name: "plus" satisfies SFSymbol },
    identifier: "workspace-activity-new-chat",
    label: "",
    onPress,
    sharesBackground: true,
    tintColor,
    type: "button",
    variant: "plain",
  };
}
