"use client";

import { Collapsible, CollapsibleContent, CollapsibleTrigger, MatrixOrb } from "@workspace/ui";
import { XCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import {
  formatSubagentTaskLine,
  subagentChildActivity,
  subagentTaskStatus,
} from "@/features/agent/lib/subagent-tasks";
import type { GrokChromePhaseSection } from "@/features/agent/lib/grok-chrome";
import { AgentActivityStatusText } from "../AgentActivityIndicator";
import { useSubagentOverlay } from "../subagent-overlay-context";

function AgentGlyph({
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

export function GrokChromeRoster({
  sections,
  messages,
  fallbackType,
  rowAria,
  openPhases,
  onOpenPhase,
}: {
  sections: GrokChromePhaseSection[];
  messages: AgentMessage[];
  fallbackType: string;
  rowAria: (label: string) => string;
  openPhases: Record<string, boolean>;
  onOpenPhase: (id: string, open: boolean) => void;
}) {
  const { selectedId, open } = useSubagentOverlay();
  return (
    <div className="space-y-1">
      {sections.map((section) => {
        const phaseOpen = openPhases[section.id] ?? (section.state === "running" || section.state === "active");
        return (
          <Collapsible
            key={section.id}
            open={phaseOpen}
            onOpenChange={(next) => onOpenPhase(section.id, next)}
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                data-agent-grok-chrome-phase=""
                data-phase-id={section.id}
                aria-expanded={phaseOpen}
                className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-1 text-left hover:bg-muted/40"
              >
                <span className="text-sm font-medium text-foreground">{section.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {section.agents.length}
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="space-y-0.5 pb-1">
                {section.agents.map((part) => {
                  const status = subagentTaskStatus(part);
                  const line = formatSubagentTaskLine(part, fallbackType);
                  const active = selectedId === part.tool_call_id;
                  const activity = subagentChildActivity(messages, part.tool_call_id);
                  return (
                    <li key={part.tool_call_id}>
                      <button
                        type="button"
                        data-agent-grok-chrome-agent-row=""
                        data-agent-id={part.tool_call_id}
                        aria-pressed={active}
                        aria-label={rowAria(line)}
                        onClick={() => open(part.tool_call_id)}
                        className={cn(
                          "flex w-full min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted/60",
                          active && "bg-muted/60",
                        )}
                      >
                        <span className="flex size-5 shrink-0 items-center justify-center">
                          <AgentGlyph seed={part.tool_call_id} status={status} />
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
        );
      })}
    </div>
  );
}
