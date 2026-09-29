import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgentChatPrefs, AgentChatPrefsSetRequest } from "@atmos/api-types/ws/dto/agent-chat";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { favoriteModelsFromUnknown, toggleFavoriteModel, type FavoriteModel } from "./model-picker";

export function useAgentFavorites() {
  const { client, state: wsState } = useMobileWs();
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const queryClient = useQueryClient();
  const queryKey = ["agent-chat-prefs", selectedServerId, wsState] as const;
  const query = useQuery({
    queryKey,
    enabled: Boolean(client && wsState === "open"),
    queryFn: () => wsActions.agentChatPrefsGet(client!),
  });
  const favorites = favoriteModelsFromUnknown(
    (query.data as { favorite_models?: unknown } | undefined)?.favorite_models,
  );
  const toggleFavorite = useCallback((entry: FavoriteModel) => {
    if (!client || wsState !== "open") return;
    const current = favoriteModelsFromUnknown(
      (queryClient.getQueryData<{ favorite_models?: unknown }>(queryKey))?.favorite_models,
    );
    const next = toggleFavoriteModel(current, entry);
    const favorite_models = next.map((item) => ({
      agent_id: item.agentId,
      model: item.model,
      label: item.label,
    }));
    queryClient.setQueryData(queryKey, (cached: AgentChatPrefs | undefined) => ({
      ...(cached ?? {}),
      favorite_models,
    }));
    const payload: AgentChatPrefsSetRequest = { favorite_models };
    void wsActions.agentChatPrefsSet(client, payload).catch(() => undefined);
  }, [client, queryClient, queryKey, wsState]);
  return { favorites, toggleFavorite };
}
