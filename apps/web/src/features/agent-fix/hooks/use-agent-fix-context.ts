"use client";

import { useMemo } from "react";
import { useContextParams } from "@/shared/hooks/use-context-params";
import type { AgentFixContextRef } from "@/features/agent-fix/types";

export function useAgentFixContext(): AgentFixContextRef | null {
  const { currentView, effectiveContextId } = useContextParams();

  return useMemo<AgentFixContextRef | null>(() => {
    if (!effectiveContextId) return null;
    if (currentView === "workspace") {
      return { contextId: effectiveContextId, scope: "workspace" };
    }
    if (currentView === "project") {
      return { contextId: effectiveContextId, scope: "project" };
    }
    return null;
  }, [currentView, effectiveContextId]);
}
