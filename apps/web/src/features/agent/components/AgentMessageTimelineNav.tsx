"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  PreviewRail,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  type PreviewRailItem,
  cn,
} from "@workspace/ui";
import { Bot, ChevronDown, ChevronUp, User } from "lucide-react";
import type { RegistryAgent } from "@/api/ws-api";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { assistantCopyText, textFromParts } from "@/features/agent/lib/agent-chat-events";
import {
  stepUserMessageIndex,
  TIMELINE_RAIL_MAX_RATIO,
  timelineRailItemSize,
} from "@/features/agent/lib/agent-chat-message-nav";
import { AgentIcon } from "./AgentIcon";

type TimelineAgent = Pick<RegistryAgent, "id" | "name"> & {
  icon?: string | null;
  install_method?: string;
};

interface AgentMessageTimelineNavProps {
  activeAgent: TimelineAgent | null;
  messages: AgentMessage[];
  userMessageIndices: number[];
  activeMessageIndex: number;
  onSelectMessage: (messageIndex: number) => void;
}

interface MessageTimelineItem {
  messageIndex: number;
  messageNumber: number;
  userText: string;
  assistantSummary: string;
  fileCount: number;
  isStreaming: boolean;
}

const TIMELINE_STEP_BUTTON_PX = 24;
const TIMELINE_CLUSTER_GAP_PX = 4;
const TIMELINE_RAIL_CHROME_PX = TIMELINE_STEP_BUTTON_PX * 2 + TIMELINE_CLUSTER_GAP_PX * 2;

function normalizePreviewText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getAssistantSummary(
  messages: AgentMessage[],
  startIndex: number,
  endIndex: number,
): { summary: string; isStreaming: boolean } {
  let summary = "";
  let isStreaming = false;

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant") continue;
    if (message.streaming) isStreaming = true;
    const text = normalizePreviewText(assistantCopyText(message));
    if (text) summary = text;
  }

  return { summary, isStreaming };
}

function buildTimelineItems(
  messages: AgentMessage[],
  userMessageIndices: number[],
  emptyUserMessage: string,
): MessageTimelineItem[] {
  return userMessageIndices.flatMap((messageIndex, navIndex) => {
    const message = messages[messageIndex];
    if (!message || message.role !== "user") return [];

    const nextUserIndex = userMessageIndices[navIndex + 1] ?? messages.length;
    const assistant = getAssistantSummary(messages, messageIndex, nextUserIndex);

    return [{
      messageIndex,
      messageNumber: navIndex + 1,
      userText: normalizePreviewText(textFromParts(message.parts)) || emptyUserMessage,
      assistantSummary: assistant.summary,
      fileCount: message.parts.filter((part) => part.type === "attachment").length,
      isStreaming: assistant.isStreaming,
    }];
  });
}

function getAttachmentLabel(count: number, t: ReturnType<typeof useTranslations>): string | null {
  if (count <= 0) return null;
  return count === 1 ? t("attachment.one") : t("attachment.other", { count });
}

export function AgentMessageTimelineNav({
  activeAgent,
  messages,
  userMessageIndices,
  activeMessageIndex,
  onSelectMessage,
}: AgentMessageTimelineNavProps) {
  const t = useTranslations("Agent.components.timelineNav");
  const items = React.useMemo(
    () => buildTimelineItems(messages, userMessageIndices, t("untitledMessage")),
    [messages, t, userMessageIndices],
  );

  const railItems = React.useMemo<PreviewRailItem[]>(
    () => items.map((item) => {
      const assistantSummary =
        item.assistantSummary || (item.isStreaming ? t("assistantResponding") : t("assistantPending"));
      return {
        id: String(item.messageIndex),
        label: item.userText,
        ariaLabel: t("jumpToMessage", {
          messageNumber: item.messageNumber,
          userText: item.userText,
        }),
        description: assistantSummary,
      };
    }),
    [items, t],
  );

  const previewById = React.useMemo(() => {
    const map = new Map<string, MessageTimelineItem>();
    for (const item of items) map.set(String(item.messageIndex), item);
    return map;
  }, [items]);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = React.useState(0);
  const showRail = items.length > 1;

  React.useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node || !showRail) return;
    const read = () => {
      const next = Math.round(node.getBoundingClientRect().height);
      setContainerHeight((current) => (current === next ? current : next));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [showRail]);

  if (!showRail) return null;

  const selectedNavIndex = items.findIndex((item) => item.messageIndex === activeMessageIndex);
  const activeItem = items[selectedNavIndex >= 0 ? selectedNavIndex : items.length - 1];
  const catalogIndex = activeItem?.messageIndex ?? activeMessageIndex;
  const itemSize = timelineRailItemSize(items.length, containerHeight, TIMELINE_RAIL_CHROME_PX);
  const railMaxHeight = containerHeight > 0
    ? Math.min(
        containerHeight * TIMELINE_RAIL_MAX_RATIO,
        Math.max(0, containerHeight - TIMELINE_RAIL_CHROME_PX),
      )
    : undefined;
  const previousIndex = stepUserMessageIndex(userMessageIndices, catalogIndex, "previous");
  const nextIndex = stepUserMessageIndex(userMessageIndices, catalogIndex, "next");

  return (
    <div
      ref={rootRef}
      className="agent-message-timeline-nav pointer-events-none absolute inset-y-0 left-0 z-20 flex w-8 min-h-0 items-center justify-center overflow-visible"
    >
      <TooltipProvider delayDuration={200}>
        <div className="pointer-events-auto flex min-h-0 flex-col items-center gap-1">
        <TimelineStepButton
          direction="previous"
          label={t("previousMessage")}
          disabled={previousIndex == null}
          onClick={() => {
            if (previousIndex == null) return;
            onSelectMessage(previousIndex);
          }}
        />
        <div
          className="min-h-0 w-4 max-h-[90%]"
          style={railMaxHeight != null ? { maxHeight: railMaxHeight } : undefined}
        >
          <PreviewRail
          items={railItems}
          label={t("navigation")}
          orientation="vertical"
          activeId={activeItem ? String(activeItem.messageIndex) : undefined}
          highlightActive
          previewSide="before"
          itemSize={itemSize}
          onItemSelect={(item) => onSelectMessage(Number(item.id))}
          className={cn(
            "relative flex h-fit w-4 min-h-0 items-center overflow-visible",
            "[&_[data-slot=preview-rail-tick]]:!origin-left [&_[data-slot=preview-rail-tick]]:rounded-full [&_[data-slot=preview-rail-tick]]:!w-3.5",
            "[&_[data-slot=preview-rail-item]]:!w-4 [&_[data-slot=preview-rail-item]]:justify-center",
          )}
          railClassName="w-4"
          previewContainerClassName="inset-y-0 left-full right-auto ml-3 w-[min(22rem,calc(100vw-4rem))]"
          previewClassName="w-full max-w-sm"
          renderPreview={(item) => {
            const row = previewById.get(item.id);
            if (!row) return null;
            const attachmentLabel = getAttachmentLabel(row.fileCount, t);
            const assistantSummary = typeof item.description === "string"
              ? item.description
              : row.assistantSummary;
            return (
              <div
                data-slot="preview-rail-card"
                className="rounded-2xl border border-border/70 bg-popover/95 p-4 shadow-xl backdrop-blur"
              >
                <div className="min-w-0 space-y-2.5">
                  <div className="flex min-w-0 items-start gap-2">
                    <User className="mt-0.5 size-4 shrink-0 text-foreground/80" aria-hidden="true" />
                    <p className="line-clamp-2 min-w-0 text-[13px] font-semibold leading-5 text-popover-foreground">
                      {item.label}
                    </p>
                  </div>
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground" aria-hidden="true">
                      {activeAgent ? (
                        <AgentIcon
                          registryId={activeAgent.id}
                          name={activeAgent.name}
                          size={16}
                          isCustom={activeAgent.install_method === "custom"}
                          registryIcon={activeAgent.icon}
                        />
                      ) : (
                        <Bot className="size-4" />
                      )}
                    </span>
                    <p className="line-clamp-3 min-w-0 text-[12px] leading-5 text-muted-foreground">
                      {assistantSummary}
                    </p>
                  </div>
                  {attachmentLabel ? (
                    <div className="pl-6 text-[11px] leading-4 text-muted-foreground/80">
                      {attachmentLabel}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          }}
          />
        </div>
        <TimelineStepButton
          direction="next"
          label={t("nextMessage")}
          disabled={nextIndex == null}
          onClick={() => {
            if (nextIndex == null) return;
            onSelectMessage(nextIndex);
          }}
        />
        </div>
      </TooltipProvider>
    </div>
  );
}

function TimelineStepButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: "previous" | "next";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "previous" ? ChevronUp : ChevronDown;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          data-agent-chat-timeline-step={direction}
          onClick={onClick}
          className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
