"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  MessageResponse,
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  TextShimmer,
} from "@workspace/ui";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  formatWorkDuration,
  thinkingDurationSeconds,
} from "@/features/agent/lib/agent-chat-timing";
import { agentMessageLinkSafety } from "./AgentMessageLinkSafetyModal";
import { ToolView } from "./ToolView";

export function AgentPartView({
  part,
  index,
  parts,
  streaming,
  thinkingMs,
  registryId,
  reviewComponents,
}: {
  part: AgentPart;
  index: number;
  parts: AgentPart[];
  streaming: boolean;
  thinkingMs?: number | null;
  registryId: string;
  reviewComponents: { code: (props: ComponentPropsWithoutRef<"code"> & { node?: unknown }) => ReactNode };
}) {
  const t = useTranslations("Agent.components.chatPanel");
  if (part.type === "plan" || part.type === "attachment") return null;
  if (part.type === "text" && !part.text) return null;
  if (part.type === "thinking" && !part.text) return null;

  if (part.type === "text") {
    const isLastTextBlock = streaming && !parts.slice(index + 1).some((item) => item.type === "text");
    return (
      <MessageResponse
        parseIncompleteMarkdown
        animated={isLastTextBlock}
        caret={isLastTextBlock ? "block" : undefined}
        className="break-words"
        components={reviewComponents as never}
        linkSafety={agentMessageLinkSafety}
      >
        {part.text}
      </MessageResponse>
    );
  }

  if (part.type === "thinking") {
    const isCurrentlyThinking = streaming && index === parts.length - 1;
    const duration = isCurrentlyThinking ? undefined : thinkingDurationSeconds(thinkingMs);
    return (
      <Reasoning
        isStreaming={isCurrentlyThinking}
        defaultOpen={isCurrentlyThinking}
        duration={duration}
      >
        <ReasoningTrigger
          getThinkingMessage={(isStreaming, seconds) => {
            if (isStreaming || seconds === 0) {
              return <TextShimmer duration={1}>{t("thinking")}</TextShimmer>;
            }
            if (seconds === undefined) {
              return <p>{t("thoughtForFew")}</p>;
            }
            return <p>{t("thoughtFor", { duration: formatWorkDuration(seconds * 1000) })}</p>;
          }}
        />
        <ReasoningContent className="break-words prose-sm dark:prose-invert max-w-full overflow-hidden">
          {part.text}
        </ReasoningContent>
      </Reasoning>
    );
  }

  if (part.type === "error") {
    return (
      <MessageResponse className="break-words text-destructive">
        {part.message}
      </MessageResponse>
    );
  }

  if (part.type === "tool_call") {
    return <ToolView part={part} registryId={registryId} />;
  }

  return null;
}

export function isRenderedPart(part: AgentPart): boolean {
  if (part.type === "plan" || part.type === "attachment") return false;
  if (part.type === "text") return Boolean(part.text);
  if (part.type === "thinking") return Boolean(part.text);
  return part.type === "tool_call" || part.type === "error";
}
