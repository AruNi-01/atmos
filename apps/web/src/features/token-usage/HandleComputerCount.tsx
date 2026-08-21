"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { useTranslations } from "next-intl";

export function HandleComputerCount({
  count,
  className,
}: {
  count?: number | null;
  className?: string;
}) {
  const t = useTranslations("appShell.tokenUsageDialog.computerScope");
  if (count == null || count <= 1) return null;
  const label = t("aggregatedTooltip", { count });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <sup
          className={cn(
            "relative z-20 ml-0.5 cursor-default align-super text-[0.65em] font-medium tabular-nums text-muted-foreground",
            className,
          )}
          aria-label={label}
        >
          {count}
        </sup>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
