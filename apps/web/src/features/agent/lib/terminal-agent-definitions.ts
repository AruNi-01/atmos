import terminalAgents from "@atmos/resources/terminal-agents/builtin_agents.json";

export type TerminalAgentPromptStrategy = "arg" | "stdin" | "prompt_flag" | "file_flag";

export interface TerminalAgentDefinition {
  id: string;
  label: string;
  cmd: string;
  params: string;
  promptStrategy?: TerminalAgentPromptStrategy;
  useEcho?: boolean;
}

const PROMPT_STRATEGIES = new Set<TerminalAgentPromptStrategy>([
  "arg",
  "stdin",
  "prompt_flag",
  "file_flag",
]);

function normalizePromptStrategy(value: string | undefined): TerminalAgentPromptStrategy | undefined {
  if (!value) return undefined;
  if (PROMPT_STRATEGIES.has(value as TerminalAgentPromptStrategy)) {
    return value as TerminalAgentPromptStrategy;
  }
  throw new Error(`Unsupported terminal agent promptStrategy: ${value}`);
}

export const TERMINAL_AGENT_DEFINITIONS: readonly TerminalAgentDefinition[] = terminalAgents.map((agent) => ({
  ...agent,
  promptStrategy: normalizePromptStrategy(agent.promptStrategy),
}));
