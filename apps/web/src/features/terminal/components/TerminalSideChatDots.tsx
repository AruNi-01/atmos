"use client";

import { useTranslations } from "next-intl";
import { cn } from "@workspace/ui";

import {
  isSideChatClosing,
  isSideChatOpen,
  type LocalSideChatRecord,
} from "@/features/terminal/lib/terminal-side-chat";

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
  const availableRecords = records.filter((record) => !isSideChatClosing(record.status));
  const hasOpenRecord = availableRecords.some((record) => isSideChatOpen(record.status));
  const targetRecord =
    availableRecords.find((record) => record.side_chat_id === activeSideChatId) ??
    availableRecords.at(-1) ??
    null;
  const shouldShowIndicator = isStarting || Boolean(targetRecord && !hasOpenRecord);
  const sideChatIndicatorClassName =
    "h-1 w-6 rounded-full bg-cyan-600 shadow-[0_1px_4px_rgba(0,0,0,0.16)] dark:bg-cyan-300";

  return (
    <span
      className={cn(
        "inline-flex h-5 items-center overflow-hidden transition-all duration-200 ease-out",
        shouldShowIndicator ? "w-[38px] opacity-100" : "w-0 opacity-0",
      )}
    >
      {isStarting ? (
        <span
          className="ml-1.5 inline-flex h-5 w-8 items-center justify-center"
          title={t("starting")}
        >
          <span className={cn(sideChatIndicatorClassName, "animate-pulse")} />
        </span>
      ) : null}
      {targetRecord && !hasOpenRecord ? (
        <button
          type="button"
          className="group/side-dot ml-1.5 inline-flex h-5 w-8 items-center justify-center"
          aria-label={t("show")}
          title={t("show")}
          onClick={() => onShow(targetRecord.side_chat_id)}
        >
          <span
            className={cn(
              sideChatIndicatorClassName,
              "transition-colors duration-200 group-hover/side-dot:bg-cyan-500 dark:group-hover/side-dot:bg-cyan-200",
            )}
          />
        </button>
      ) : null}
    </span>
  );
}
