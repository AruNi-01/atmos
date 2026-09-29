import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter, type NativeStackHeaderItem } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";
import { ChatKeyboardFrame } from "./chat-keyboard-frame";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { spacing } from "@/theme/spacing";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronLeftIcon } from "@/ui/icons/lucide-native";
import { AtmosLogo } from "@/ui/AtmosLogo";
import { AppScreen, InlineError } from "@/ui/layout/app-screen";
import { nativeCompactTitleOptions } from "@/ui/navigation/native-screen-options";
import { AgentChatComposer } from "./AgentChatComposer";
import {
  applyComposerPick,
  composerSuggestionList,
  normalizeSlashCommands,
} from "./composer-suggestions";
import { copy } from "./copy";
import { buildComposerPicker, fastWireValue, type ComposerPatch, type PickerAgent } from "./model-picker";
import type { ComposerPhoto } from "./photo-attachment";
import { useAgentFavorites } from "./use-agent-favorites";
import { useMentionFiles } from "./use-mention-files";
import { useNewChat } from "./use-new-chat";

function backHeaderItem(onPress: () => void, tintColor: string): NativeStackHeaderItem {
  return {
    accessibilityLabel: "Back",
    icon: { type: "sfSymbol", name: "chevron.backward" satisfies SFSymbol },
    identifier: "agent-chat-back",
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

export function AgentChatNewScreen({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const theme = useMobileTheme();
  const { client, state: wsState } = useMobileWs();
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const draft = useNewChat(workspaceId);
  const { favorites, toggleFavorite } = useAgentFavorites();
  const mentionFiles = useMentionFiles(workspaceId);
  const suggestions = composerSuggestionList(
    draft.text,
    normalizeSlashCommands(draft.options?.commands),
    mentionFiles,
  );
  const onPickSuggestion = useCallback((id: string) => {
    if (!suggestions) return;
    const insert = suggestions.trigger.kind === "slash" ? `/${id} ` : `@${id} `;
    draft.setText(applyComposerPick(draft.text, suggestions.trigger, insert));
  }, [draft, suggestions]);
  const [photos, setPhotos] = useState<ComposerPhoto[]>([]);
  const registryQuery = useQuery({
    queryKey: ["agent-registry-list", selectedServerId, wsState],
    enabled: Boolean(client && wsState === "open"),
    queryFn: () => {
      if (!client) return Promise.reject(new Error("Atmos mobile WebSocket is not connected"));
      return client.request("agent_registry_list", {});
    },
  });
  const picker = buildComposerPicker({
    agents: registryAgents(registryQuery.data?.agents, draft.providerId),
    agentId: draft.providerId,
    options: draft.options,
    modelId: draft.model,
    thinkingId: draft.thinking,
    modeId: draft.mode,
    permissionId: draft.permissionMode,
    fastId: draft.fast,
    contextId: draft.context,
  });
  const onPatch = useCallback((patch: ComposerPatch) => {
    if (patch.agentId) draft.setProviderId(patch.agentId);
    if (patch.modelId) draft.setModel(patch.modelId);
    if (patch.thinkingId) draft.setThinking(patch.thinkingId);
    if (patch.modeId) draft.setMode(patch.modeId);
    if (patch.permissionId) draft.setPermissionMode(patch.permissionId);
    if (patch.fastEnabled != null) draft.setFast(fastWireValue(patch.fastEnabled));
    if (patch.contextId) draft.setContext(patch.contextId);
  }, [
    draft.setContext,
    draft.setFast,
    draft.setMode,
    draft.setModel,
    draft.setPermissionMode,
    draft.setProviderId,
    draft.setThinking,
  ]);
  const onSend = useCallback(() => {
    void draft.submit(undefined, photos).then((result) => {
      if (!result || !("chatId" in result) || result.chatId.length === 0) return;
      router.replace({
        pathname: "/workspace/[workspaceId]/chat/[chatId]",
        params: { workspaceId, chatId: result.chatId },
      });
    });
  }, [draft, photos, router, workspaceId]);
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else {
      router.replace({
        pathname: "/workspace/[workspaceId]",
        params: { workspaceId },
      });
    }
  };

  return (
    <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
      <Stack.Screen
        options={{
          ...nativeCompactTitleOptions(copy.newChat, theme.colors),
          headerBackButtonDisplayMode: "minimal",
          headerBackVisible: false,
          headerShadowVisible: false,
          headerTintColor: theme.colors.label,
          ...(process.env.EXPO_OS === "ios"
            ? { unstable_headerLeftItems: () => [backHeaderItem(goBack, theme.colors.label)] }
            : {
                headerLeft: () => (
                  <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={12} onPress={goBack}>
                    <ChevronLeftIcon color={theme.colors.label} size={22} strokeWidth={2.2} />
                  </Pressable>
                ),
              }),
        }}
      />
      <ChatKeyboardFrame
        footer={
          <View
            style={{
              backgroundColor: theme.colors.background,
              paddingHorizontal: spacing.screenX,
              paddingTop: spacing.screenFooterTop,
            }}
          >
            <AgentChatComposer
              busy={draft.submitting}
              favorites={favorites}
              onPhotosChange={setPhotos}
              onChangeText={draft.setText}
              onPatch={onPatch}
              onPickSuggestion={onPickSuggestion}
              onQueue={() => undefined}
              onRemovePhoto={(id) => setPhotos((current) => current.filter((photo) => photo.id !== id))}
              onSend={onSend}
              onSteer={() => undefined}
              onStop={() => undefined}
              onToggleFavorite={toggleFavorite}
              photos={photos}
              picker={picker}
              placeholder={copy.placeholder}
              queueLabel={copy.queue}
              sendLabel={copy.send}
              steerLabel={copy.steer}
              stopLabel={copy.stop}
              suggestionTitle={suggestions?.title}
              suggestions={suggestions?.rows}
              text={draft.text}
            />
          </View>
        }
      >
        <AppScreen contentFlex>
          <AtmosLogo />
          <InlineError message={draft.error} />
        </AppScreen>
      </ChatKeyboardFrame>
    </View>
  );
}
