"use client";

import { AgentChatPanel } from "@/features/agent/components/AgentChatPanel";

export function AgentChatWorkspace({
  chatId,
  instanceKey,
  onChatStarted,
  onChatUpdated,
  onOpenChat,
  variant = "sidebar",
}: {
  chatId?: string | null;
  instanceKey?: string | null;
  onChatStarted?: (id: string, meta?: {
    title?: string | null;
    cwd?: string;
    providerId?: string | null;
  }) => void;
  onChatUpdated?: (id: string, meta: {
    title?: string | null;
    providerId?: string | null;
    cwd?: string;
  }) => void;
  onOpenChat?: (id: string) => void;
  variant?: "sidebar" | "standalone" | "center";
}) {
  const panel = (
    <AgentChatPanel
      variant={variant}
      instanceKey={instanceKey}
      chatId={chatId}
      onChatStarted={onChatStarted}
      onChatUpdated={onChatUpdated}
      onOpenChat={onOpenChat}
    />
  );
  if (variant !== "center") return panel;
  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
      {panel}
    </div>
  );
}
