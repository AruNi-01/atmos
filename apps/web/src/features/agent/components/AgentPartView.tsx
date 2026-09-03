"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Box, Layers, MessageCircleMore, MessageCirclePlus, TriangleAlert } from "lucide-react";
import {
  MessageResponse,
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  TextShimmer,
} from "@workspace/ui";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { cn } from "@/shared/lib/utils";
import {
  formatWorkDuration,
  thinkingBlockDurationMs,
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
  reviewComponents,
}: {
  part: AgentPart;
  index: number;
  parts: AgentPart[];
  streaming: boolean;
  thinkingMs?: number | null;
  reviewComponents: {
    code: (props: ComponentPropsWithoutRef<"code"> & { node?: unknown }) => ReactNode;
    a?: (props: ComponentPropsWithoutRef<"a">) => ReactNode;
  };
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
        isAnimating={isLastTextBlock}
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
    const duration = isCurrentlyThinking
      ? undefined
      : thinkingDurationSeconds(thinkingBlockDurationMs(part, parts, thinkingMs));
    return (
      <Reasoning
        isStreaming={isCurrentlyThinking}
        defaultOpen={isCurrentlyThinking}
        duration={duration}
      >
        <ReasoningTrigger
          getThinkingMessage={(isStreaming, seconds) => {
            if (isStreaming || seconds === 0) {
              return <TextShimmer as="span" duration={1} className="text-sm">{t("thinking")}</TextShimmer>;
            }
            if (seconds === undefined) {
              return <span>{t("thoughtForFew")}</span>;
            }
            return <span>{t("thoughtFor", { duration: formatWorkDuration(seconds * 1000) })}</span>;
          }}
        />
        <ReasoningContent
          className="break-words prose-sm dark:prose-invert max-w-full min-w-0"
          components={reviewComponents as never}
        >
          {part.text}
        </ReasoningContent>
      </Reasoning>
    );
  }

  if (part.type === "error") {
    if (!part.message) return null;
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <span className="break-words">{part.message}</span>
      </div>
    );
  }

  if (part.type === "session_lifecycle") {
    return <SessionLifecycleView part={part} />;
  }

  if (part.type === "session_config_change") {
    return <SessionConfigChangeView part={part} />;
  }

  if (part.type === "session_hint") {
    return <SessionHintView part={part} />;
  }

  if (part.type === "tool_call") {
    return <ToolView part={part} />;
  }

  return null;
}

function SessionLifecycleView({
  part,
}: {
  part: Extract<AgentPart, { type: "session_lifecycle" }>;
}) {
  const t = useTranslations("Agent.components.chatPanel.session");
  const running = part.status === "running";
  const failed = part.status === "failed";
  const resume = part.action === "resume";
  const Icon = resume ? MessageCircleMore : MessageCirclePlus;
  const duration = part.duration_ms != null && part.duration_ms >= 1000
    ? formatWorkDuration(part.duration_ms)
    : null;
  const label = running
    ? t(resume ? "resuming" : "creating")
    : failed
      ? t(resume ? "resumeFailed" : "createFailed")
      : duration
        ? t(resume ? "resumedIn" : "createdIn", { duration })
        : t(resume ? "resumed" : "created");
  const failedDetail = failed ? part.error?.trim() : "";

  return (
    <div className="inline-flex min-w-0 max-w-full items-center gap-2 py-0.5 text-left text-sm leading-5 text-muted-foreground">
      <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-3.5">
        <Icon />
      </span>
      <span
        className={cn("min-w-0", failed ? "break-words text-destructive" : "truncate")}
        title={part.error ?? undefined}
      >
        {running ? (
          <TextShimmer as="span" duration={1} className="text-sm">
            {label}
          </TextShimmer>
        ) : failedDetail ? (
          `${label}: ${failedDetail}`
        ) : (
          label
        )}
      </span>
    </div>
  );
}

function SessionConfigChangeView({
  part,
}: {
  part: Extract<AgentPart, { type: "session_config_change" }>;
}) {
  const t = useTranslations("Agent.components.chatPanel.session");
  const model = part.model?.to?.trim() || "";
  const mode = part.mode?.to?.trim() || "";
  const modelFrom = part.model?.from?.trim() || "";
  const modeFrom = part.mode?.from?.trim() || "";
  const Icon = model && !mode ? Box : Layers;
  const label = model && mode
    ? t("switchedBoth", { model, mode })
    : model
      ? modelFrom
        ? t("switchedModelFrom", { from: modelFrom, to: model })
        : t("switchedModel", { to: model })
      : modeFrom
        ? t("switchedModeFrom", { from: modeFrom, to: mode })
        : t("switchedMode", { to: mode });

  return (
    <div className="inline-flex min-w-0 max-w-full items-center gap-2 py-0.5 text-left text-sm leading-5 text-muted-foreground">
      <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-3.5">
        <Icon />
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

function SessionHintView({
  part,
}: {
  part: Extract<AgentPart, { type: "session_hint" }>;
}) {
  const t = useTranslations("Agent.components.chatPanel.session");
  const label = part.kind === "model_switch_failed"
    ? t("hints.modelSwitchFailed")
    : part.kind === "mode_switch_failed"
      ? t("hints.modeSwitchFailed")
      : part.kind === "session_op_failed"
        ? t("hints.sessionOpFailed")
        : part.kind;
  const toneClass =
    part.tone === "warning"
      ? "text-amber-500"
      : part.tone === "error"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div className={cn("inline-flex min-w-0 max-w-full items-center gap-2 py-0.5 text-left text-sm leading-5", toneClass)}>
      <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-3.5">
        <TriangleAlert />
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

export function isRenderedPart(part: AgentPart): boolean {
  if (part.type === "plan" || part.type === "attachment") return false;
  if (part.type === "text") return Boolean(part.text);
  if (part.type === "thinking") return Boolean(part.text);
  if (part.type === "error") return Boolean(part.message);
  return part.type === "tool_call" || part.type === "session_lifecycle" || part.type === "session_config_change" || part.type === "session_hint";
}
