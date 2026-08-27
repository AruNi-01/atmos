"use client";

import type { ToolCallBlock } from "@/features/agent/lib/agent/thread";
import { isTerminalCommand } from "../lib/chat-helpers";
import { TerminalBlock } from "./TerminalBlock";
import { AgentToolResultBlock } from "./tool-results";

export function ToolOrSkillBlock(props: ToolCallBlock) {
  if (isTerminalCommand(props.tool)) {
    return <TerminalBlock {...props} />;
  }
  return <AgentToolResultBlock {...props} />;
}
