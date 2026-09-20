"use client";

import { useTranslations } from "next-intl";
import { TextShimmer, cn } from "@workspace/ui";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { getToolKindIcon } from "@/features/agent/lib/chat-helpers";
import { subagentTaskStatus, subagentTaskSummary } from "@/features/agent/lib/subagent-tasks";
import { useSubagentOverlay } from "./subagent-overlay-context";

export function SubAgentBlockView({
  part,
}: {
  part: AgentToolCallPart;
}) {
  const t = useTranslations("Agent.components");
  const { selectedId, open } = useSubagentOverlay();
  const title = t("subAgent.ranTitle", { name: subagentTaskSummary(part) });
  const status = subagentTaskStatus(part);
  const selected = selectedId === part.tool_call_id;

  return (
    <button
      type="button"
      data-agent-subagent-row=""
      aria-pressed={selected}
      onClick={() => open(part.tool_call_id)}
      className={cn(
        "group inline-flex min-w-0 max-w-full cursor-pointer items-center gap-2 py-0.5 text-left text-sm leading-5 text-muted-foreground hover:text-foreground",
        selected && "text-foreground",
        status === "failed" && "text-destructive",
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&>svg]:size-3.5">
        {getToolKindIcon("subagent")}
      </span>
      <span className="min-w-0 truncate">
        {status === "running" ? (
          <TextShimmer as="span" duration={1} className="text-sm">
            {title}
          </TextShimmer>
        ) : (
          title
        )}
      </span>
    </button>
  );
}
