"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  TextShimmer,
} from "@workspace/ui";
import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { getToolKindIcon } from "@/features/agent/lib/chat-helpers";
import {
  countToolGroupOverview,
  formatToolGroupOverview,
  iconKindForOverview,
  sentenceCaseOverview,
  toolCallPartsFromGroup,
  toolGroupHasRunning,
  type ToolOverviewKind,
} from "@/features/agent/lib/tool-group";
import { sumToolGroupDiffStats } from "@/features/agent/lib/tool-results/diff-stats";
import { useSequentialReveal } from "@/features/agent/hooks/use-sequential-reveal";
import { AgentTreeRevealProvider } from "./agent-tree-reveal-context";
import { useMarkAssistantProcessInspecting } from "./assistant-process-inspect-context";
import { AgentToolDiffStats } from "./tool-results/AgentToolCard";
import { AgentTreeBranch } from "./AgentTreeBranch";

export function AgentToolGroupView({
  parts,
  origIndexes,
  autoOpen,
  userOpen: userOpenProp,
  onUserOpenChange,
  renderPart,
}: {
  parts: AgentPart[];
  origIndexes: number[];
  autoOpen: boolean;
  /** Lifted user toggle so remount on turn settle keeps the group open. */
  userOpen?: boolean;
  onUserOpenChange?: (open: boolean) => void;
  renderPart: (part: AgentPart, origIndex: number) => ReactNode;
}) {
  const t = useTranslations("Agent.components.toolGroup");
  const locale = useLocale();
  const markInspecting = useMarkAssistantProcessInspecting();
  const [localUserOpen, setLocalUserOpen] = useState<boolean | null>(null);
  const userOpen = userOpenProp !== undefined ? userOpenProp : localUserOpen;
  const toolParts = useMemo(() => toolCallPartsFromGroup(parts), [parts]);
  const running = toolGroupHasRunning(parts);
  const open = userOpen ?? autoOpen;
  const shimmer = autoOpen || running;
  const shown = useSequentialReveal(parts.length, autoOpen);
  const visibleParts = parts.slice(0, shown);

  const counts = useMemo(() => countToolGroupOverview(toolParts), [toolParts]);
  const diffStats = useMemo(() => sumToolGroupDiffStats(toolParts), [toolParts]);
  const overview = useMemo(() => {
    if (counts.length === 0) {
      if (parts.some((part) => part.type === "thinking")) return t("thinking");
      return t("working");
    }
    const raw = formatToolGroupOverview(
      counts,
      (kind: ToolOverviewKind, count: number) => t(kind, { count }),
      t("join"),
    );
    return sentenceCaseOverview(raw, locale);
  }, [counts, locale, parts, t]);

  const leadKind = counts[0]?.kind;
  const icon = getToolKindIcon(leadKind ? iconKindForOverview(leadKind) : "other");

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        if (onUserOpenChange) {
          onUserOpenChange(next);
        } else {
          setLocalUserOpen(next);
        }
        if (next) markInspecting();
      }}
      className="min-w-0"
    >
      <CollapsibleTrigger
        aria-label={open ? t("collapseAria", { overview }) : t("expandAria", { overview })}
        className="group inline-flex min-w-0 max-w-full cursor-pointer items-center gap-2 py-0.5 text-left text-sm leading-5 text-muted-foreground hover:text-foreground"
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&>svg]:size-3.5">
          {icon}
        </span>
        <span className="min-w-0 truncate" title={overview}>
          {shimmer ? (
            <TextShimmer as="span" duration={1} className="text-sm">
              {overview}
            </TextShimmer>
          ) : (
            overview
          )}
        </span>
        <AgentToolDiffStats additions={diffStats.additions} deletions={diffStats.deletions} />
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "motion-reduce:transition-none",
            open && "rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=open]:overflow-visible">
        <AgentTreeRevealProvider reveal={autoOpen}>
          <div className="relative">
            {visibleParts.map((part, index) => {
              const origIndex = origIndexes[index] ?? index;
              const itemKey = part.type === "tool_call"
                ? part.tool_call_id || `${part.name}-${index}`
                : `${part.type}-${origIndex}`;
              return (
                <AgentTreeBranch
                  key={itemKey}
                  isFirst={index === 0}
                  isLast={index === visibleParts.length - 1}
                  animate={autoOpen}
                >
                  {renderPart(part, origIndex)}
                </AgentTreeBranch>
              );
            })}
          </div>
        </AgentTreeRevealProvider>
      </CollapsibleContent>
    </Collapsible>
  );
}
