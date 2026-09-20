"use client";

import React, { useMemo, type RefObject } from "react";
import { Conversation, ConversationContent } from "@workspace/ui";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { AgentChatCwdProvider } from "@/features/agent/components/agent-chat-cwd-context";
import { AgentPermissionHistoryProvider } from "@/features/agent/components/agent-permission-history-context";
import { AgentChatTranscriptList } from "@/features/agent/components/AgentChatTranscriptList";
import { AgentChatScrollToBottomButton } from "@/features/agent/components/AgentChatScrollToBottom";
import { createMessagesBelowCountStore } from "@/features/agent/lib/agent-chat-below-count";
import {
  AGENT_CHAT_SCROLL_CLASS,
  transcriptBottomPadStyle,
} from "@/features/agent/lib/agent-chat-transcript-window";

export function HostSessionTranscript({
  messages,
  cwd,
  registryId,
  transcriptRef,
  overlayHost = null,
  overlayPadPx,
  overlayPadShrinking,
  reduceOverlayPadMotion,
  subagentCardMode = "transcript",
  excludeSubagentIds,
  userMessageIndices,
  onActiveUserMessage,
  onUserScrollIntent,
  scrollToIndexRef,
  keepMessageIndexes,
  initialScrollIndex = null,
}: {
  messages: AgentMessage[];
  cwd: string;
  registryId: string;
  transcriptRef: RefObject<HTMLDivElement | null>;
  overlayHost?: HTMLElement | null;
  overlayPadPx: number;
  overlayPadShrinking: boolean;
  reduceOverlayPadMotion: boolean;
  subagentCardMode?: "live" | "transcript";
  excludeSubagentIds?: Iterable<string>;
  userMessageIndices: readonly number[];
  onActiveUserMessage: (index: number) => void;
  onUserScrollIntent?: () => void;
  scrollToIndexRef: RefObject<((index: number) => void) | null>;
  keepMessageIndexes?: readonly number[];
  initialScrollIndex?: number | null;
}) {
  const belowCountStore = useMemo(() => createMessagesBelowCountStore(), []);

  return (
    <AgentChatCwdProvider cwd={cwd} projectOrWorkspacePath={cwd}>
      <AgentPermissionHistoryProvider>
      <Conversation
        className="min-h-0 h-full overflow-hidden select-text"
        initial={initialScrollIndex == null ? "instant" : false}
        resize="instant"
      >
        <ConversationContent
          data-canvas-selectable-text="true"
          className="mx-auto w-full max-w-3xl select-text gap-3 px-3 py-4"
          scrollClassName={AGENT_CHAT_SCROLL_CLASS}
        >
          <AgentChatTranscriptList
            messages={messages}
            registryId={registryId}
            transcriptRef={transcriptRef}
            userMessageIndices={userMessageIndices}
            onActiveUserMessage={onActiveUserMessage}
            onUserScrollIntent={onUserScrollIntent}
            scrollToIndexRef={scrollToIndexRef}
            belowCountStore={belowCountStore}
            subagentCardMode={subagentCardMode}
            excludeSubagentIds={excludeSubagentIds}
            keepMessageIndexes={keepMessageIndexes}
            initialScrollIndex={initialScrollIndex}
            pinToEnd={initialScrollIndex == null}
          />
          <div
            className="shrink-0 overflow-hidden"
            style={transcriptBottomPadStyle(
              overlayPadPx,
              overlayPadShrinking,
              reduceOverlayPadMotion,
            )}
            data-agent-chat-transcript-bottom-pad=""
            aria-hidden="true"
          />
        </ConversationContent>
        <AgentChatScrollToBottomButton
          host={overlayHost}
          belowCountStore={belowCountStore}
        />
      </Conversation>
      </AgentPermissionHistoryProvider>
    </AgentChatCwdProvider>
  );
}
