"use client";

import type { TerminalAgentRunConfigInput } from "@/features/agent/lib/terminal-agent-run-config";

export type AgentFixContextScope = "workspace" | "project";

export interface AgentFixContextRef {
  contextId: string;
  scope: AgentFixContextScope;
}

export interface AgentFixPromptResult {
  prompt: string;
  terminalTabTitle?: string;
  terminalPaneLabel?: string;
  clipboardText?: string;
}

export interface AgentFixPromptSource {
  id: string;
  family: "diff" | "review_session" | "pr_review" | "ci_job" | "custom";
  context: AgentFixContextRef | null;
  label: string;
  description?: string;
  disabledReason?: string | null;
  getPrompt: () => Promise<AgentFixPromptResult | string> | AgentFixPromptResult | string;
  onCopied?: (result: AgentFixPromptResult) => void | Promise<void>;
  onStarted?: (result: AgentFixPromptResult) => void | Promise<void>;
  onError?: (error: unknown) => void;
}

export interface AgentFixAgentOption {
  id: string;
  label: string;
  command: string;
  launchCommand: string;
  iconType: "built-in" | "custom";
  description?: string | null;
  disabledReason?: string | null;
}

export interface ResolvedAgentFixLaunchRequest {
  context: AgentFixContextRef;
  prompt: string;
  agent: AgentFixAgentOption;
  runConfig: TerminalAgentRunConfigInput | null;
  terminalTabTitle: string;
  terminalPaneLabel: string;
}
