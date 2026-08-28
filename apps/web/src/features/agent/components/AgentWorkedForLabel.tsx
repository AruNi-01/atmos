"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@workspace/ui";
import { formatWorkDuration, formatWorkedAt } from "@/features/agent/lib/agent-chat-timing";

export function AgentWorkedForLabel({
  workedMs,
  completedAt,
}: {
  workedMs: number;
  completedAt?: string | null;
}) {
  const t = useTranslations("Agent.components.chatPanel");
  const locale = useLocale();
  const [hovered, setHovered] = useState(false);
  const duration = formatWorkDuration(workedMs);
  const clock = formatWorkedAt(completedAt, locale);
  const showClock = Boolean(hovered && clock);
  const durationLabel = t("workedFor", { duration });

  return (
    <span
      className="inline-grid min-h-6 items-center text-xs text-muted-foreground"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <span
        className={cn(
          "col-start-1 row-start-1 transition-opacity duration-200 ease-out motion-reduce:transition-none",
          showClock ? "opacity-0" : "opacity-100",
        )}
      >
        {durationLabel}
      </span>
      {clock ? (
        <span
          className={cn(
            "col-start-1 row-start-1 whitespace-nowrap transition-opacity duration-200 ease-out motion-reduce:transition-none",
            showClock ? "opacity-100" : "opacity-0",
          )}
        >
          {clock}
        </span>
      ) : null}
    </span>
  );
}
