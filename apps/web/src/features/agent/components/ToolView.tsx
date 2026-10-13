"use client";

import React from "react";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { SubAgentBlockView } from "./SubAgentBlockView";
import { TerminalBlock } from "./TerminalBlock";
import { AgentToolResultBlock } from "./tool-results";
import { OtherToolCard } from "./tool-results/OtherToolCard";
import type { AgentToolSurface } from "./tool-results/AgentToolCard";
import { AgentToolExpandIdProvider } from "./agent-tool-expand-context";

export const ToolView = React.memo(function ToolView({
  part,
  surface = "plain",
  defaultOpen = false,
}: {
  part: AgentToolCallPart;
  surface?: AgentToolSurface;
  defaultOpen?: boolean;
  childTools?: AgentToolCallPart[];
}) {
  let body: React.ReactNode;
  switch (part.kind) {
    case "execute":
      body = <TerminalBlock part={part} surface={surface} defaultOpen={defaultOpen} />;
      break;
    case "subagent":
      body = <SubAgentBlockView part={part} />;
      break;
    case "other":
      body = <OtherToolCard part={part} surface={surface} defaultOpen={defaultOpen} />;
      break;
    default:
      body = <AgentToolResultBlock part={part} surface={surface} defaultOpen={defaultOpen} />;
      break;
  }
  return (
    <AgentToolExpandIdProvider toolCallId={part.tool_call_id}>
      {body}
    </AgentToolExpandIdProvider>
  );
});
