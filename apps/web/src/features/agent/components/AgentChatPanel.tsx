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
  instanceKey,
}: AgentChatPanelProps = {}) {
  const workspaceId = contextOverride?.workspaceId ?? null;
  const projectId = contextOverride?.projectId ?? null;
  const [conversationId, setConversationId] = useState<string | null>(null);
  const storageKey = `atmos.conversation:${instanceKey ?? `ws:${workspaceId ?? ""}:pj:${projectId ?? ""}`}`;

  useEffect(() => {
    let cancelled = false;
    const existing =
      typeof window !== "undefined" ? window.sessionStorage.getItem(storageKey) : null;
    const boot = async () => {
      if (existing) {
        try {
          await conversationApi.get(existing);
          if (!cancelled) setConversationId(existing);
          return;
        } catch {
          window.sessionStorage.removeItem(storageKey);
        }
      }
      const created = await conversationApi.create({
        provider_id: "claude",
        workspace_id: workspaceId,
        project_id: projectId,
      });
      window.sessionStorage.setItem(storageKey, created.id);
      if (!cancelled) setConversationId(created.id);
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [projectId, storageKey, workspaceId]);

  if (!conversationId) return null;
  return (
    <AgentChatWorkspace
      conversationId={conversationId}
      onOpenConversation={setConversationId}
    />
  );
}
