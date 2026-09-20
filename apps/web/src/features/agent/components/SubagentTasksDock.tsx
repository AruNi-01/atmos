"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  MatrixOrb,
} from "@workspace/ui";
import { BotMessageSquare, XCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import {
  formatSubagentTaskLine,
  subagentChildActivity,
  subagentTaskStatus,
} from "@/features/agent/lib/subagent-tasks";
import { AgentActivityStatusText } from "./AgentActivityIndicator";
import { ComposerCollapseGlyph } from "./composer-collapse-glyph";
import { useSubagentOverlay } from "./subagent-overlay-context";

function SubagentTaskGlyph({
  seed,
  status,
}: {
  seed: string;
  status: ReturnType<typeof subagentTaskStatus>;
}) {
  if (status === "failed") {
    return <XCircle className="size-4 text-destructive" />;
  }
  return (
    <MatrixOrb
      state={status === "running" ? "thinking" : "idle"}
      size={20}
      seed={seed}
      aria-hidden
    />
  );
}

export function SubagentTasksPanel({
  tools,
  messages,
}: {
  tools: AgentToolCallPart[];
  messages: AgentMessage[];
}) {
  const t = useTranslations("Agent.components.subagentTasks");
  const { selectedId, open } = useSubagentOverlay();
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

  if (tools.length === 0) return null;

  return (
    <div
      id="agent-subagent-tasks-panel"
      role="region"
      aria-label={t("panelAria")}
      data-agent-subagent-tasks-panel=""
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
            <ComposerCollapseGlyph icon={BotMessageSquare} collapsed={!isOpen} />
            <span className="min-w-0 text-sm font-medium text-foreground">{t("title")}</span>
            <span className="ml-auto shrink-0 text-sm text-muted-foreground">{countLabel}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="min-h-0 overflow-y-auto overscroll-contain motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none">
          <ul className="space-y-0.5">
            {tools.map((part) => {
              const status = subagentTaskStatus(part);
              const line = formatSubagentTaskLine(part, t("fallbackType"));
              const active = selectedId === part.tool_call_id;
              const activity = subagentChildActivity(messages, part.tool_call_id);
              return (
                <li key={part.tool_call_id}>
                  <button
                    type="button"
                    data-agent-subagent-task-row=""
                    aria-pressed={active}
                    aria-label={t("rowAria", { label: line })}
                    onClick={() => open(part.tool_call_id)}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted/60",
                      active && "bg-muted/60",
                    )}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center">
                      <SubagentTaskGlyph seed={part.tool_call_id} status={status} />
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span
                        className={cn(
                          "min-w-0 truncate text-sm",
                          status === "running"
                            ? "font-medium text-foreground"
                            : status === "failed"
                              ? "text-destructive"
                              : "text-muted-foreground",
                        )}
                      >
                        {line}
                      </span>
                      {activity.busy ? (
                        <AgentActivityStatusText
                          activity={activity}
                          className="min-w-0 shrink-0 text-muted-foreground"
                        />
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
