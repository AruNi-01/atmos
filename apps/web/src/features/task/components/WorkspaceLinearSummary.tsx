"use client";

import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { LinearIcon } from "@workspace/ui/components/icons/linear-icon";

export type WorkspaceLinearLinkSummary = {
  externalId: string;
  identifier: string;
  title: string;
  url: string;
};

type WorkspaceLinearSummaryProps = {
  links: WorkspaceLinearLinkSummary[];
  className?: string;
  /** Dense card footer vs roomier popover. */
  compact?: boolean;
};

/**
 * Linear issue row for workspace cards / info popover.
 * Place under PR / CI status. Click opens Linear in a new tab.
 */
export function WorkspaceLinearSummary({
  links,
  className,
  compact = false,
}: WorkspaceLinearSummaryProps) {
  const t = useTranslations("AppShell.chrome.workspaceContent");
  if (!links.length) return null;

  const primary = links[0]!;
  const overflow = links.length - 1;
  const label = `${primary.identifier} ${primary.title}`.trim();

  return (
    <TooltipProvider delayDuration={250}>
      <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
        {links.slice(0, compact ? 1 : 3).map((link) => {
          const text = compact
            ? link.identifier
            : `${link.identifier} ${link.title}`.trim();
          return (
            <Tooltip key={link.externalId}>
              <TooltipTrigger asChild>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted/70",
                    compact ? "shrink-0" : "w-full",
                  )}
                  aria-label={t("openLinearIssue", {
                    identifier: link.identifier,
                    title: link.title,
                  })}
                >
                  <LinearIcon className="size-3.5 shrink-0 text-muted-foreground" size={14} />
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {text}
                  </span>
                </a>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs break-words">
                {link.identifier}: {link.title}
              </TooltipContent>
            </Tooltip>
          );
        })}
        {overflow > 0 && compact ? (
          <span className="px-1.5 text-[10px] text-muted-foreground">
            +{overflow}
          </span>
        ) : null}
        {!compact && overflow > 2 ? (
          <span className="px-1.5 text-[10px] text-muted-foreground">
            +{overflow - 2}
          </span>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
