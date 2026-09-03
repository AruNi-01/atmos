"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui";
import { ChevronRight } from "lucide-react";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";

function subagentDescription(part: AgentToolCallPart): string {
  return part.params?.type === "subagent" ? part.params.description : "";
}

function resultText(part: AgentToolCallPart): string | null {
  if (part.result?.type === "text" && part.result.text.trim()) return part.result.text;
  if (part.result?.type === "error" && part.result.message.trim()) return part.result.message;
  return null;
}

export function SubAgentBlockView({ part }: { part: AgentToolCallPart }) {
  const t = useTranslations("Agent.components");
  const [isOpen, setIsOpen] = useState(true);
  const title = part.title || part.name;
  const description = subagentDescription(part);
  const markdown = resultText(part);
  const status = (part.status ?? "").toLowerCase();
  const statusLabel = status === "running"
    ? t("subAgent.status.running")
    : status === "failed"
      ? t("subAgent.status.failed")
      : t("subAgent.status.completed");
  const hasDetails = Boolean(description || markdown);

  if (!hasDetails) {
    return (
      <div className="w-full overflow-hidden rounded-xl border border-border/70 bg-muted/10 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3 text-left" data-tree-header>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold text-foreground">{title}</span>
          </div>
          <span className="shrink-0 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {statusLabel}
          </span>
        </div>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full overflow-hidden rounded-xl border border-border/70 bg-muted/10 shadow-sm">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 border-b border-border/50 px-4 py-3 text-left"
          data-tree-header
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            {description ? (
              <span className="truncate text-xs text-muted-foreground">{description}</span>
            ) : null}
          </div>
          <span className="shrink-0 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {statusLabel}
          </span>
          <ChevronRight className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-3 p-4">
          {markdown ? (
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
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
