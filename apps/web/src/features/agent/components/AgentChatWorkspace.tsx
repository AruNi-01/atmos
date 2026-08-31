"use client";

import { AgentChatPanel } from "@/features/agent/components/AgentChatPanel";

export function AgentChatWorkspace({
  chatId,
  instanceKey,
  paintContextId,
  resumeTranscript,
  onChatStarted,
  onChatUpdated,
  onOpenChat,
  variant = "sidebar",
}: {
  chatId?: string | null;
  instanceKey?: string | null;
  paintContextId?: string | null;
  resumeTranscript?: boolean;
  onChatStarted?: (id: string, meta?: {
    title?: string | null;
    cwd?: string;
    providerId?: string | null;
    hasMessages?: boolean;
  }) => void;
  onChatUpdated?: (id: string, meta: {
    title?: string | null;
    providerId?: string | null;
    cwd?: string;
    hasMessages?: boolean;
  }) => void;
  onOpenChat?: (id: string) => void;
  variant?: "sidebar" | "standalone" | "center";
}) {
  const panel = (
    <AgentChatPanel
      variant={variant}
      instanceKey={instanceKey}
      paintContextId={paintContextId}
      chatId={chatId}
      resumeTranscript={resumeTranscript}
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
