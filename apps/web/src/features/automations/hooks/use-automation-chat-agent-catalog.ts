"use client";

import * as React from "react";

import { agentChatApi } from "@/api/ws/agent-chat-api";
import type { AgentOptionsSnapshot } from "@/api/ws/agent-chat-api";
import { hydrateFavoriteModelsFromPrefs } from "@/features/agent/hooks/use-agent-chat-favorites";
import {
  isOptionsModelsLoading,
  probingOptionsSnapshot,
} from "@/features/agent/lib/agent-chat-thread";
import {
  readComposerLocalCache,
  rememberComposerOptions,
  shouldRetainExistingOptions,
} from "@/features/agent/store/agent-composer-local-cache";

export function useAutomationChatAgentCatalog(agentId: string, enabled: boolean) {
  const [catalog, setCatalog] = React.useState<AgentOptionsSnapshot | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return;
    void agentChatApi
      .prefsGet()
      .then((prefs) => hydrateFavoriteModelsFromPrefs(prefs))
      .catch(() => undefined);
  }, [enabled]);

  React.useEffect(() => {
    const id = agentId.trim();
    if (!enabled || !id) {
      setCatalog(null);
      return;
    }
    const cached = readComposerLocalCache().optionsByAgent[id];
    setCatalog(cached ?? probingOptionsSnapshot(id));
    let cancelled = false;
    void agentChatApi
      .optionsGet(id)
      .then((next) => {
        if (cancelled) return;
        rememberComposerOptions(next);
        setCatalog((current) =>
          shouldRetainExistingOptions(next, current) ? current : next,
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [agentId, enabled]);

  const reload = React.useCallback(() => {
    const id = agentId.trim();
    if (!enabled || !id) return;
    setRefreshing(true);
    void agentChatApi
      .optionsGet(id, true)
      .then((next) => {
        rememberComposerOptions(next);
        setCatalog((current) =>
          shouldRetainExistingOptions(next, current) ? current : next,
        );
      })
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [agentId, enabled]);

  return {
    catalog,
    loading: isOptionsModelsLoading(catalog, agentId),
    refreshing,
    reload,
  };
}
