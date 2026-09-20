"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@workspace/ui";
import { Goal } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { AgentMessage, GrokGoal } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentPlan } from "@/features/agent/lib/agent-chat-types";
import {
  GROK_IMPLEMENTER_ID,
  formatGrokElapsed,
  formatGrokTokens,
  grokGoalPhaseSections,
  grokGoalStatusKey,
} from "@/features/agent/lib/grok-chrome";
import { ComposerCollapseGlyph } from "../composer-collapse-glyph";
import { PlanBlockView } from "../PlanBlockView";
import { GrokChromeRoster } from "./GrokChromeRoster";

export function GrokGoalPanel({
  goal,
  messages,
  plan = null,
  defaultOpen = true,
}: {
  goal: GrokGoal;
  messages: AgentMessage[];
  plan?: AgentPlan | null;
  defaultOpen?: boolean;
}) {
  const t = useTranslations("Agent.components.grokGoal");
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [openPhases, setOpenPhases] = useState<Record<string, boolean>>({});
  const sections = grokGoalPhaseSections(goal, messages).map((section) => ({
    ...section,
    title: t(`phases.${section.id}`),
    agents: section.agents.map((agent) =>
      agent.tool_call_id === GROK_IMPLEMENTER_ID
        ? {
            ...agent,
            title: t("implementer"),
            params:
              agent.params?.type === "subagent"
                ? { ...agent.params, description: t("implementer") }
                : agent.params,
          }
        : agent,
    ),
  }));
  if (sections.length === 0 && goal.status === "cleared") return null;

  const headline = grokGoalStatusKey(goal);
  const statusLabel = headline.phase
    ? `${t(`status.${headline.status}`)} · ${t(`phaseLabel.${headline.phase}`)}`
    : t(`status.${headline.status}`);
  const tokens = formatGrokTokens(goal.tokens_used ?? 0);
  const elapsed = formatGrokElapsed(goal.elapsed_ms ?? 0);

  return (
    <div
      id="agent-grok-goal-panel"
      role="region"
      aria-label={t("panelAria")}
      data-agent-grok-goal-panel=""
      className="flex min-h-0 w-full flex-col overflow-hidden rounded-3xl border border-border bg-background p-3 shadow-none"
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="flex min-h-0 flex-col overflow-hidden">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-label={isOpen ? t("collapseAria") : t("expandAria")}
            className={cn(
              "group flex w-full shrink-0 cursor-pointer items-center gap-2 rounded-xl px-1 py-0.5 text-left hover:bg-muted/10",
              isOpen && "mb-2",
            )}
          >
            <ComposerCollapseGlyph icon={Goal} collapsed={!isOpen} />
            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {goal.objective?.trim() || t("title")}
            </span>
            <span className="ml-auto shrink-0 text-sm text-muted-foreground">{statusLabel}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="min-h-0 overflow-y-auto overscroll-contain motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none">
          <div
            data-agent-grok-goal-status=""
            className="mb-2 flex items-center gap-2 px-1 text-xs leading-5 text-muted-foreground"
          >
            <div className="min-w-0 truncate">{t("statusLine", { status: statusLabel })}</div>
            <div className="ml-auto shrink-0 whitespace-nowrap">
              {t("tokensLine", { tokens })} · {t("elapsedLine", { elapsed })}
            </div>
          </div>
          <GrokChromeRoster
            sections={sections}
            messages={messages}
            fallbackType={t("fallbackType")}
            rowAria={(label) => t("rowAria", { label })}
            openPhases={openPhases}
            onOpenPhase={(id, open) =>
              setOpenPhases((current) => ({ ...current, [id]: open }))
            }
            lead={(section) =>
              section.id === "implementing" && plan ? (
                <PlanBlockView plan={plan} embedded defaultOpen />
              ) : null
            }
            emptyHint={(section) => {
              if (section.agents.length > 0) return null;
              if (section.id === "verifying") return t("emptyVerify");
              if (section.id === "summarizing") return t("emptySummarize");
              return null;
            }}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
