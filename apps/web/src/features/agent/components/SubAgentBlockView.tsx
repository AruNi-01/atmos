"use client";

import { useTranslations } from "next-intl";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import { getToolKindIcon } from "@/features/agent/lib/chat-helpers";
import { AgentToolCard } from "./tool-results/AgentToolCard";
import { ToolView } from "./ToolView";

function subagentDescription(part: AgentToolCallPart): string {
  return part.params?.type === "subagent" ? part.params.description : "";
}

function subagentType(part: AgentToolCallPart): string | null {
  if (part.params?.type !== "subagent") return null;
  return part.params.agent_type?.trim() || null;
}

function resultText(part: AgentToolCallPart): string | null {
  if (part.result?.type === "text" && part.result.text.trim()) return part.result.text;
  if (part.result?.type === "error" && part.result.message.trim()) return part.result.message;
  return null;
}

export function SubAgentBlockView({
  part,
  defaultOpen = false,
  childTools = [],
  allTools = [],
}: {
  part: AgentToolCallPart;
  defaultOpen?: boolean;
  childTools?: AgentToolCallPart[];
  allTools?: AgentToolCallPart[];
}) {
  const t = useTranslations("Agent.components");
  const title = part.title || part.name;
  const description = subagentDescription(part);
  const agentType = subagentType(part);
  const markdown = resultText(part);
  const hasDetails = Boolean(description || agentType || markdown || childTools.length);

  return (
    <AgentToolCard
      variant="tool"
      icon={getToolKindIcon("subagent")}
      title={title}
      status={part.status ?? undefined}
      defaultOpen={defaultOpen}
    >
      {hasDetails ? (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-muted/10">
          {description || agentType ? (
            <div className="space-y-0.5 px-4 py-3">
              {description ? (
                <div className="text-xs text-muted-foreground">{description}</div>
              ) : null}
              {agentType ? (
                <div className="text-[11px] text-muted-foreground">{agentType}</div>
              ) : null}
            </div>
          ) : null}
          {markdown ? (
            <div className="p-4">
              <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("subAgent.resultTitle")}
                </div>
                <div className="max-h-72 overflow-auto">
                  <MarkdownRenderer className="prose-sm min-w-0 max-w-full overflow-hidden [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_.not-prose]:max-w-full [&_.not-prose]:overflow-x-auto">
                    {markdown}
                  </MarkdownRenderer>
                </div>
              </div>
            </div>
          ) : null}
          {childTools.length ? (
            <div className="space-y-2 border-t border-border/50 p-3">
              {childTools.map((child) => (
                <ToolView
                  key={child.tool_call_id}
                  part={child}
                  surface="plain"
                  defaultOpen={defaultOpen}
                  childTools={allTools}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </AgentToolCard>
  );
}
