"use client";

import React from "react";
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Message,
  MessageContent,
} from "@workspace/ui";
import { getAssistantCopyText, type ThreadEntry } from "@/features/agent/lib/agent/thread";
import { MessageCopyButton } from "./CopyButtons";
import { MessageTurnUsageBadge } from "./UsageBadges";
import { AssistantTurnView } from "./AssistantTurnView";

const entryVisibilityStyle = {
  contentVisibility: "auto",
  containIntrinsicSize: "0 240px",
} as React.CSSProperties;

export const AgentChatEntryView = React.memo(function AgentChatEntryView({
  entry,
  entryIndex,
  registryId,
}: {
  entry: ThreadEntry;
  entryIndex: number;
  registryId: string;
}) {
  return (
    <div
      data-entry-index={entryIndex}
      className="w-full min-w-0"
      style={entryVisibilityStyle}
    >
      {entry.role === "user" ? (
        <div className="group relative">
          <MessageCopyButton
            text={entry.content}
            ariaLabel="Copy user message"
            title="Copy message"
            className="absolute right-1 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background/80 p-0 text-muted-foreground opacity-0 transition-all hover:text-foreground group-hover:opacity-100"
          />
          <Message from="user">
            <MessageContent>
              {entry.files && entry.files.length > 0 && (
                <Attachments variant="inline" className="mb-2">
                  {entry.files.map((file) => (
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
                {entry.content}
              </div>
            </MessageContent>
          </Message>
        </div>
      ) : (
        <Message from="assistant">
          <MessageContent>
            <AssistantTurnView entry={entry} registryId={registryId} />
            {!entry.isStreaming && (
              <div className="mt-2 flex items-center gap-2">
                <MessageCopyButton
                  text={getAssistantCopyText(entry)}
                  ariaLabel="Copy current turn message"
                  title="Copy turn"
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                />
                {entry.usage && (
                  <MessageTurnUsageBadge usage={entry.usage} />
                )}
              </div>
            )}
          </MessageContent>
        </Message>
      )}
    </div>
  );
});
