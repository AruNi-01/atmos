"use client";

import { useTranslations } from "next-intl";
import { cn } from "@workspace/ui";

import { useAgentAttentionSummaryStore } from "@/features/agent/store/agent-attention-summary-store";
import {
  getAvailableSideChatRecords,
  hasOpenSideChatRecord,
  minimizedSideChatHasAttentionSummary,
  type LocalSideChatRecord,
} from "@/features/terminal/lib/terminal-side-chat";

import "./TerminalAgentInputOverlay.css";

export function TerminalSideChatDots({
  records,
  activeSideChatId,
  isStarting,
  onShow,
}: {
  records: LocalSideChatRecord[];
  activeSideChatId: string | null;
  isStarting: boolean;
  onShow: (sideChatId: string) => void;
}) {
  const t = useTranslations("terminal.sideChat");
  const hasMinimizedSummary = useAgentAttentionSummaryStore((state) =>
    minimizedSideChatHasAttentionSummary(records, (paneId) => state.panes.has(paneId)),
  );
  const availableRecords = getAvailableSideChatRecords(records);
  const hasOpenRecord = hasOpenSideChatRecord(availableRecords);
  const targetRecord =
    availableRecords.find((record) => record.side_chat_id === activeSideChatId) ??
    availableRecords.at(-1) ??
    null;
  const shouldShowIndicator = isStarting || Boolean(targetRecord && !hasOpenRecord);
  const sideChatIndicatorClassName = cn(
    "h-1 w-6 rounded-full shadow-[0_0_2px_rgba(0,0,0,0.16)]",
    hasMinimizedSummary
      ? "terminal-agent-input-trigger--summary terminal-agent-input-trigger--pulse"
      : "bg-cyan-600 dark:bg-cyan-300",
  );

  return (
    <span
      className={cn(
        "inline-flex items-end overflow-hidden transition-all duration-200 ease-out",
        shouldShowIndicator ? "h-3 w-8 opacity-100" : "h-0 w-0 opacity-0",
      )}
    >
      {isStarting ? (
        <span
          className="inline-flex h-3 w-8 items-end justify-center"
          title={t("starting")}
        >
          <span className={cn(sideChatIndicatorClassName, "animate-pulse")} />
        </span>
      ) : null}
      {!isStarting && targetRecord && !hasOpenRecord ? (
        <button
          type="button"
          className="group/side-dot inline-flex h-3 w-8 items-end justify-center"
          aria-label={t("show")}
          title={t("show")}
          data-attention-summary={hasMinimizedSummary ? "ready" : undefined}
          onClick={() => onShow(targetRecord.side_chat_id)}
        >
          <span
            className={cn(
              sideChatIndicatorClassName,
              !hasMinimizedSummary &&
                "group-hover/side-dot:bg-cyan-500 dark:group-hover/side-dot:bg-cyan-200",
            )}
          />
        </button>
      ) : null}
    </span>
  );
}
