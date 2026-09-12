"use client";

import { Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from "@workspace/ui";

export function AutomationChip({
  compact = false,
  tooltip,
  className,
}: {
  compact?: boolean;
  tooltip?: string;
  className?: string;
}) {
  const t = useTranslations("automation.chip");
  const label = t("label");
  const tip = tooltip ?? label;
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground",
              compact && "border-transparent bg-transparent px-0",
              className,
            )}
            aria-label={tip}
          >
            <Timer className="size-3" />
            {compact ? null : <span>{label}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" align="center" sideOffset={8}>
          {tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
