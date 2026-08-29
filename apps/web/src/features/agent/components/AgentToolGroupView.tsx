"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  TextShimmer,
} from "@workspace/ui";
import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { getToolKindIcon } from "@/features/agent/lib/chat-helpers";
import {
  countToolGroupOverview,
  formatToolGroupOverview,
  iconKindForOverview,
  sentenceCaseOverview,
  toolGroupHasRunning,
  type ToolOverviewKind,
} from "@/features/agent/lib/tool-group";
import { ToolView } from "./ToolView";
import { AgentStreamReveal } from "./AgentStreamReveal";
import { AgentTreeBranch } from "./AgentTreeBranch";

export function AgentToolGroupView({
  parts,
  autoOpen,
  registryId,
}: {
  parts: AgentToolCallPart[];
  autoOpen: boolean;
  registryId: string;
}) {
  const t = useTranslations("Agent.components.toolGroup");
  const locale = useLocale();
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const running = toolGroupHasRunning(parts);
  const open = userOpen ?? autoOpen;
  const shimmer = autoOpen || running;
  const [initialIds] = useState(() => new Set(
    parts.map((part) => part.tool_call_id).filter((id): id is string => Boolean(id)),
  ));

  const counts = useMemo(() => countToolGroupOverview(parts), [parts]);
  const overview = useMemo(() => {
    const raw = formatToolGroupOverview(
      counts,
      (kind: ToolOverviewKind, count: number) => t(kind, { count }),
      t("join"),
    );
    return sentenceCaseOverview(raw, locale);
  }, [counts, locale, t]);

  const leadKind = counts[0]?.kind;
  const icon = getToolKindIcon(leadKind ? iconKindForOverview(leadKind) : "other");

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => setUserOpen(next)}
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
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "motion-reduce:transition-none",
            open && "rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=open]:overflow-visible">
        <div className="relative">
          {parts.map((part, index) => {
            const itemKey = part.tool_call_id || `${part.name}-${index}`;
            const isNew = Boolean(part.tool_call_id) && !initialIds.has(part.tool_call_id);
            return (
              <AgentStreamReveal key={itemKey} enabled={autoOpen && isNew}>
                <AgentTreeBranch
                  isFirst={index === 0}
                  isLast={index === parts.length - 1}
                  animate={autoOpen && isNew}
                >
                  <ToolView part={part} registryId={registryId} surface="plain" />
                </AgentTreeBranch>
              </AgentStreamReveal>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
