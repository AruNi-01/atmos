"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ActivityIndicator,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  TextShimmer,
} from "@workspace/ui";
import { ChevronDown, CircleCheck, XCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import {
  formatSubagentTaskLine,
  subagentTaskStatus,
} from "@/features/agent/lib/subagent-tasks";
import { AgentChatCwdProvider } from "./agent-chat-cwd-context";
import { SubAgentBlockBody } from "./SubAgentBlockView";

function SubagentTaskGlyph({
  status,
}: {
  status: ReturnType<typeof subagentTaskStatus>;
}) {
  if (status === "running") {
    return <ActivityIndicator style="S1" size={16} />;
  }
  if (status === "failed") {
    return <XCircle className="size-4 text-destructive" />;
  }
  return <CircleCheck className="size-4 text-green-500" />;
}

export function SubagentTasksPanel({
  tools,
  allTools,
  cwd,
  selectedId,
  onSelect,
}: {
  tools: AgentToolCallPart[];
  allTools: AgentToolCallPart[];
  cwd?: string | null;
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
}) {
  const t = useTranslations("Agent.components.subagentTasks");
  const [isOpen, setIsOpen] = useState(true);
  const completedCount = tools.filter((part) => subagentTaskStatus(part) === "completed").length;
  const runningCount = tools.filter((part) => subagentTaskStatus(part) === "running").length;
  const totalCount = tools.length;
  const allCompleted = totalCount > 0 && completedCount === totalCount;
  const countLabel = allCompleted
    ? t("allDone")
    : runningCount > 0
      ? t("runningCount", { count: runningCount })
      : t("progressCount", { completed: completedCount, total: totalCount });
  const selected = tools.find((part) => part.tool_call_id === selectedId) ?? null;
  const directChildTools = selected
    ? allTools.filter((candidate) => candidate.parent_tool_call_id === selected.tool_call_id)
    : [];

  const toggleRow = useCallback(
    (id: string) => {
      onSelect(selectedId === id ? null : id);
    },
    [onSelect, selectedId],
  );

  if (tools.length === 0) return null;

  return (
    <div
      id="agent-subagent-tasks-panel"
      role="region"
      aria-label={t("panelAria")}
      data-agent-subagent-tasks-panel=""
      className="w-full rounded-3xl border border-border bg-background p-3 shadow-none"
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className={cn("flex items-center justify-between gap-2", isOpen && "mb-2")}>
          <div className="min-w-0 text-sm font-medium text-foreground">{t("title")}</div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-xs text-muted-foreground">{countLabel}</span>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                aria-label={isOpen ? t("collapseAria") : t("expandAria")}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform duration-200",
                    !isOpen && "-rotate-90",
                  )}
                  aria-hidden="true"
                />
              </button>
            </CollapsibleTrigger>
          </div>
        </div>
        <CollapsibleContent className="motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none">
          <ul className="space-y-0.5">
            {tools.map((part) => {
              const status = subagentTaskStatus(part);
              const line = formatSubagentTaskLine(part, t("fallbackType"));
              const active = selectedId === part.tool_call_id;
              return (
                <li key={part.tool_call_id}>
                  <button
                    type="button"
                    data-agent-subagent-task-row=""
                    aria-pressed={active}
                    aria-label={t("rowAria", { label: line })}
                    onClick={() => toggleRow(part.tool_call_id)}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted/60",
                      active && "bg-muted/60",
                    )}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      <SubagentTaskGlyph status={status} />
                    </span>
                    {status === "running" ? (
                      <TextShimmer
                        as="span"
                        duration={1.5}
                        className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                      >
                        {line}
                      </TextShimmer>
                    ) : (
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          status === "failed"
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {line}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {selected ? (
            <div className="mt-2 border-t border-border/70 pt-2">
              <AgentChatCwdProvider cwd={cwd} projectOrWorkspacePath={cwd}>
                <SubAgentBlockBody
                  part={selected}
                  defaultOpen
                  childTools={directChildTools}
                  allTools={allTools}
                />
              </AgentChatCwdProvider>
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
