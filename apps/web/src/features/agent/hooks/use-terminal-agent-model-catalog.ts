"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { wsRequest } from "@/api/ws/request";

export interface TerminalAgentModelOption {
  id: string;
  label: string;
  group?: string | null;
  is_default?: boolean;
}

export interface TerminalAgentModelCatalog {
  agent_id: string;
  status: "ok" | "unsupported" | "auth_required" | "error";
  models: TerminalAgentModelOption[];
  message: string | null;
  source: "live" | "cache";
}

export function useTerminalAgentModelCatalog(agentId: string, enabled: boolean) {
  const t = useTranslations("agent.modelCatalog");
  const [catalog, setCatalog] = React.useState<TerminalAgentModelCatalog | null>(null);
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
        const nextCatalog = await wsRequest<TerminalAgentModelCatalog>("terminal_agent_models_get", {
          agent_id: agentId,
          refresh,
        });
        setCatalog(nextCatalog);
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

  return {
    catalog,
    loading,
    requestError,
    reload: React.useCallback(() => load(true), [load]),
  };
}
