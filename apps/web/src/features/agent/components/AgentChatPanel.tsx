"use client";

import { useEffect, useState } from "react";
import { AgentChatWorkspace } from "@/features/agent/components/AgentChatWorkspace";
import { conversationApi } from "@/api/ws/conversation-api";

type ContextOverride = {
  workspaceId?: string | null;
  projectId?: string | null;
};

interface AgentChatPanelProps {
  variant?: "modal" | "sidebar" | "standalone";
  mode?: string;
  publishStatus?: boolean;
  active?: boolean;
  allowFullscreen?: boolean;
  contextOverride?: ContextOverride;
  transformPrompt?: (prompt: string) => string;
  instanceKey?: string | null;
  initialSessionBinding?: unknown;
  onSessionBindingChange?: unknown;
}

export function AgentChatPanel({
  contextOverride,
}: AgentChatPanelProps = {}) {
  const workspaceId = contextOverride?.workspaceId ?? null;
  const projectId = contextOverride?.projectId ?? null;
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void conversationApi
      .create({
        provider_id: "claude",
        workspace_id: workspaceId,
        project_id: projectId,
      })
      .then((created) => {
        if (!cancelled) setConversationId(created.id);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, workspaceId]);

  if (!conversationId) return null;
  return (
    <AgentChatWorkspace
      conversationId={conversationId}
      onOpenConversation={setConversationId}
    />
  );
}
