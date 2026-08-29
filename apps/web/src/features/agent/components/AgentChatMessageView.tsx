"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Message,
  MessageContent,
} from "@workspace/ui";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { assistantCopyText, textFromParts } from "@/features/agent/lib/agent-chat-events";
import { formatUserMessageTime } from "@/features/agent/lib/agent-chat-timing";
import { MessageCopyButton } from "./CopyButtons";
import { AssistantMessageView } from "./AssistantMessageView";
import { AgentWorkedForLabel } from "./AgentWorkedForLabel";
import { MessageTurnUsageBadge } from "./UsageBadges";

const messageVisibilityStyle = {
  contentVisibility: "auto",
  containIntrinsicSize: "0 240px",
} as React.CSSProperties;

export const AgentChatMessageView = React.memo(function AgentChatMessageView({
  message,
  index,
  registryId,
}: {
  message: AgentMessage;
  index: number;
  registryId: string;
}) {
  const t = useTranslations("Agent.components.chatPanel");
  const locale = useLocale();
  const userText = textFromParts(message.parts);
  const userTime = formatUserMessageTime(message.created_at, locale);
  const assistantText = assistantCopyText(message);
  const files = message.parts.flatMap((part) => {
    if (part.type !== "attachment" || !part.path) return [];
    return [{
      type: "file" as const,
      id: part.path,
      url: part.path,
      filename: part.name || part.path.split(/[\\/]/).at(-1) || part.path,
      mediaType: "application/octet-stream",
    }];
  });

  return (
    <div
      data-message-index={index}
      data-agent-chat-message={message.id}
      className="w-full min-w-0"
      style={messageVisibilityStyle}
    >
      {message.role === "user" ? (
        <div className="group relative">
          <Message from="user" className="gap-1">
            <MessageContent rounded="2xl">
              {files.length > 0 && (
                <Attachments variant="inline" className="mb-2">
                  {files.map((file) => (
                    <Attachment key={file.id} data={file}>
                      <AttachmentPreview />
                      <AttachmentRemove />
                    </Attachment>
                  ))}
                </Attachments>
              )}
              <div
                className="whitespace-pre-wrap"
                style={{ overflowWrap: "break-word", wordBreak: "normal" }}
              >
                {userText}
              </div>
            </MessageContent>
            {userTime || userText.trim() ? (
              <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {userTime ? (
                  <time
                    dateTime={message.created_at}
                    className="whitespace-nowrap text-[11px] text-muted-foreground"
                  >
                    {userTime}
                  </time>
                ) : null}
                {userText.trim() ? (
                  <MessageCopyButton
                    text={userText}
                    ariaLabel={t("copy.userAria")}
                    title={t("copy.message")}
                    className="inline-flex size-6 items-center justify-center rounded-md p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                  />
                ) : null}
              </div>
            ) : null}
          </Message>
        </div>
      ) : (
        <Message from="assistant">
          <MessageContent>
            <AssistantMessageView message={message} registryId={registryId} />
            {!message.streaming && (assistantText || (message.worked_ms != null && message.worked_ms > 0) || message.usage) ? (
              <div className="mt-2 flex items-center gap-2">
                {assistantText ? (
                  <MessageCopyButton
                    text={assistantText}
                    ariaLabel={t("copy.assistantAria")}
                    title={t("copy.message")}
                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  />
                ) : null}
                {message.worked_ms != null && message.worked_ms > 0 ? (
                  <AgentWorkedForLabel
                    workedMs={message.worked_ms}
                    completedAt={message.completed_at}
                  />
                ) : null}
                {message.usage ? <MessageTurnUsageBadge usage={message.usage} /> : null}
              </div>
            ) : null}
          </MessageContent>
        </Message>
      )}
    </div>
  );
});
