"use client";

import type { ToolCallBlock } from "@/features/agent/lib/agent/thread";
import { isTerminalCommand } from "../lib/chat-helpers";
import { unwrapVendorToolEnvelope } from "../lib/tool-results/parse-tool-result";
import { TerminalBlock } from "./TerminalBlock";
import { AgentToolResultBlock } from "./tool-results";

export function ToolOrSkillBlock(props: ToolCallBlock) {
  const resolved = unwrapVendorToolEnvelope(props.raw_input)?.toolType
    ?? unwrapVendorToolEnvelope(props.raw_output)?.toolType
    ?? props.tool;
  if (isTerminalCommand(resolved) || isTerminalCommand(props.tool)) {
    return <TerminalBlock {...props} />;
  }
  return <AgentToolResultBlock {...props} />;
}
