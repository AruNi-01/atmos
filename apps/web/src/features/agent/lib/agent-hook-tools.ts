import type { AgentHookInstallReport } from "@/api/rest-api";

export const AGENT_HOOK_TOOL_KEYS = [
  "claude_code",
  "codex",
  "cursor",
  "gemini",
  "antigravity",
  "factory_droid",
  "kiro",
  "opencode",
  "ampcode",
  "pi",
  "hermes",
  "grok_build",
] as const;

export type AgentHookToolKey = (typeof AGENT_HOOK_TOOL_KEYS)[number];

export type AgentHookInstallSummary = {
  total: number;
  installedCount: number;
  missingKeys: AgentHookToolKey[];
  allInstalled: boolean;
};

export function summarizeAgentHookInstall(
  report: AgentHookInstallReport | null,
): AgentHookInstallSummary {
  const total = AGENT_HOOK_TOOL_KEYS.length;
  if (!report) {
    return {
      total,
      installedCount: 0,
      missingKeys: [],
      allInstalled: false,
    };
  }
  const missingKeys = AGENT_HOOK_TOOL_KEYS.filter((key) => !report[key].installed);
  return {
    total,
    installedCount: total - missingKeys.length,
    missingKeys,
    allInstalled: missingKeys.length === 0,
  };
}
