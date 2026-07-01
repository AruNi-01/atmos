import { Suspense } from "react";
import { AgentChatStandalonePage } from "@/features/agent/components/AgentChatStandalonePage";

export default function AgentChatPage() {
  return (
    <Suspense fallback={<main className="h-dvh min-h-0 bg-background text-foreground" />}>
      <AgentChatStandalonePage />
    </Suspense>
  );
}
