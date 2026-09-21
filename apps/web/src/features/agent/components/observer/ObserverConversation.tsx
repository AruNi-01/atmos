"use client";

import { Conversation, ConversationContent, cn } from "@workspace/ui";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { AgentChatCwdProvider } from "@/features/agent/components/agent-chat-cwd-context";
import { AgentPermissionHistoryProvider } from "@/features/agent/components/agent-permission-history-context";
import { AgentChatMessageView } from "@/features/agent/components/AgentChatMessageView";
import { AgentActivityIndicator } from "@/features/agent/components/AgentActivityIndicator";
import { deriveAgentActivity } from "@/features/agent/lib/chat-helpers";

export function ObserverConversation({
  messages,
  cwd,
  running,
}: {
  messages: AgentMessage[];
  cwd?: string | null;
  running?: boolean;
}) {
  const activity = deriveAgentActivity(messages, Boolean(running));
  return (
    <AgentChatCwdProvider cwd={cwd} projectOrWorkspacePath={cwd}>
      <AgentPermissionHistoryProvider>
        <Conversation
          className="min-h-0 h-full w-full min-w-0 flex-1 overflow-hidden select-text"
          initial="instant"
          resize="instant"
        >
          <ConversationContent
            data-canvas-selectable-text="true"
            className={cn("w-full min-w-0 gap-3 px-1 py-1")}
            scrollClassName="h-full min-h-0 w-full min-w-0 overflow-y-auto"
          >
            {messages.map((message, index) => (
              <div key={message.id} className="w-full min-w-0">
                <AgentChatMessageView message={message} index={index} />
                {activity.busy && index === messages.length - 1 ? (
                  <div
                    data-agent-chat-activity-status=""
                    className="mx-auto mt-2 w-[calc(100%-1rem)]"
                  >
                    <AgentActivityIndicator activity={activity} />
                  </div>
                ) : null}
              </div>
            ))}
          </ConversationContent>
        </Conversation>
      </AgentPermissionHistoryProvider>
    </AgentChatCwdProvider>
  );
}
