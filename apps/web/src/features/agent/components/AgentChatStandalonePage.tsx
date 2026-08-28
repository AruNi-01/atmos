"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AgentChatWorkspace } from "@/features/agent/components/AgentChatWorkspace";
import { conversationApi } from "@/api/ws/conversation-api";
import { ConnectionBootstrapper } from "@/app-shell/bootstrap/ConnectionBootstrapper";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";

export function AgentChatStandalonePage() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("conversationId")?.trim() || null;
  const [conversationId, setConversationId] = useState<string | null>(requested);
  const connected = useWebSocketStore((state) => state.connectionState === "connected");

  useEffect(() => {
    if (requested) {
      setConversationId(requested);
      return;
    }
    if (!connected) return;
    let cancelled = false;
    void conversationApi.create({ provider_id: "claude" }).then((created) => {
      if (!cancelled) setConversationId(created.id);
    });
    return () => {
      cancelled = true;
    };
  }, [connected, requested]);

  return (
    <main className="h-dvh min-h-0 bg-background text-foreground">
      <ConnectionBootstrapper />
      {conversationId ? (
        <AgentChatWorkspace
          conversationId={conversationId}
          onOpenConversation={setConversationId}
        />
      ) : null}
    </main>
  );
}
