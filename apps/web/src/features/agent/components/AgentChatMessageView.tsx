"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Message, MessageContent, cn } from "@workspace/ui";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { assistantCopyText, textFromParts } from "@/features/agent/lib/agent-chat-events";
import { formatUserMessageTime } from "@/features/agent/lib/agent-chat-timing";
import {
  composerFileUrlFromPath,
  composerFilesFromAttachmentParts,
} from "@/features/agent/lib/agent-composer-attachment";
import { shouldShowAssistantTurnEndedChrome } from "@/features/agent/lib/chat-helpers";
import { getRuntimeApiConfig, httpBase } from "@/shared/lib/desktop-runtime";
import { MessageCopyButton } from "./CopyButtons";
import { AssistantMessageView } from "./AssistantMessageView";
import { AgentWorkedForLabel } from "./AgentWorkedForLabel";
import { AssistantTurnFileChanges } from "./AssistantTurnFileChanges";
import { MessageTurnUsageBadge } from "./UsageBadges";
import { AgentComposerAttachmentList } from "./AgentComposerAttachments";
import { UserMessageBody } from "./UserMessageBody";
import { SubagentTasksPanel } from "./SubagentTasksDock";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { isPendingUserEcho } from "@/features/agent/lib/agent-chat-pending-echo";
import "./user-message-meta.css";

export const AgentChatMessageView = React.memo(function AgentChatMessageView({
  message,
  index,
  inlineSubagentTools,
  subagentMessages,
}: {
  message: AgentMessage;
  index: number;
  inlineSubagentTools?: AgentToolCallPart[];
  subagentMessages?: AgentMessage[];
}) {
  const t = useTranslations("Agent.components.chatPanel");
  const locale = useLocale();
  const userText = textFromParts(message.parts);
  const userTime = formatUserMessageTime(message.created_at, locale);
  const assistantText = assistantCopyText(message);
  const hasAttachments = message.parts.some((part) => part.type === "attachment");
  const [fileApi, setFileApi] = useState<{
    base: string;
    token?: string | null;
  } | null>(null);

  useEffect(() => {
    if (!hasAttachments) return;
    let cancelled = false;
    void getRuntimeApiConfig()
      .then((cfg) => {
        if (cancelled) return;
        const base = httpBase(cfg);
        if (!base) return;
        setFileApi({ base, token: cfg.token });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hasAttachments]);

  const files = useMemo(
    () =>
      composerFilesFromAttachmentParts(
        message.parts,
        fileApi
          ? (path) => composerFileUrlFromPath(path, fileApi.base, fileApi.token)
          : undefined,
      ),
    [fileApi, message.parts],
  );

  return (
    <div
      data-message-index={index}
      data-agent-chat-message={message.id}
      data-agent-chat-message-role={message.role}
      className="w-full min-w-0"
    >
      {message.role === "user" ? (
        <div
          className={cn("group relative w-full", isPendingUserEcho(message) && "opacity-[0.65]")}
          data-user-message-chrome=""
          data-agent-chat-pending-echo={isPendingUserEcho(message) ? "" : undefined}
        >
          <Message from="user" className="gap-0">
            <MessageContent rounded="2xl">
              {files.length > 0 || userText ? (
                <UserMessageBody
                  text={userText}
                  forceCollapsible={files.length > 0}
                  leading={
                    files.length > 0
                      ? (collapsed) => (
                          <AgentComposerAttachmentList
                            files={files}
                            density={collapsed ? "compact" : "composer"}
                            className="px-0 pt-0"
                          />
                        )
                      : undefined
                  }
                />
              ) : null}
            </MessageContent>
            {userTime || userText.trim() ? (
              <div data-user-message-meta="" className="user-message-meta">
                <div className="user-message-meta-clip">
                  <div className="user-message-meta-row">
                    {userTime ? (
                      <time
                        dateTime={message.created_at}
                        className="user-message-meta-item whitespace-nowrap text-[11px] text-muted-foreground"
                      >
                        {userTime}
                      </time>
                    ) : null}
                    {userText.trim() ? (
                      <MessageCopyButton
                        text={userText}
                        ariaLabel={t("copy.userAria")}
                        title={t("copy.message")}
                        className="user-message-meta-item inline-flex size-6 items-center justify-center rounded-md p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </Message>
        </div>
      ) : (
        <div className="mx-auto w-[calc(100%-1rem)]">
          <Message from="assistant">
            <MessageContent>
              <AssistantMessageView message={message} />
              {shouldShowAssistantTurnEndedChrome(message, assistantText) ? (
                <div className="mt-2 flex items-center gap-2">
                  {assistantText ? (
                    <MessageCopyButton
                      text={assistantText}
                      ariaLabel={t("copy.assistantAria")}
                      title={t("copy.message")}
                      className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    />
                  ) : null}
                  {message.usage ? <MessageTurnUsageBadge usage={message.usage} /> : null}
                  {message.completed_at ? (
                    <AgentWorkedForLabel
                      reveal="timestamp"
                      workedMs={message.worked_ms ?? 0}
                      completedAt={message.completed_at}
                    />
                  ) : null}
                </div>
              ) : null}
            </MessageContent>
          </Message>
          <AssistantTurnFileChanges
            parts={message.parts}
            visible={shouldShowAssistantTurnEndedChrome(message, assistantText)}
          />
          {inlineSubagentTools && inlineSubagentTools.length > 0 && subagentMessages ? (
            <div className="mt-2">
              <SubagentTasksPanel
                tools={inlineSubagentTools}
                messages={subagentMessages}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
});
