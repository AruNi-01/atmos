"use client";

import type {
  AgentFixPromptResult,
  AgentFixPromptSource,
} from "@/features/agent-fix/types";

export function normalizeAgentFixPromptResult(
  value: AgentFixPromptResult | string,
): AgentFixPromptResult {
  if (typeof value === "string") {
    return { prompt: value };
  }
  return value;
}

export async function resolveAgentFixPrompt(
  source: AgentFixPromptSource,
): Promise<AgentFixPromptResult> {
  const disabledReason = source.disabledReason?.trim();
  if (disabledReason) {
    throw new Error(disabledReason);
  }
  const resolved = normalizeAgentFixPromptResult(await source.getPrompt());
  const prompt = resolved.prompt.trim();
  if (!prompt) {
    throw new Error("Agent Fix prompt is empty.");
  }
  return {
    ...resolved,
    prompt,
    clipboardText: resolved.clipboardText ?? prompt,
    terminalTabTitle: resolved.terminalTabTitle ?? source.label,
    terminalPaneLabel: resolved.terminalPaneLabel ?? "Agent Fix",
  };
}
