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
}: {
  part: AgentToolCallPart;
  surface?: AgentToolSurface;
}) {
  switch (part.kind) {
    case "execute":
      return <TerminalBlock part={part} surface={surface} />;
    case "subagent":
      return <SubAgentBlockView part={part} />;
    case "other":
      return <OtherToolCard part={part} surface={surface} />;
    default:
      return <AgentToolResultBlock part={part} surface={surface} />;
  }
}
