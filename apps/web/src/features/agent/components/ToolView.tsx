"use client";

import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { SubAgentBlockView } from "./SubAgentBlockView";
import { TerminalBlock } from "./TerminalBlock";
import { AgentToolResultBlock } from "./tool-results";
import { OtherToolCard } from "./tool-results/OtherToolCard";
import type { AgentToolSurface } from "./tool-results/AgentToolCard";

export function ToolView({
  part,
  surface = "plain",
  defaultOpen = false,
  childTools = [],
}: {
  part: AgentToolCallPart;
  surface?: AgentToolSurface;
  defaultOpen?: boolean;
  childTools?: AgentToolCallPart[];
}) {
  const directChildTools = childTools.filter(
    (candidate) => candidate.parent_tool_call_id === part.tool_call_id,
  );
  switch (part.kind) {
    case "execute":
      return <TerminalBlock part={part} surface={surface} defaultOpen={defaultOpen} />;
    case "subagent":
      return (
        <SubAgentBlockView
          part={part}
          defaultOpen={defaultOpen}
          childTools={directChildTools}
          allTools={childTools}
        />
      );
    case "other":
      return <OtherToolCard part={part} surface={surface} defaultOpen={defaultOpen} />;
    default:
      return <AgentToolResultBlock part={part} surface={surface} defaultOpen={defaultOpen} />;
  }
}
