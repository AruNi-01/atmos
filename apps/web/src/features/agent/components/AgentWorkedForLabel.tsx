"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@workspace/ui";
import { formatWorkDuration, formatWorkedAt } from "@/features/agent/lib/agent-chat-timing";

export function AgentWorkedForLabel({
  workedMs,
  completedAt,
  reveal = "duration",
  className,
}: {
  workedMs: number;
  completedAt?: string | null;
  reveal?: "duration" | "timestamp";
  className?: string;
}) {
  const t = useTranslations("Agent.components.chatPanel");
  const locale = useLocale();
  const [hovered, setHovered] = useState(false);
  const duration = formatWorkDuration(workedMs);
  const clock = formatWorkedAt(completedAt, locale);
  const durationLabel = t("workedFor", { duration });
  const swapOnHover = reveal === "timestamp" && Boolean(clock);
  const showDuration = !swapOnHover || hovered;

  return (
    <span
      className={cn("inline-grid min-h-6 items-center text-xs text-muted-foreground", className)}
      onPointerEnter={swapOnHover ? () => setHovered(true) : undefined}
      onPointerLeave={swapOnHover ? () => setHovered(false) : undefined}
    >
      {swapOnHover ? (
        <span
          className={cn(
            "col-start-1 row-start-1 whitespace-nowrap transition-opacity duration-200 ease-out motion-reduce:transition-none",
            showDuration ? "opacity-0" : "opacity-100",
          )}
        >
          {clock}
        </span>
      ) : null}
      <span
        className={cn(
          "col-start-1 row-start-1 whitespace-nowrap transition-opacity duration-200 ease-out motion-reduce:transition-none",
          swapOnHover && !showDuration ? "opacity-0" : "opacity-100",
        )}
      >
        {durationLabel}
      </span>
    </span>
  );
}
