"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AgentChatPanel } from "@/features/agent/components/AgentChatPanel";
import type { CurrentView } from "@/shared/hooks/use-context-params";

export function AgentChatStandalonePage() {
  const searchParams = useSearchParams();
  const contextOverride = useMemo(() => {
    const workspaceId = normalizeSearchValue(searchParams.get("workspaceId"));
    const projectId = normalizeSearchValue(searchParams.get("projectId"));
    const effectiveContextId = workspaceId ?? projectId;
    const currentView: CurrentView = workspaceId
      ? "workspace"
      : projectId
        ? "project"
        : "agents";

    return {
      workspaceId,
      projectId,
      effectiveContextId,
      currentView,
    };
  }, [searchParams]);

  return (
    <main className="h-dvh min-h-0 bg-background text-foreground">
      <AgentChatPanel
        variant="standalone"
        active
        publishStatus
        contextOverride={contextOverride}
      />
    </main>
  );
}

function normalizeSearchValue(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
