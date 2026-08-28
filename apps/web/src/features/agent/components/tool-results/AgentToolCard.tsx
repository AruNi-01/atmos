"use client";

import React from "react";
import { ChevronRight, Loader2, XCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, getFileIconProps } from "@workspace/ui";
import { cn } from "@/shared/lib/utils";

export function AgentToolFileGlyph({
  path,
  className,
  isDir = false,
}: {
  path: string;
  className?: string;
  isDir?: boolean;
}) {
  const name = path.split(/[\\/]/).pop() || path;
  const iconProps = getFileIconProps({
    name,
    isDir,
    className: cn("size-4 shrink-0", className),
  });
  return (
    // eslint-disable-next-line @next/next/no-img-element -- file icons are local UI asset descriptors from getFileIconProps
    <img {...iconProps} alt="" aria-hidden="true" />
  );
}

export function AgentToolCard({
  icon,
  title,
  titleTooltip,
  meta,
  actions,
  status,
  defaultOpen = false,
  tone = "default",
  variant = "tool",
  children,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  titleTooltip?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  status?: string;
  defaultOpen?: boolean;
  tone?: "default" | "skill" | "error";
  variant?: "tool" | "file";
  children?: React.ReactNode;
}) {
  const running = (status ?? "").toLowerCase() === "running";
  const failed = (status ?? "").toLowerCase() === "failed" || tone === "error";

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn(
        "not-prose w-full overflow-hidden rounded-lg border shadow-sm",
        tone === "skill" && "border-primary/20 bg-primary/5",
        failed && tone !== "skill" && "border-destructive/40 bg-destructive/5",
        tone === "default" && !failed && "border-border/60 bg-muted/10",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1",
          tone === "skill" ? "bg-primary/5" : "bg-muted/30",
        )}
      >
        <CollapsibleTrigger
          className={cn(
            "group flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-2 text-left",
            "hover:bg-muted/50",
          )}
        >
          <span className="size-4 shrink-0 text-muted-foreground [&>svg]:size-4">
            {icon}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              variant === "file"
                ? "font-mono text-[12px] text-foreground/80"
                : "text-sm font-medium text-foreground",
            )}
            title={titleTooltip}
          >
            {title}
          </span>
          {meta ? <span className="shrink-0">{meta}</span> : null}
          {running ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : failed ? (
            <XCircle className="size-3.5 shrink-0 text-destructive" />
          ) : null}
          <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
        {actions ? <div className="shrink-0 pr-2">{actions}</div> : null}
      </div>
      <CollapsibleContent className="overflow-hidden">
        <div className="border-t border-border/40">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AgentToolDiffStats({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  if (additions <= 0 && deletions <= 0) return null;
  return (
    <span className="shrink-0 font-mono text-xs">
      {deletions > 0 ? <span className="text-red-500">-{deletions}</span> : null}
      {deletions > 0 && additions > 0 ? <span className="mx-1 text-muted-foreground">/</span> : null}
      {additions > 0 ? <span className="text-green-500">+{additions}</span> : null}
    </span>
  );
}
