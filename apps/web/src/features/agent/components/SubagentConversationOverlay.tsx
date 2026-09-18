"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Conversation, ConversationContent, cn } from "@workspace/ui";
import { X } from "lucide-react";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { AgentActivityIndicator } from "./AgentActivityIndicator";
import { AgentChatCwdProvider } from "./agent-chat-cwd-context";
import { AgentChatMessageView } from "./AgentChatMessageView";
import {
  formatSubagentTaskLine,
  messagesForSubagent,
  findSubagentToolCall,
  subagentChildActivity,
  subagentElapsedMs,
} from "@/features/agent/lib/subagent-tasks";

export function SubagentConversationOverlay({
  messages,
  toolCallId,
  cwd,
  elapsedMs,
  onClose,
}: {
  messages: AgentMessage[];
  toolCallId: string;
  cwd?: string | null;
  elapsedMs?: number;
  onClose: () => void;
}) {
  const t = useTranslations("Agent.components");
  const parent = findSubagentToolCall(messages, toolCallId);
  const projected = messagesForSubagent(messages, toolCallId);
  const activity = subagentChildActivity(messages, toolCallId);
  const clock = elapsedMs ?? subagentElapsedMs(projected);

  useEffect(() => {
    if (!parent) onClose();
  }, [parent, onClose]);

  if (!parent || !projected) return null;

  const headerLine = formatSubagentTaskLine(parent, t("subagentTasks.fallbackType"));

  return (
    <div
      data-agent-subagent-overlay=""
      role="region"
      aria-label={t("subAgent.overlayAria")}
      className="flex h-full min-h-0 w-full min-w-0 flex-1 select-text flex-col overflow-hidden rounded-3xl border border-border bg-background"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0 truncate text-sm font-medium text-foreground">
          {headerLine}
        </div>
        <button
          type="button"
          aria-label={t("subAgent.closeAria")}
          onClick={onClose}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <AgentChatCwdProvider cwd={cwd} projectOrWorkspacePath={cwd}>
        <Conversation
          key={toolCallId}
          className="min-h-0 h-full w-full min-w-0 flex-1 overflow-hidden"
          initial={false}
          resize="instant"
        >
          <ConversationContent
            data-canvas-selectable-text="true"
            className={cn("w-full min-w-0 gap-3 px-3 py-4")}
            scrollClassName="h-full min-h-0 w-full min-w-0 overflow-y-auto"
          >
            {projected.map((message, index) => (
              <div key={message.id} className="w-full min-w-0">
                <AgentChatMessageView
                  message={message}
                  index={index}
                />
                {activity.busy && index === projected.length - 1 ? (
                  <div
                    data-agent-chat-activity-status=""
                    className="mx-auto mt-2 w-[calc(100%-1rem)]"
                  >
                    <AgentActivityIndicator activity={activity} elapsedMs={clock} />
                  </div>
                ) : null}
              </div>
            ))}
          </ConversationContent>
        </Conversation>
      </AgentChatCwdProvider>
    </div>
  );
}
