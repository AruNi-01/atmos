"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Message, MessageContent } from "@workspace/ui";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { assistantCopyText, textFromParts } from "@/features/agent/lib/agent-chat-events";
import { formatUserMessageTime } from "@/features/agent/lib/agent-chat-timing";
import {
  composerFileUrlFromPath,
  composerFilesFromAttachmentParts,
} from "@/features/agent/lib/agent-composer-attachment";
import { getRuntimeApiConfig, httpBase } from "@/shared/lib/desktop-runtime";
import { MessageCopyButton } from "./CopyButtons";
import { AssistantMessageView } from "./AssistantMessageView";
import { AgentWorkedForLabel } from "./AgentWorkedForLabel";
import { AssistantTurnFileChanges } from "./AssistantTurnFileChanges";
import { MessageTurnUsageBadge } from "./UsageBadges";
import { AgentComposerAttachmentList } from "./AgentComposerAttachments";

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
      className="w-full min-w-0"
    >
      {message.role === "user" ? (
        <div className="group relative">
          <Message from="user" className="gap-1">
            <MessageContent rounded="2xl">
              {files.length > 0 ? (
                <AgentComposerAttachmentList
                  files={files}
                  density="compact"
                  className="px-0 pt-0"
                />
              ) : null}
              {userText ? (
                <div
                  className="whitespace-pre-wrap"
                  style={{ overflowWrap: "break-word", wordBreak: "normal" }}
                >
                  {userText}
                </div>
              ) : null}
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
        <>
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
                  {message.usage ? <MessageTurnUsageBadge usage={message.usage} /> : null}
                  {message.worked_ms != null && message.worked_ms > 0 ? (
                    <AgentWorkedForLabel
                      reveal="timestamp"
                      workedMs={message.worked_ms}
                      completedAt={message.completed_at}
                    />
                  ) : null}
                </div>
              ) : null}
            </MessageContent>
          </Message>
          <AssistantTurnFileChanges parts={message.parts} visible={!message.streaming} />
        </>
      )}
    </div>
  );
});
