"use client";

import { AgentChatPanel } from "@/features/agent/components/AgentChatPanel";

export function AgentChatWorkspace({
  conversationId,
  instanceKey,
  onConversationStarted,
  onConversationUpdated,
  onOpenConversation,
  variant = "sidebar",
}: {
  conversationId?: string | null;
  instanceKey?: string | null;
  onConversationStarted?: (id: string, meta?: {
    title?: string | null;
    cwd?: string;
    providerId?: string | null;
  }) => void;
  onConversationUpdated?: (id: string, meta: {
    title?: string | null;
    providerId?: string | null;
    cwd?: string;
  }) => void;
  onOpenConversation?: (id: string) => void;
  variant?: "sidebar" | "standalone" | "center";
}) {
  const panel = (
    <AgentChatPanel
      variant={variant}
      instanceKey={instanceKey}
      conversationId={conversationId}
      onConversationStarted={onConversationStarted}
      onConversationUpdated={onConversationUpdated}
      onOpenConversation={onOpenConversation}
    />
  );
  if (variant !== "center") return panel;
  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
      {panel}
    </div>
  );
}
