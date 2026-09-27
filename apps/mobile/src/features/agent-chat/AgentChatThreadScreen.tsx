import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Stack, type NativeStackHeaderItem } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";
import { ChatKeyboardFrame } from "./chat-keyboard-frame";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { useMobileTheme } from "@/theme/theme-store";
import { MessagesSquareIcon } from "@/ui/icons/lucide-native";
import { AppScreen, InlineError } from "@/ui/layout/app-screen";
import { nativeCompactTitleOptions } from "@/ui/navigation/native-screen-options";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";
import { AgentChatComposer } from "./AgentChatComposer";
import { AgentChatPermissionCard } from "./AgentChatPermissionCard";
import { AgentChatSessionOpCard } from "./AgentChatSessionOpCard";
import { AgentChatTranscript } from "./AgentChatTranscript";
import {
  applyComposerPick,
  composerSuggestionList,
  mergeSlashCommands,
  normalizeSlashCommands,
} from "./composer-suggestions";
import { copy } from "./copy";
import { buildComposerPicker, fastWireValue, type ComposerPatch, type PickerAgent } from "./model-picker";
import type { ComposerPhoto } from "./photo-attachment";
import { uploadChatPhotos } from "./upload-chat-photos";
import { useAgentFavorites } from "./use-agent-favorites";
import { useAgentChatList } from "./use-agent-chat-list";
import { useAgentChatThread } from "./use-agent-chat-thread";
import { useMentionFiles } from "./use-mention-files";

type PickedConfig = {
  chatId: string;
  providerId: string | null;
  model: string | null;
  thinking: string | null;
  mode: string | null;
  permissionMode: string | null;
  fast: string | null;
  context: string | null;
};

function messagesHeaderItem(onPress: () => void, tintColor: string): NativeStackHeaderItem {
  return {
    accessibilityLabel: copy.messages,
    icon: { type: "sfSymbol", name: "list.bullet" satisfies SFSymbol },
    identifier: "agent-chat-messages",
    label: "",
    onPress,
    sharesBackground: true,
    tintColor,
    type: "button",
    variant: "plain",
  };
}

function registryAgents(
  agents: Array<{ enabled?: boolean; icon?: string | null; id: string; installed: boolean; name: string }> | undefined,
  providerId: string | null,
): PickerAgent[] {
  const choices: PickerAgent[] = [];
  const seen = new Set<string>();
  for (const agent of agents ?? []) {
    if (!agent.installed || agent.enabled === false) continue;
    const id = agent.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    choices.push({ id, label: agent.name.trim() || id, iconUrl: agent.icon?.trim() || null });
  }
  const current = providerId?.trim() ?? "";
  if (current && !seen.has(current)) {
    choices.unshift({ id: current, label: current, iconUrl: null });
  }
  return choices;
}

export function AgentChatThreadScreen({
  chatId,
  workspaceId,
}: {
  chatId: string;
  workspaceId: string;
}) {
  const theme = useMobileTheme();
  const { client, state: wsState } = useMobileWs();
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const { rows } = useAgentChatList(workspaceId);
  const matchedTitle = rows.find((row) => row.id === chatId)?.title.trim() ?? "";
  const screenTitle = matchedTitle.length > 0 ? matchedTitle : copy.history;
  const listProviderId = rows.find((row) => row.id === chatId)?.providerId.trim() ?? "";
  const [picked, setPicked] = useState<PickedConfig | null>(null);
  const active = picked?.chatId === chatId ? picked : null;
  const snapshotQuery = useQuery({
    queryKey: ["agent-chat-get", selectedServerId, chatId, wsState],
    enabled: Boolean(client && wsState === "open"),
    queryFn: () => {
      if (!client) return Promise.reject(new Error("Atmos mobile WebSocket is not connected"));
      return wsActions.agentChatGet(client, { chat_id: chatId });
    },
  });
  const savedConfig = snapshotQuery.data?.meta.descriptor.current_config;
  const providerId = (active?.providerId ?? snapshotQuery.data?.meta.provider_id ?? listProviderId).trim();
  const modelId = active?.model ?? savedConfig?.model ?? null;
  const thinkingId = active?.thinking ?? savedConfig?.thinking ?? null;
  const modeId = active?.mode ?? savedConfig?.mode ?? null;
  const permissionId = active?.permissionMode ?? savedConfig?.permission_mode ?? null;
  const fastId = active?.fast ?? savedConfig?.fast ?? null;
  const contextId = active?.context ?? savedConfig?.context ?? null;
  const registryQuery = useQuery({
    queryKey: ["agent-registry-list", selectedServerId, wsState],
    enabled: Boolean(client && wsState === "open"),
    queryFn: () => {
      if (!client) return Promise.reject(new Error("Atmos mobile WebSocket is not connected"));
      return client.request("agent_registry_list", {});
    },
  });
  const optionsQuery = useQuery({
    queryKey: ["agent-options", selectedServerId, providerId],
    enabled: Boolean(client && wsState === "open" && providerId),
    queryFn: () => {
      if (!client || !providerId) {
        return Promise.reject(new Error("Atmos mobile WebSocket is not connected"));
      }
      return wsActions.agentOptionsGet(client, { agent_id: providerId });
    },
  });
  const options = optionsQuery.data?.agent_id === providerId ? optionsQuery.data : null;
  const { favorites, toggleFavorite } = useAgentFavorites();
  const picker = buildComposerPicker({
    agents: registryAgents(registryQuery.data?.agents, providerId || null),
    agentId: providerId || null,
    options,
    modelId,
    thinkingId,
    modeId,
    permissionId,
    fastId,
    contextId,
  });
  const agentName = picker.agentLabel.trim();
  const composerPlaceholder = agentName
    ? copy.connectedPlaceholder.replace("{agent}", agentName)
    : copy.resumePlaceholder;
  const {
    messages,
    pendingPermission,
    pendingSessionOp,
    runningTurnId,
    loading,
    error,
    commands,
    send,
    steer,
    queueAdd,
    cancel,
    respondPermission,
    respondSessionOp,
  } = useAgentChatThread(chatId);
  const [text, setText] = useState("");
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const userMessages = messages.filter((message) => message.role === "user");
  const mentionFiles = useMentionFiles(workspaceId);
  const suggestions = composerSuggestionList(
    text,
    mergeSlashCommands(normalizeSlashCommands(options?.commands), commands),
    mentionFiles,
  );
  const onPickSuggestion = useCallback((id: string) => {
    if (!suggestions) return;
    const insert = suggestions.trigger.kind === "slash" ? `/${id} ` : `@${id} `;
    setText(applyComposerPick(text, suggestions.trigger, insert));
  }, [suggestions, text]);
  const [photos, setPhotos] = useState<ComposerPhoto[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const chatCwd = snapshotQuery.data?.meta.cwd || ".";

  const onPatch = useCallback((patch: ComposerPatch) => {
    if (!client || wsState !== "open") return;
    const switchingAgent = Boolean(patch.agentId && patch.agentId !== providerId && !patch.modelId);
    const next: PickedConfig = {
      chatId,
      providerId: patch.agentId ?? (providerId || null),
      model: switchingAgent ? null : (patch.modelId ?? modelId),
      thinking: switchingAgent ? null : (patch.thinkingId ?? thinkingId),
      mode: patch.modeId ?? modeId,
      permissionMode: patch.permissionId ?? permissionId,
      fast: switchingAgent ? null : (patch.fastEnabled != null ? fastWireValue(patch.fastEnabled) : fastId),
      context: switchingAgent ? null : (patch.contextId ?? contextId),
    };
    setPicked(next);
    void wsActions.agentChatConfigure(client, {
      chat_id: chatId,
      ...(patch.agentId ? { provider_id: patch.agentId } : {}),
      ...(patch.modelId ? { model: patch.modelId } : {}),
      ...(patch.thinkingId ? { thinking: patch.thinkingId } : {}),
      ...(patch.modeId ? { mode: patch.modeId } : {}),
      ...(patch.permissionId ? { permission_mode: patch.permissionId } : {}),
      ...(patch.fastEnabled != null ? { fast: fastWireValue(patch.fastEnabled) } : {}),
      ...(patch.contextId ? { context: patch.contextId } : {}),
    }).catch(() => undefined);
  }, [
    chatId,
    client,
    contextId,
    fastId,
    modeId,
    modelId,
    permissionId,
    providerId,
    thinkingId,
    wsState,
  ]);

  const uploadSelectedPhotos = useCallback(async (pending: ComposerPhoto[]) => {
    if (pending.length === 0) return [];
    const session = useSessionStore.getState().activeClientSession;
    if (!session?.gateway_url || !session.client_token) {
      throw new Error("Could not upload that photo.");
    }
    return uploadChatPhotos({
      gatewayUrl: session.gateway_url,
      token: session.client_token,
      chatId,
      localPath: chatCwd,
      photos: pending,
    });
  }, [chatCwd, chatId]);

  const onSend = useCallback(() => {
    const draft = text;
    const pending = photos;
    if (draft.trim() === "" && pending.length === 0) return;
    void (async () => {
      const paths = await uploadSelectedPhotos(pending);
      await send(draft, paths);
      setText((current) => (current === draft ? "" : current));
      setPhotos((current) => (current === pending ? [] : current));
      setUploadError(null);
    })().catch((err: unknown) => {
      setUploadError(err instanceof Error ? err.message : "Could not upload that photo.");
    });
  }, [photos, send, text, uploadSelectedPhotos]);

  const onQueue = useCallback(() => {
    const draft = text;
    const pending = photos;
    if (draft.trim() === "" && pending.length === 0) return;
    void (async () => {
      const paths = await uploadSelectedPhotos(pending);
      await queueAdd(draft, paths);
      setText((current) => (current === draft ? "" : current));
      setPhotos((current) => (current === pending ? [] : current));
      setUploadError(null);
    })().catch((err: unknown) => {
      setUploadError(err instanceof Error ? err.message : "Could not upload that photo.");
    });
  }, [photos, queueAdd, text, uploadSelectedPhotos]);

  const onSteer = useCallback(() => {
    const draft = text;
    if (draft.trim() === "") return;
    void steer(draft).catch(() => undefined);
  }, [steer, text]);

  const onStop = useCallback(() => {
    void cancel().catch(() => undefined);
  }, [cancel]);

  const openMessages = () => setMessagesOpen(true);
  const header = (
    <Stack.Screen
      options={{
        ...nativeCompactTitleOptions(screenTitle, theme.colors),
        headerBackButtonDisplayMode: "minimal",
        ...(userMessages.length > 0
          ? process.env.EXPO_OS === "ios"
            ? {
                unstable_headerRightItems: () => [messagesHeaderItem(openMessages, theme.colors.label)],
              }
            : {
                headerRight: () => (
                  <Pressable accessibilityLabel={copy.messages} accessibilityRole="button" hitSlop={12} onPress={openMessages}>
                    <MessagesSquareIcon color={theme.colors.label} size={22} strokeWidth={2.2} />
                  </Pressable>
                ),
              }
          : {}),
      }}
    />
  );

  if (chatId.trim() === "") {
    return (
      <>
        {header}
        <AppScreen>
          <InlineError message="Could not load this chat." />
        </AppScreen>
      </>
    );
  }

  if (loading) {
    return (
      <>
        {header}
        <AppScreen contentFlex>
          <View style={{ alignItems: "center", gap: 12 }}>
            <ActivityIndicator color={theme.colors.secondaryLabel} />
          </View>
        </AppScreen>
      </>
    );
  }

  return (
    <>
      {header}
      <ChatKeyboardFrame
        footer={
          <View style={{ gap: 8, paddingHorizontal: 18, paddingTop: 8 }}>
            {pendingPermission ? (
              <AgentChatPermissionCard
                onRespond={(input) => {
                  void respondPermission(input).catch(() => undefined);
                }}
                request={pendingPermission}
              />
            ) : null}
            {pendingSessionOp ? (
              <AgentChatSessionOpCard
                onRespond={(input) => {
                  void respondSessionOp(input).catch(() => undefined);
                }}
                request={pendingSessionOp}
              />
            ) : null}
            <AgentChatComposer
              busy={runningTurnId != null}
              favorites={favorites}
              onPhotosChange={setPhotos}
              onChangeText={setText}
              onPatch={onPatch}
              onPickSuggestion={onPickSuggestion}
              onQueue={onQueue}
              onRemovePhoto={(id) => setPhotos((current) => current.filter((photo) => photo.id !== id))}
              onSend={onSend}
              onSteer={onSteer}
              onStop={onStop}
              onToggleFavorite={toggleFavorite}
              photos={photos}
              picker={picker}
              placeholder={composerPlaceholder}
              queueLabel={copy.queue}
              sendLabel={copy.send}
              suggestionTitle={suggestions?.title}
              suggestions={suggestions?.rows}
              steerLabel={copy.steer}
              stopLabel={copy.stop}
              text={text}
            />
          </View>
        }
      >
        <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
        {error || uploadError ? (
          <View style={{ paddingHorizontal: 18, paddingTop: 8 }}>
            <InlineError message={uploadError || error} />
          </View>
        ) : null}
        {error && messages.length === 0 ? null : (
          <AgentChatTranscript
            focusMessageId={focusMessageId}
            messages={messages}
            streaming={runningTurnId != null}
          />
        )}
        <ExpoDrawer
          isPresented={messagesOpen}
          matchContents={false}
          onDismiss={() => setMessagesOpen(false)}
          snapPoints={["half", "full"]}
        >
          <Text style={{ color: theme.colors.label, fontSize: 17, fontWeight: "600", marginBottom: 8 }}>{copy.messages}</Text>
          <ScrollView style={{ flex: 1 }}>
            {userMessages.map((message) => {
              const textPart = message.parts.find((part) => part.type === "text" && part.text.trim().length > 0);
              const preview = textPart?.type === "text" ? textPart.text.trim() : message.id;
              return (
                <Pressable
                  key={message.id}
                  onPress={() => {
                    setFocusMessageId(message.id);
                    setMessagesOpen(false);
                  }}
                  style={{ paddingVertical: 12 }}
                >
                  <Text numberOfLines={2} style={{ color: theme.colors.label, fontSize: 16 }}>{preview}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </ExpoDrawer>
        </View>
      </ChatKeyboardFrame>
    </>
  );
}
