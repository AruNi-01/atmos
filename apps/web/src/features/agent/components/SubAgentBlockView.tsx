"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui";
import { ChevronDown } from "lucide-react";
import type { AtmosSubAgentMessage } from "@/features/agent/lib/agent/subagent";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import { childToolToPart, ToolView } from "./ToolView";
import { AgentToolDiffResult } from "./tool-results";

function SubAgentLabelRow({
  labels,
}: {
  labels: AtmosSubAgentMessage["labels"];
}) {
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
      {labels.map((item, idx) => (
        <span
          key={`${item.key}-${item.value}-${idx}`}
          className="rounded-sm border border-border/60 bg-background px-2 py-1"
        >
          <span className="text-foreground/80">{item.key}</span>
          <span className="mx-1 text-muted-foreground/50">:</span>
          <span>{item.value}</span>
        </span>
      ))}
    </div>
  );
}

export function SubAgentBlockView({ message }: { message: AtmosSubAgentMessage }) {
  const t = useTranslations("Agent.components");
  const [isOpen, setIsOpen] = useState(true);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isToolUsesOpen, setIsToolUsesOpen] = useState(false);
  const toolUsesLabel = t("subAgent.toolUses", {
    count: message.childToolCalls.length,
  });
  const hasDetails = message.detailMode !== "status_only" && (
    !!message.prompt ||
    message.childToolCalls.length > 0 ||
    message.contentBlocks.length > 0 ||
    !!message.resultMarkdown ||
    message.labels.length > 0
  );
  const statusLabel = message.status === "running"
    ? t("subAgent.status.running")
    : message.status === "failed"
      ? t("subAgent.status.failed")
      : t("subAgent.status.completed");

  if (!hasDetails) {
    return (
      <div className="w-full overflow-hidden rounded-xl border border-border/70 bg-muted/10 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3 text-left">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold text-foreground">{message.title}</span>
            <span className="truncate text-xs text-muted-foreground">{message.description}</span>
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
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold text-foreground">{message.title}</span>
            <span className="truncate text-xs text-muted-foreground">{message.description}</span>
          </div>
          <span className="shrink-0 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {statusLabel}
          </span>
          <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-3 p-4">
          {message.prompt ? (
            <div className="overflow-hidden rounded-lg border border-border/60 bg-background/70">
              <button
                type="button"
                onClick={() => setIsPromptOpen((value) => !value)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left"
              >
                <span className="flex-1 text-sm font-medium text-muted-foreground">{t("subAgent.promptTitle")}</span>
                <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isPromptOpen ? "rotate-180" : ""}`} />
              </button>
              {isPromptOpen ? (
                <div className="border-t border-border/50 p-3">
                  <div className="max-h-56 overflow-auto">
                    <MarkdownRenderer className="prose-sm min-w-0 max-w-full overflow-hidden [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_.not-prose]:max-w-full [&_.not-prose]:overflow-x-auto">
                      {message.prompt}
                    </MarkdownRenderer>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {message.childToolCalls.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border/60 bg-background/70">
              <button
                type="button"
                onClick={() => setIsToolUsesOpen((value) => !value)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left"
              >
                <span className="flex-1 text-sm font-medium text-muted-foreground">{toolUsesLabel}</span>
                <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isToolUsesOpen ? "rotate-180" : ""}`} />
              </button>
              {isToolUsesOpen ? (
                <div className="space-y-3 border-t border-border/50 p-3">
                  {message.childToolCalls.map((toolCall) => (
                    <ToolView key={toolCall.tool_call_id} part={childToolToPart(toolCall)} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {message.contentBlocks.length > 0 ? (
            <div className="space-y-3">
              {message.contentBlocks.map((item, idx) => {
                if (item.type === "markdown") {
                  return (
                    <div key={`subagent-text-${idx}`} className="rounded-lg border border-border/60 bg-background/70 p-3">
                      <div className="max-h-72 overflow-auto">
                        <MarkdownRenderer className="prose-sm min-w-0 max-w-full overflow-hidden [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_.not-prose]:max-w-full [&_.not-prose]:overflow-x-auto">
                          {item.markdown}
                        </MarkdownRenderer>
                      </div>
                    </div>
                  );
                }
                if (item.type === "diff") {
                  return (
                    <AgentToolDiffResult
                      key={`subagent-diff-${idx}`}
                      path={item.path ?? t("toolResults.file")}
                      oldContent={item.oldContent ?? ""}
                      newContent={item.newContent}
                    />
                  );
                }
                return (
                  <div key={`subagent-terminal-${idx}`} className="rounded-lg border border-dashed border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                    {t("subAgent.terminalLabel", { terminalId: item.terminalId })}
                  </div>
                );
              })}
            </div>
          ) : null}

          {message.resultMarkdown ? (
            <div className="rounded-lg border border-border/60 bg-background/70 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {t("subAgent.resultTitle")}
              </div>
              <div className="max-h-72 overflow-auto">
                <MarkdownRenderer className="prose-sm min-w-0 max-w-full overflow-hidden [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_.not-prose]:max-w-full [&_.not-prose]:overflow-x-auto">
                  {message.resultMarkdown}
                </MarkdownRenderer>
              </div>
            </div>
          ) : null}

          {message.labels.length > 0 ? <SubAgentLabelRow labels={message.labels} /> : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
