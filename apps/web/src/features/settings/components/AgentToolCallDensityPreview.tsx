"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Brain, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { getToolKindIcon } from "@/features/agent/lib/chat-helpers";
import { formatWorkDuration } from "@/features/agent/lib/agent-chat-timing";
import {
  formatToolGroupOverview,
  sentenceCaseOverview,
  type ToolOverviewKind,
} from "@/features/agent/lib/tool-group";
import type { ToolCallDensity } from "@/features/agent/lib/tool-call-density";
import { AgentToolDiffStats } from "@/features/agent/components/tool-results/AgentToolCard";

function ChromeRow({
  icon,
  children,
  chevron = false,
  open = false,
}: {
  icon: ReactNode;
  children: ReactNode;
  chevron?: boolean;
  open?: boolean;
}) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2 py-0.5 text-left text-sm leading-5 text-muted-foreground">
      <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 truncate">{children}</span>
      {chevron ? (
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground",
            open && "rotate-90",
          )}
        />
      ) : null}
    </div>
  );
}

function ResultSketch({ variant }: { variant: "diff" | "log" }) {
  if (variant === "diff") {
    return (
      <div className="space-y-1 rounded-md border border-border/70 px-2 py-1.5">
        <div className="h-1 w-[88%] rounded-full bg-red-500/55" />
        <div className="h-1 w-[64%] rounded-full bg-green-500/55" />
      </div>
    );
  }
  return (
    <div className="space-y-1 rounded-md border border-border/70 px-2 py-1.5">
      <div className="h-1 w-[92%] rounded-full bg-foreground/18" />
      <div className="h-1 w-[70%] rounded-full bg-foreground/12" />
      <div className="h-1 w-[46%] rounded-full bg-foreground/10" />
    </div>
  );
}

function ToolRow({
  kind,
  title,
  additions = 0,
  deletions = 0,
  open = false,
  sketch,
}: {
  kind: "read" | "search" | "edit" | "execute";
  title: string;
  additions?: number;
  deletions?: number;
  open?: boolean;
  sketch?: "diff" | "log";
}) {
  return (
    <div className="min-w-0">
      <div className="flex w-full min-w-0 items-center gap-2 py-0.5 text-left text-sm leading-5 text-muted-foreground">
        <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-3.5">
          {getToolKindIcon(kind)}
        </span>
        <span className="min-w-0 truncate">{title}</span>
        <AgentToolDiffStats additions={additions} deletions={deletions} />
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground",
            open && "rotate-90",
          )}
        />
      </div>
      {open && sketch ? (
        <div className="py-1 pl-6">
          <ResultSketch variant={sketch} />
        </div>
      ) : null}
    </div>
  );
}

function overviewLabel(
  counts: { kind: ToolOverviewKind; count: number }[],
  labelFor: (kind: ToolOverviewKind, count: number) => string,
  join: string,
  locale: string,
): string {
  return sentenceCaseOverview(formatToolGroupOverview(counts, labelFor, join), locale);
}

export function AgentToolCallDensityPreview({
  density,
}: {
  density: ToolCallDensity;
}) {
  const t = useTranslations("settings.codeAgentSection.toolCallDensity");
  const chatT = useTranslations("Agent.components.chatPanel");
  const groupT = useTranslations("Agent.components.toolGroup");
  const toolT = useTranslations("agent.chatHelpers.tool");
  const locale = useLocale();
  const labelFor = (kind: ToolOverviewKind, count: number) => groupT(kind, { count });
  const join = groupT("join");
  const thoughtLabel = chatT("thoughtFor", { duration: formatWorkDuration(2000) });
  const lookTools = overviewLabel(
    [
      { kind: "search", count: 1 },
      { kind: "read", count: 2 },
    ],
    labelFor,
    join,
    locale,
  );
  const writeTools = overviewLabel(
    [
      { kind: "write", count: 1 },
      { kind: "command", count: 1 },
    ],
    labelFor,
    join,
    locale,
  );
  const midText = t("sampleMidText");
  const answer = t("sampleAnswer");
  const expanded = density === "detailed";
  const tiles = (
    <>
      <ChromeRow icon={<Brain />} chevron>
        {thoughtLabel}
      </ChromeRow>
      <ToolRow kind="read" title={`${toolT("read")} math.ts`} />
      <ToolRow kind="read" title={`${toolT("read")} README.md`} />
      <ToolRow kind="search" title={`${toolT("search")} helper`} />
      <ToolRow
        kind="edit"
        title={`${toolT("edit")} math.ts`}
        additions={4}
        deletions={1}
        open={expanded}
        sketch={expanded ? "diff" : undefined}
      />
      <ToolRow
        kind="execute"
        title={`${toolT("execute")} npm test`}
        open={expanded}
        sketch={expanded ? "log" : undefined}
      />
    </>
  );

  return (
    <div className="min-w-0 space-y-2" aria-hidden="true">
      <p className="text-[11px] font-medium leading-4 text-foreground">
        {t(density)}
      </p>
      <div className="min-w-0 space-y-0.5">
        {density === "compact" ? (
          <>
            <ChromeRow icon={getToolKindIcon("search")} chevron>
              {lookTools}
            </ChromeRow>
            <p className="py-1 text-sm leading-5 text-foreground">{midText}</p>
            <ChromeRow icon={getToolKindIcon("edit")} chevron>
              {writeTools}
            </ChromeRow>
          </>
        ) : (
          tiles
        )}
        <p className="pt-1 text-sm leading-5 text-foreground">{answer}</p>
      </div>
    </div>
  );
}
