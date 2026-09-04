"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { wsRequest } from "@/api/ws/request";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type { TerminalAgentOptions } from "@atmos/api-types/ws/dto/settings";

export type {
  TerminalAgentOptions,
  TerminalAgentOption,
} from "@atmos/api-types/ws/dto/settings";

export function useTerminalAgentOptions(agentId: string, enabled: boolean) {
  const t = useTranslations("agent.modelCatalog");
  const [catalog, setCatalog] = React.useState<TerminalAgentOptions | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [requestError, setRequestError] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (refresh = false) => {
      if (!enabled || !agentId) {
        setCatalog(null);
        setLoading(false);
        setRequestError(null);
        return null;
      }

      setLoading(true);
      setRequestError(null);
      try {
        const nextCatalog = await wsRequest("terminal_agent_models_get", {
          agent_id: agentId,
          refresh,
        });
        setCatalog(nextCatalog);
        setLoading(nextCatalog.status === "probing");
        return nextCatalog;
      } catch (error) {
        const message = error instanceof Error ? error.message : t("loadFailed");
        setRequestError(message);
        setCatalog({
          agent_id: agentId,
          status: "error",
          models: [],
          message,
          source: "live",
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [agentId, enabled, t],
  );

  React.useEffect(() => {
    if (!enabled || !agentId) {
      setCatalog(null);
      setLoading(false);
      setRequestError(null);
      return;
    }
    void load(false);
  }, [agentId, enabled, load]);

  React.useEffect(() => {
    if (!enabled || !agentId) return;
    return useWebSocketStore.getState().onEvent("agent_options_updated", (payload) => {
      const update = payload as { agent_id?: string; options?: TerminalAgentOptions };
      if (!update.agent_id || update.agent_id !== agentId || !update.options) return;
      setCatalog(update.options);
      setLoading(update.options.status === "probing");
    });
  }, [agentId, enabled]);

  return {
    catalog,
    loading,
    requestError,
    reload: React.useCallback(() => load(true), [load]),
  };
}
