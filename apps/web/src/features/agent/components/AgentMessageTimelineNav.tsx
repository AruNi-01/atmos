"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  cn,
} from "@workspace/ui";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/ui/hover-card";
import { Bot, User } from "lucide-react";
import type { RegistryAgent } from "@/api/ws-api";
import {
  getAssistantCopyText,
  type ThreadEntry,
} from "@/features/agent/lib/agent/thread";
import { AgentIcon } from "./AgentIcon";

interface AgentMessageTimelineNavProps {
  activeAgent: RegistryAgent | null;
  entries: ThreadEntry[];
  userEntryIndices: number[];
  activeEntryIndex: number;
  onSelectEntry: (entryIndex: number) => void;
}

interface MessageTimelineItem {
  entryIndex: number;
  turnNumber: number;
  userText: string;
  assistantSummary: string;
  fileCount: number;
  isStreaming: boolean;
}

const timelineNavClassName = cn(
  "agent-message-timeline-nav absolute right-1 top-1/2 z-20 flex max-h-[min(62vh,420px)] -translate-y-1/2 flex-col items-end overflow-y-auto overflow-x-visible py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
  "[&_.agent-message-timeline-bar]:[--agent-message-timeline-scale-x:0.58]",
  "[&_.agent-message-timeline-bar]:[--agent-message-timeline-scale-y:1]",
  "[&_.agent-message-timeline-bar]:scale-x-[var(--agent-message-timeline-scale-x)]",
  "[&_.agent-message-timeline-bar]:scale-y-[var(--agent-message-timeline-scale-y)]",
  "[&_.agent-message-timeline-bar]:transition-[transform,background-color,opacity]",
  "[&_.agent-message-timeline-bar]:duration-200",
  "[&_.agent-message-timeline-bar]:ease-[cubic-bezier(0.22,1,0.36,1)]",
  "motion-reduce:[&_.agent-message-timeline-bar]:transition-none",
);

const timelineItemClassName = cn(
  "agent-message-timeline-item group flex h-4 w-9 items-center justify-end rounded-sm pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
);

function normalizePreviewText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getLastAssistantText(entry: Extract<ThreadEntry, { role: "assistant" }>): string {
  for (let index = entry.blocks.length - 1; index >= 0; index -= 1) {
    const block = entry.blocks[index];
    if (block.type !== "text") continue;

    const text = normalizePreviewText(block.content);
    if (text) return text;
  }

  return "";
}

function getAssistantSummary(
  entries: ThreadEntry[],
  startIndex: number,
  endIndex: number,
): { summary: string; isStreaming: boolean } {
  const fallbackParts: string[] = [];
  let finalText = "";
  let isStreaming = false;

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const entry = entries[index];
    if (!entry || entry.role !== "assistant") continue;
    if (entry.isStreaming) isStreaming = true;

    const text = getLastAssistantText(entry);
    if (text) finalText = text;

    const fallbackText = normalizePreviewText(getAssistantCopyText(entry));
    if (fallbackText) fallbackParts.push(fallbackText);
  }

  return {
    summary: finalText || fallbackParts.join(" "),
    isStreaming,
  };
}

function buildTimelineItems(
  entries: ThreadEntry[],
  userEntryIndices: number[],
  emptyUserMessage: string,
): MessageTimelineItem[] {
  return userEntryIndices.flatMap((entryIndex, navIndex) => {
    const entry = entries[entryIndex];
    if (!entry || entry.role !== "user") return [];

    const nextUserEntryIndex = userEntryIndices[navIndex + 1] ?? entries.length;
    const assistant = getAssistantSummary(entries, entryIndex, nextUserEntryIndex);
    const userText = normalizePreviewText(entry.content) || emptyUserMessage;

    return [{
      entryIndex,
      turnNumber: navIndex + 1,
      userText,
      assistantSummary: assistant.summary,
      fileCount: entry.files?.length ?? 0,
      isStreaming: assistant.isStreaming,
    }];
  });
}

function getAttachmentLabel(count: number, t: ReturnType<typeof useTranslations>): string | null {
  if (count <= 0) return null;
  return count === 1 ? t("attachment.one") : t("attachment.other", { count });
}

function getTimelineBarScale(navIndex: number, activeNavIndex: number, hoveredNavIndex: number | null) {
  if (hoveredNavIndex == null) {
    return {
      x: navIndex === activeNavIndex ? 1 : 0.58,
      y: 1,
    };
  }

  const distance = Math.abs(navIndex - hoveredNavIndex);
  if (distance === 0) return { x: 1.55, y: 1.35 };
  if (distance === 1) return { x: 1.22, y: 1.16 };
  if (distance === 2) return { x: 0.95, y: 1.08 };
  if (distance === 3) return { x: 0.78, y: 1 };
  return { x: 0.66, y: 1 };
}

export function AgentMessageTimelineNav({
  activeAgent,
  entries,
  userEntryIndices,
  activeEntryIndex,
  onSelectEntry,
}: AgentMessageTimelineNavProps) {
  const t = useTranslations("Agent.components.timelineNav");
  const [hoveredNavIndex, setHoveredNavIndex] = React.useState<number | null>(null);
  const items = React.useMemo(
    () => buildTimelineItems(entries, userEntryIndices, t("untitledMessage")),
    [entries, t, userEntryIndices],
  );

  if (items.length === 0) return null;

  const selectedNavIndex = items.findIndex((item) => item.entryIndex === activeEntryIndex);
  const activeNavIndex = selectedNavIndex >= 0 ? selectedNavIndex : items.length - 1;

  return (
    <div
      className={timelineNavClassName}
      aria-label={t("navigation")}
      onPointerLeave={() => setHoveredNavIndex(null)}
      role="navigation"
    >
      {items.map((item, navIndex) => {
        const isActive = navIndex === activeNavIndex;
        const isEmphasized = hoveredNavIndex == null ? isActive : hoveredNavIndex === navIndex;
        const scale = getTimelineBarScale(navIndex, activeNavIndex, hoveredNavIndex);
        const attachmentLabel = getAttachmentLabel(item.fileCount, t);
        const assistantSummary =
          item.assistantSummary || (item.isStreaming ? t("assistantResponding") : t("assistantPending"));

        return (
          <HoverCard key={item.entryIndex} closeDelay={120} openDelay={80}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                aria-current={isActive ? "true" : undefined}
                aria-label={t("jumpToMessage", { turnNumber: item.turnNumber, userText: item.userText })}
                className={timelineItemClassName}
                onClick={() => onSelectEntry(item.entryIndex)}
                onPointerEnter={() => setHoveredNavIndex(navIndex)}
                onPointerLeave={() => setHoveredNavIndex(null)}
              >
                <span
                  className={cn(
                    "agent-message-timeline-bar h-[3px] w-5 origin-right rounded-full",
                    isEmphasized
                      ? "bg-foreground opacity-90 [--agent-message-timeline-scale-x:1]"
                      : "bg-muted-foreground/35 opacity-75 group-hover:bg-foreground/75 group-hover:opacity-100",
                  )}
                  style={{
                    "--agent-message-timeline-scale-x": String(scale.x),
                    "--agent-message-timeline-scale-y": String(scale.y),
                  } as React.CSSProperties}
                />
              </button>
            </HoverCardTrigger>
            <HoverCardContent
              align="center"
              side="left"
              sideOffset={10}
              collisionPadding={12}
              className="w-[min(360px,calc(100vw-2rem))] rounded-xl border-border/70 bg-popover/95 p-4 shadow-xl backdrop-blur"
            >
              <div className="min-w-0 space-y-2.5">
                <div className="flex min-w-0 items-start gap-2">
                  <User className="mt-0.5 size-4 shrink-0 text-foreground/80" aria-hidden="true" />
                  <p className="line-clamp-2 min-w-0 text-[13px] font-semibold leading-5 text-popover-foreground">
                    {item.userText}
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
                {attachmentLabel && (
                  <div className="pl-6 text-[11px] leading-4 text-muted-foreground/80">
                    {attachmentLabel}
                  </div>
                )}
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </div>
  );
}
