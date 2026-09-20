"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AgentChatWorkspace } from "@/features/agent/components/AgentChatWorkspace";
import { ConnectionBootstrapper } from "@/app-shell/bootstrap/ConnectionBootstrapper";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";

export function AgentChatStandalonePage() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("chatId")?.trim() || null;
  const instanceKey = searchParams.get("instanceKey")?.trim() || null;
  const [chatId, setChatId] = useState<string | null>(requested);
  const connected = useWebSocketStore((state) => state.connectionState === "connected");

  useEffect(() => {
    if (requested) setChatId(requested);
  }, [requested]);

  return (
    <main className="h-dvh min-h-0 bg-background text-foreground">
      <ConnectionBootstrapper />
      {connected ? (
        <AgentChatWorkspace
          variant="standalone"
          chatId={chatId}
          instanceKey={instanceKey}
          onChatStarted={setChatId}
          onOpenChat={(id) => setChatId(id || null)}
        />
      ) : null}
    </main>
  );
}
