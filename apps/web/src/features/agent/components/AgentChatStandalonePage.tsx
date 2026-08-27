"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AgentChatWorkspace } from "@/features/agent/components/AgentChatWorkspace";
import { conversationApi } from "@/api/ws/conversation-api";
import { ConnectionBootstrapper } from "@/app-shell/bootstrap/ConnectionBootstrapper";

export function AgentChatStandalonePage() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("conversationId")?.trim() || null;
  const [conversationId, setConversationId] = useState<string | null>(requested);

  useEffect(() => {
    if (requested) {
      setConversationId(requested);
      return;
    }
    let cancelled = false;
    void conversationApi.create({ provider_id: "claude" }).then((created) => {
      if (!cancelled) setConversationId(created.id);
    });
    return () => {
      cancelled = true;
    };
  }, [requested]);

  if (!conversationId) {
    return (
      <main className="h-dvh min-h-0 bg-background">
        <ConnectionBootstrapper />
      </main>
    );
  }

  return (
    <main className="h-dvh min-h-0 bg-background text-foreground">
      <ConnectionBootstrapper />
      <AgentChatWorkspace
        conversationId={conversationId}
        onOpenConversation={setConversationId}
      />
    </main>
  );
}
