import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Stack, useRouter, type NativeStackHeaderItem } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";
import { wsActions } from "@/api/ws-actions";
import { copy } from "@/features/agent-chat/copy";
import { historyTimeLabel, type ChatListRow } from "@/features/agent-chat/list-rows";
import { useAgentChatList } from "@/features/agent-chat/use-agent-chat-list";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { PlusIcon } from "@/ui/icons/lucide-native";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { Row, Separator } from "@/ui/layout/row";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { GlassActionButtons } from "@/ui/primitives/glass-action-buttons";
import { ListSkeleton } from "@/ui/primitives/list-skeleton";
import { NativeTextInput } from "@/ui/primitives/native-text-input";

export function AgentChatSessionListScreen({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const theme = useMobileTheme();
  const list = useAgentChatList(workspaceId);
  const { client } = useMobileWs();
  const [renaming, setRenaming] = useState<ChatListRow | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const openNewChat = () => {
    router.push({
      pathname: "/workspace/[workspaceId]/chat/new",
      params: { workspaceId },
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeLargeTitleOptions(copy.history, theme.colors),
          headerBackButtonDisplayMode: "minimal",
          ...(process.env.EXPO_OS === "ios"
            ? {
                unstable_headerRightItems: () => [newChatHeaderItem(openNewChat, theme.colors.label)],
              }
            : {
                headerRight: () => (
                  <Pressable
                    accessibilityLabel={copy.newChat}
                    accessibilityRole="button"
                    hitSlop={12}
                    onPress={openNewChat}
                  >
                    <PlusIcon color={theme.colors.label} size={22} strokeWidth={2.2} />
                  </Pressable>
                ),
              }),
        }}
      />
      <AppScreen>
        {list.loading || list.rows.length > 0 || !list.error ? (
          <Section>
            {list.loading ? (
              <ListSkeleton />
            ) : list.rows.length === 0 ? (
              <EmptyState layout="section" message={copy.emptyDescription} title={copy.emptyTitle} />
            ) : (
              <ChatSessionRows
                onLongPress={(row) => {
                  Alert.alert(row.title, undefined, [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: copy.rename,
                      onPress: () => {
                        setTitleDraft(row.title);
                        setRenaming(row);
                      },
                    },
                    {
                      text: copy.deleteChat,
                      style: "destructive",
                      onPress: () => {
                        if (!client) return;
                        void wsActions.agentChatDelete(client, { chat_id: row.id }).then(() => list.refetch());
                      },
                    },
                  ]);
                }}
                onPress={(row) =>
                  router.push({
                    pathname: "/workspace/[workspaceId]/chat/[chatId]",
                    params: { chatId: row.id, workspaceId },
                  })
                }
                rows={list.rows}
              />
            )}
          </Section>
        ) : null}
        <InlineError message={list.error} />
        {renaming ? (
          <View style={{ gap: 12, padding: 18 }}>
            <NativeTextInput onChangeText={setTitleDraft} value={titleDraft} />
            <GlassActionButtons
              actions={[{
                label: copy.rename,
                onPress: () => {
                  const title = titleDraft.trim();
                  if (!client || title.length === 0) return;
                  void wsActions.agentChatRename(client, { chat_id: renaming.id, title }).then(() => {
                    setRenaming(null);
                    return list.refetch();
                  });
                },
              }]}
            />
          </View>
        ) : null}
      </AppScreen>
    </>
  );
}

function ChatSessionRows({
  onLongPress,
  onPress,
  rows,
}: {
  onLongPress: (row: ChatListRow) => void;
  onPress: (row: ChatListRow) => void;
  rows: ChatListRow[];
}) {
  const theme = useMobileTheme();

  return rows.map((row, index) => {
    const time = historyTimeLabel(row.updatedAt);
    return (
      <View key={row.id}>
        {index > 0 ? <Separator /> : null}
        <Row onLongPress={() => onLongPress(row)} onPress={() => onPress(row)} subtitle={row.place} title={row.title}>
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
  });
}

function newChatHeaderItem(onPress: () => void, tintColor: string): NativeStackHeaderItem {
  return {
    accessibilityLabel: copy.newChat,
    icon: { type: "sfSymbol", name: "plus" satisfies SFSymbol },
    identifier: "agent-chat-new",
    label: "",
    onPress,
    sharesBackground: true,
    tintColor,
    type: "button",
    variant: "plain",
  };
}
