"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@workspace/ui";
import { Layers } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { AgentMessage, GrokWorkflow } from "@atmos/api-types/ws/dto/agent-chat";
import { grokWorkflowPhaseSections } from "@/features/agent/lib/grok-chrome";
import { subagentTaskStatus } from "@/features/agent/lib/subagent-tasks";
import { ComposerCollapseGlyph } from "../composer-collapse-glyph";
import { GrokChromeRoster } from "./GrokChromeRoster";

export function GrokWorkflowPanel({
  workflow,
  messages,
}: {
  workflow: GrokWorkflow;
  messages: AgentMessage[];
}) {
  const t = useTranslations("Agent.components.grokWorkflow");
  const [isOpen, setIsOpen] = useState(true);
  const [openPhases, setOpenPhases] = useState<Record<string, boolean>>({});
  const sections = grokWorkflowPhaseSections(workflow, messages);
  if (sections.length === 0 && workflow.status === "cleared") return null;

  const runningCount = sections.reduce(
    (count, section) =>
      count + section.agents.filter((agent) => subagentTaskStatus(agent) === "running").length,
    0,
  );
  const countLabel =
    runningCount > 0 ? t("runningCount", { count: runningCount }) : t("idleCount");
  const title = workflow.objective?.trim() || workflow.name?.trim() || t("title");

  return (
    <div
      id="agent-grok-workflow-panel"
      role="region"
      aria-label={t("panelAria")}
      data-agent-grok-workflow-panel=""
      className="w-full rounded-3xl border border-border bg-background p-3 shadow-none"
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-label={isOpen ? t("collapseAria") : t("expandAria")}
            className={cn(
              "group flex w-full cursor-pointer items-center gap-2 rounded-xl px-1 py-0.5 text-left hover:bg-muted/10",
              isOpen && "mb-2",
            )}
          >
            <ComposerCollapseGlyph icon={Layers} collapsed={!isOpen} />
            <span className="min-w-0 truncate text-sm font-medium text-foreground">{title}</span>
            <span className="ml-auto shrink-0 text-sm text-muted-foreground">{countLabel}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none">
          <GrokChromeRoster
            sections={sections}
            messages={messages}
            fallbackType={t("fallbackType")}
            rowAria={(label) => t("rowAria", { label })}
            openPhases={openPhases}
            onOpenPhase={(id, open) =>
              setOpenPhases((current) => ({ ...current, [id]: open }))
            }
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
