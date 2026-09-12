"use client";

import { useCallback, useSyncExternalStore } from "react";
import { agentChatApi } from "@/api/ws/agent-chat-api";
import {
  favoriteModelsFromWire,
  favoriteModelsToWire,
  toggleFavoriteModel,
  type AgentFavoriteModel,
} from "@/features/agent/lib/agent-chat-favorites";
import {
  getFavoriteModelsServerSnapshot,
  getFavoriteModelsSnapshot,
  rememberFavoriteModels,
  subscribeFavoriteModels,
} from "@/features/agent/store/agent-composer-local-cache";

export function hydrateFavoriteModelsFromPrefs(prefs: { favorite_models?: unknown }) {
  rememberFavoriteModels(favoriteModelsFromWire(prefs.favorite_models));
}

export function useAgentChatFavorites() {
  const favoriteModels = useSyncExternalStore(
    subscribeFavoriteModels,
    getFavoriteModelsSnapshot,
    getFavoriteModelsServerSnapshot,
  );
  const toggleFavorite = useCallback((entry: AgentFavoriteModel) => {
    const next = toggleFavoriteModel(getFavoriteModelsSnapshot(), entry);
    rememberFavoriteModels(next);
    void agentChatApi
      .prefsSet({ favorite_models: favoriteModelsToWire(next) })
      .then((saved) => {
        rememberFavoriteModels(favoriteModelsFromWire(saved.favorite_models));
      })
      .catch(() => undefined);
  }, []);
  return { favoriteModels, toggleFavorite };
}
